import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, customers, sharedContainerBatches, bills, billItems } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, or } from 'drizzle-orm';
import { cargoKey } from '@/lib/pricing';

function getMatrixPrice(pm: any, warehouse: string | null, transport: string, cargo: string): number {
  const m = transport === '海运' ? 'sea' : 'land';
  const t = cargoKey(cargo);
  const key = m + '_' + t;
  if (warehouse && typeof pm[warehouse] === 'object' && pm[warehouse] !== null && typeof pm[warehouse][key] === 'number') return (pm[warehouse] as any)[key];
  return typeof pm[key] === 'number' ? pm[key] : 0;
}

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
    const batch = await db.select().from(sharedContainerBatches).where(eq(sharedContainerBatches.id, batchId)).get();
    if (!batch) return NextResponse.json({ error: '批次不存在' }, { status: 404 });

    const items = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.batchId, batchId)).all();
    if (items.length === 0) return NextResponse.json({ success: true, message: '无明细，无需重算' });

    // 已付款/付一部分账单对应的唛头，重算时整个跳过，绝不动已付款的货
    const paidRows = await db.select({ markId: billItems.markId }).from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .where(or(eq(bills.paymentStatus, '已付款'), eq(bills.paymentStatus, '付一部分'))).all();
    const paidMarks = new Set(paidRows.map(r => r.markId));
    let skipped = 0;

    await db.transaction((tx) => {
      const custCache = new Map<number, { pm: any; em: boolean }>();
      const getCust = (cid: number) => {
        let ci = custCache.get(cid);
        if (!ci) {
          const c = tx.select().from(customers).where(eq(customers.id, cid)).get();
          let pm: any = {};
          if (c?.defaultCurrency === 'THB') { if (c?.priceMatrixThb) try { pm = JSON.parse(c.priceMatrixThb); } catch {} }
          else if (c?.priceMatrix) { try { pm = JSON.parse(c.priceMatrix); } catch {} }
          ci = { pm, em: c?.enableMinVolume !== 0 };
          custCache.set(cid, ci);
        }
        return ci;
      };

      // 按 客户+运单 分组，口径与生成账单一致：客户价 × max(运单总体积, 低消)，落运单第一条、其余0
      const groups = new Map<string, typeof items>();
      items.forEach((item, idx) => {
        const ok = ((item as any).运单号 || '').trim() || `_${idx}`;
        const gk = `${item.customerId}__${ok}`;
        if (!groups.has(gk)) groups.set(gk, []);
        groups.get(gk)!.push(item);
      });

      for (const [, group] of groups) {
        const first = group[0];
        if (paidMarks.has(first.markId)) { skipped += group.length; continue; } // 已付款账单的货，跳过
        const ci = getCust(first.customerId);
        let orderVol = 0;
        for (const it of group) orderVol = Math.max(orderVol, Number(it.总体积) || 0);
        const transport = first.运输方式 || '海运';
        const cargo = first.货型 || '普货';
        const warehouse = (first as any).仓库 || null;
        const price = getMatrixPrice(ci.pm, warehouse, transport, cargo);
        const minVol = ci.em ? (transport === '海运' ? 0.5 : 0.3) : 0;
        const chargeVol = Math.max(orderVol, minVol);
        const receivable = Math.round(price * chargeVol * 100) / 100;
        tx.update(sharedContainerItems).set({ 客户应收: receivable }).where(eq(sharedContainerItems.id, first.id)).run();
        for (let i = 1; i < group.length; i++) {
          tx.update(sharedContainerItems).set({ 客户应收: 0 }).where(eq(sharedContainerItems.id, group[i].id)).run();
        }
      }
    });

    return NextResponse.json({ success: true, message: `已重算 ${items.length - skipped} 条明细${skipped > 0 ? `，跳过 ${skipped} 条已付款货物` : ''}` });
  } catch (error) {
    console.error('重算拼柜应收失败:', error);
    return NextResponse.json({ error: '重算失败' }, { status: 500 });
  }
}
