import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, marks, sharedContainerBatches, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { cargoKey, waybillReceivable } from '@/lib/pricing';

// 从价格矩阵取单价（新格式按仓库匹配，兼容旧格式平铺 key）
function getMatrixPrice(pm: any, warehouse: string | null, transport: string, cargo: string | null | undefined): number {
  const m = transport === '海运' ? 'sea' : 'land';
  const t = cargoKey(cargo);
  const key = m + '_' + t;
  if (warehouse && pm[warehouse] && typeof pm[warehouse][key] === 'number') return pm[warehouse][key];
  return typeof pm[key] === 'number' ? pm[key] : 0;
}

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const body = await request.json();
    const { batchId, items } = body;

    if (!batchId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 });
    }

    await db.transaction((tx) => {
      const custCache = new Map<number, { priceMatrix: any; enableMinVol: boolean }>();
      const getCust = (custId: number) => {
        let custInfo = custCache.get(custId);
        if (!custInfo) {
          const cust = tx.select().from(customers).where(eq(customers.id, custId)).get();
          let pm: any = {};
          if (cust?.defaultCurrency === 'THB') { if (cust?.priceMatrixThb) try { pm = JSON.parse(cust.priceMatrixThb); } catch {} }
          else if (cust?.priceMatrix) { try { pm = JSON.parse(cust.priceMatrix); } catch {} }
          custInfo = { priceMatrix: pm, enableMinVol: cust?.enableMinVolume !== 0 };
          custCache.set(custId, custInfo);
        }
        return custInfo;
      };

      // ── 第一步：解析每条明细的唛头→客户（含建唛/建客户），保持原顺序 ──
      const resolved: { raw: any; custId: number; markId: number }[] = [];
      for (const item of items) {
        const cleanMarkNo = (item.markNo || '').replace(/^BL-[\d]{6}-/, '').trim();
        const monthTag = item.monthTag || new Date().toISOString().substring(0, 7);

        let mark = tx.select().from(marks).where(and(eq(marks.markNo, cleanMarkNo), eq(marks.monthTag, monthTag))).get();
        if (!mark) {
          let newCustId = 0;
          if (cleanMarkNo) {
            const existingCust = tx.select().from(customers).where(eq(customers.name, cleanMarkNo)).get();
            if (existingCust) {
              newCustId = existingCust.id;
            } else {
              const result = tx.insert(customers).values({ name: cleanMarkNo }).run();
              newCustId = Number(result.lastInsertRowid);
            }
          }

          const result = tx.insert(marks).values({
            markNo: cleanMarkNo, customerId: newCustId, mode: '拼柜', monthTag,
          }).run();
          mark = tx.select().from(marks).where(eq(marks.id, Number(result.lastInsertRowid))).get();
          if (!mark) throw new Error(`创建唛头失败: ${item.markNo}`);
        }
        resolved.push({ raw: item, custId: mark.customerId, markId: mark.id });
      }

      // ── 第二步：按客户+运单分组算应收（口径与生成账单一致：
      //    客户价 × max(运单总体积, 低消保底 海0.5/陆0.3)，落运单第一条、其余0） ──
      const groups = new Map<string, typeof resolved>();
      resolved.forEach((r, idx) => {
        const ok = (r.raw.运单号 || '').trim() || `_${idx}`;
        const gk = `${r.custId}__${ok}`;
        if (!groups.has(gk)) groups.set(gk, []);
        groups.get(gk)!.push(r);
      });
      const recvMap = new Map<any, number>();
      const itemRecvMap = new Map<any, number>();
      for (const [, group] of groups) {
        const first = group[0];
        const custInfo = getCust(first.custId);
        const transport = first.raw.运输方式 || '海运';
        const warehouse = first.raw.仓库 || null;
        const minVol = custInfo.enableMinVol ? (transport === '海运' ? 0.5 : 0.3) : 0;
        // 每条按自己货型定价后加总(一个运单里货型可能不同)，低消按比例放大
        const receivable = waybillReceivable(group.map(r => r.raw), (cargo) => getMatrixPrice(custInfo.priceMatrix, warehouse, transport, cargo), minVol);
        recvMap.set(first.raw, receivable);
        for (let i = 1; i < group.length; i++) recvMap.set(group[i].raw, 0);
        // 每条明细单独算单项应收(每条自己货型×自己单项体积)
        for (const r of group) {
          const price = getMatrixPrice(custInfo.priceMatrix, warehouse, transport, r.raw.货型);
          itemRecvMap.set(r.raw, Math.round(price * (Number(r.raw.单项体积) || 0) * 100) / 100);
        }
      }

      // ── 第三步：插入明细，带上按运单算好的客户应收 ──
      for (const { raw: item, custId, markId } of resolved) {
        const receivable = recvMap.get(item) ?? 0;
        tx.insert(sharedContainerItems).values({
          batchId,
          markId,
          customerId: custId,
          品名: item.品名 || null,
          尺寸_长: item.尺寸_长 ?? null,
          尺寸_宽: item.尺寸_宽 ?? null,
          尺寸_高: item.尺寸_高 ?? null,
          单项体积: item.单项体积 ?? null,
          总体积: item.总体积,
          国内单号: item.国内单号 || null,
          单箱数量: item.单箱数量 ?? null,
          总重量: item.总重量 || null,
          箱数: item.箱数 ?? null,
          pcs数量: item.pcs数量 ?? null,
          仓库: item.仓库 || null,
          单项重量: item.单项重量 || null,
          备注: item.备注 || null,
          成本单价: item.成本单价 || 0,
          需支付总价: item.需支付总价 || 0,
          货型: item.货型 || null,
          运输方式: item.运输方式 || null,
          订单总价: item.订单总价 || 0,
          运单号: item.运单号 || '',
          客户应收: receivable,
          单项应收: itemRecvMap.get(item) ?? 0,
          cost_status: '待支出',
          ai_verified: item.ai_verified || 0,
          ai_verify_msg: item.ai_verify_msg || null,
        }).run();
      }

      tx.update(sharedContainerBatches).set({ status: '待审核' }).where(eq(sharedContainerBatches.id, batchId)).run();
    });

    return NextResponse.json({ success: true, itemCount: items.length });
  } catch (error) {
    console.error('导入拼柜数据失败:', error);
    return NextResponse.json({ error: '导入失败，已全部回滚，请检查数据后重试' }, { status: 500 });
  }
}
