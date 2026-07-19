import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, marks, sharedContainerBatches, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

// 从价格矩阵取单价（新格式按仓库匹配，兼容旧格式平铺 key）
function getMatrixPrice(pm: any, warehouse: string | null, transport: string, cargo: string): number {
  const m = transport === '海运' ? 'sea' : 'land';
  const t = cargo === '普货' ? 'regular' : cargo === '商检货' ? 'inspection' : 'sensitive';
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

        const custId = mark.customerId;

        let custInfo = custCache.get(custId);
        if (!custInfo) {
          const cust = tx.select().from(customers).where(eq(customers.id, custId)).get();
          let pm: any = {};
          if (cust?.defaultCurrency === 'THB') { if (cust?.priceMatrixThb) try { pm = JSON.parse(cust.priceMatrixThb); } catch {} }
          else if (cust?.priceMatrix) { try { pm = JSON.parse(cust.priceMatrix); } catch {} }
          custInfo = { priceMatrix: pm, enableMinVol: cust?.enableMinVolume !== 0 };
          custCache.set(custId, custInfo);
        }

        const transport = item.运输方式 || '海运';
        const cargo = item.货型 || '普货';
        const warehouse = item.仓库 || null;
        const unitPrice = getMatrixPrice(custInfo.priceMatrix, warehouse, transport, cargo);
        const vol = item.单箱体积 ?? item.总体积 ?? 0;
        const minVol = custInfo.enableMinVol ? (transport === '海运' ? 0.5 : 0.3) : 0;
        const chargeVol = Math.max(vol, minVol);
        const receivable = item.客户应收 ?? Math.round(unitPrice * chargeVol * 100) / 100;

        tx.insert(sharedContainerItems).values({
          batchId,
          markId: mark.id,
          customerId: custId,
          品名: item.品名 || null,
          尺寸_长: item.尺寸_长 ?? null,
          尺寸_宽: item.尺寸_宽 ?? null,
          尺寸_高: item.尺寸_高 ?? null,
          单箱体积: item.单箱体积 ?? null,
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
