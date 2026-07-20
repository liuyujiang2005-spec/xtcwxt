import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { loadingItems, marks, customers, loadingBatches, bills, billItems } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, and, or } from 'drizzle-orm';
import { cargoKey, waybillReceivable } from '@/lib/pricing';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const { id } = await params;
    const batchId = parseInt(id);
    const batch = await db.select().from(loadingBatches).where(eq(loadingBatches.id, batchId)).get();
    if (!batch) return NextResponse.json({ error: '批次不存在' }, { status: 404 });

    const items = await db.select().from(loadingItems).where(eq(loadingItems.batchId, batchId)).all();
    if (items.length === 0) return NextResponse.json({ success: true, message: '无明细，无需重算' });

    // 已付款/付一部分账单对应的唛头，重算时整个跳过，绝不动已付款的货
    const paidRows = await db.select({ markId: billItems.markId }).from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .where(or(eq(bills.paymentStatus, '已付款'), eq(bills.paymentStatus, '付一部分'))).all();
    const paidMarks = new Set(paidRows.map(r => r.markId));
    let skipped = 0;

    await db.transaction((tx) => {
      const custMap = new Map<number, { pm: any; em: boolean }>();

      const getCust = (cid: number) => {
        if (custMap.has(cid)) return custMap.get(cid)!;
        const c = tx.select().from(customers).where(eq(customers.id, cid)).get();
        let pm: any = {};
        if (c?.defaultCurrency === 'THB') { if (c?.priceMatrixThb) try { pm = JSON.parse(c.priceMatrixThb); } catch {} }
        else if (c?.priceMatrix) { try { pm = JSON.parse(c.priceMatrix); } catch {} }
        const info = { pm, em: c?.enableMinVolume !== 0 };
        custMap.set(cid, info);
        return info;
      };

      const getPrice = (pm: any, wh: string | null, transport: string, cargo: string | null | undefined): number => {
        const m = transport === '海运' ? 'sea' : 'land';
        const t = cargoKey(cargo);
        const key = m + '_' + t;
        if (wh && typeof pm[wh] === 'object' && pm[wh] !== null && typeof pm[wh][key] === 'number') return (pm[wh] as any)[key];
        return typeof pm[key] === 'number' ? pm[key] : 0;
      };

      // 按 客户+运单号 分组
      const groups = new Map<string, typeof items>();
      items.forEach((item, idx) => {
        const waybill = (item.运单号 || '').trim() || `_${idx}`;
        const gk = `${item.customerId}__${waybill}`;
        if (!groups.has(gk)) groups.set(gk, []);
        groups.get(gk)!.push(item);
      });

      for (const [, group] of groups) {
        const first = group[0];
        if (paidMarks.has(first.markId)) { skipped += group.length; continue; } // 已付款账单的货，跳过
        const { pm, em } = getCust(first.customerId);
        const transport = first.运输方式 || '海运';
        const warehouse = (first as any).仓库 || null;
        const minVol = em ? (transport === '海运' ? 0.5 : 0.3) : 0;
        // 每条按自己货型定价后加总(一个运单里货型可能不同)，低消按比例放大
        const receivable = waybillReceivable(group, (cargo) => getPrice(pm, warehouse, transport, cargo), minVol);

        // 每条明细单独算单项应收并落库
        for (const item of group) {
          const price = getPrice(pm, warehouse, transport, item.货型);
          const itemRecv = Math.round(price * (Number(item.单项体积) || 0) * 100) / 100;
          tx.update(loadingItems).set({ 单项应收: itemRecv }).where(eq(loadingItems.id, item.id)).run();
        }
        // 第一条设运单总应收，其余设 0
        tx.update(loadingItems).set({ 客户应收: receivable }).where(eq(loadingItems.id, first.id)).run();
        for (let i = 1; i < group.length; i++) {
          tx.update(loadingItems).set({ 客户应收: 0 }).where(eq(loadingItems.id, group[i].id)).run();
        }
      }
    });

    return NextResponse.json({ success: true, message: `已重算 ${items.length - skipped} 条明细${skipped > 0 ? `，跳过 ${skipped} 条已付款货物` : ''}` });
  } catch (error) {
    console.error('重算装柜应收失败:', error);
    return NextResponse.json({ error: '重算失败' }, { status: 500 });
  }
}
