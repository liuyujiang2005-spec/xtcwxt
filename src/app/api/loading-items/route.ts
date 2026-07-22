import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { loadingItems, marks, customers, loadingBatches } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { cargoKey, waybillReceivable, pickMatrixPrice } from '@/lib/pricing';

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

    // 🔴修复：用事务包裹整个循环，任何一条失败全部回滚
    await db.transaction((tx) => {
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
            markNo: cleanMarkNo,
            customerId: newCustId,
            mode: '装柜',
            monthTag,
          }).run();
          mark = tx.select().from(marks).where(eq(marks.id, Number(result.lastInsertRowid))).get();
          if (!mark) throw new Error(`创建唛头失败: ${cleanMarkNo}`);
        }
        resolved.push({ raw: item, custId: mark.customerId, markId: mark.id });
      }

      // ── 第二步：算每个运单的客户应收（口径与生成账单一致：
      //    客户价 × max(运单总体积, 低消保底 海0.5/陆0.3)，落在该运单第一条、其余0） ──
      const custCache = new Map<number, { pm: any; em: boolean }>();
      const getCust = (cid: number) => {
        if (custCache.has(cid)) return custCache.get(cid)!;
        const c = tx.select().from(customers).where(eq(customers.id, cid)).get();
        let pm: any = {};
        if (c?.defaultCurrency === 'THB') { if (c?.priceMatrixThb) try { pm = JSON.parse(c.priceMatrixThb); } catch {} }
        else if (c?.priceMatrix) { try { pm = JSON.parse(c.priceMatrix); } catch {} }
        const info = { pm, em: c?.enableMinVolume !== 0 };
        custCache.set(cid, info);
        return info;
      };
      const getPrice = (pm: any, wh: string | null, transport: string, cargo: string | null | undefined): number => {
        const key = (transport === '海运' ? 'sea' : 'land') + '_' + cargoKey(cargo);
        return pickMatrixPrice(pm, wh, key);
      };

      // 按 客户+运单号 分组（运单号为空的各自成组，不合并）
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
        // 总体积一律按该运单单项体积之和自算,不信源表那一列(源表可能填错)。覆盖回raw供应收计算和入库共用;没单项体积时兜底退回源表值。
        const sumVol = group.reduce((s, r) => s + (Number(r.raw.单项体积) || 0), 0);
        const totalVol = sumVol > 0 ? Math.round(sumVol * 1e6) / 1e6 : (Number(first.raw.总体积) || 0);
        for (const r of group) r.raw.总体积 = totalVol;
        const { pm, em } = getCust(first.custId);
        const transport = first.raw.运输方式 || '海运';
        const warehouse = first.raw.仓库 || null;
        const minVol = em ? (transport === '海运' ? 0.5 : 0.3) : 0;
        const receivable = waybillReceivable(group.map(r => r.raw), (cargo) => getPrice(pm, warehouse, transport, cargo), minVol);
        recvMap.set(first.raw, receivable);
        for (let i = 1; i < group.length; i++) recvMap.set(group[i].raw, 0);
        // 每条明细单独算单项应收
        for (const r of group) {
          const price = getPrice(pm, warehouse, transport, r.raw.货型);
          const itemRecv = Math.round(price * (Number(r.raw.单项体积) || 0) * 100) / 100;
          itemRecvMap.set(r.raw, itemRecv);
        }
      }

      // ── 第三步：插入明细，带上客户应收 ──
      for (const { raw: item, custId, markId } of resolved) {
        tx.insert(loadingItems).values({
          batchId,
          markId,
          customerId: custId,
          品名: item.品名 || null,
          尺寸_长: item.尺寸_长 || null,
          尺寸_宽: item.尺寸_宽 || null,
          尺寸_高: item.尺寸_高 || null,
          单项体积: item.单项体积 ?? null,
          总体积: item.总体积,
          国内单号: item.国内单号 || null,
          单箱数量: item.单箱数量 ?? null,
          总重量: item.总重量 || null,
          箱数: item.箱数 ?? null,
          pcs数量: item.pcs数量 ?? null,
          仓库: item.仓库 || null,
          运单号: item.运单号 || '',
          单价: item.单价 || 0,
          需支付总价: item.需支付总价 || 0,
           客户应收: recvMap.get(item) ?? 0,
           单项应收: itemRecvMap.get(item) ?? 0,
          货型: item.货型 || '普货',
          运输方式: item.运输方式 || '海运',
          payment_status: '待支付',
        }).run();
      }

      tx.update(loadingBatches).set({ status: '待审核' }).where(eq(loadingBatches.id, batchId)).run();
    });

    return NextResponse.json({ success: true, itemCount: items.length });
  } catch (error) {
    console.error('导入装柜数据失败:', error);
    return NextResponse.json({ error: '导入失败，已全部回滚，请检查数据后重试' }, { status: 500 });
  }
}
