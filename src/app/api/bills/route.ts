import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { bills, billItems, marks, sharedContainerItems, loadingItems, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

export async function PATCH(request: NextRequest) {
  const st = request.cookies.get('session')?.value;
  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const u = await validateSession(st);
  if (!u) return NextResponse.json({ error: '登录过期' }, { status: 401 });
  if (u.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const body = await request.json();
  if (body.recalculate && body.id) {
    const recalcId: number = body.id;

    // ── 读取阶段（事务外） ──
    const bill = await db.select().from(bills).where(eq(bills.id, recalcId)).get();
    if (!bill) return NextResponse.json({ error: '账单不存在' }, { status: 404 });

    const customer = await db.select().from(customers).where(eq(customers.id, bill.customerId)).get();
    let pm: any = {};
    if (customer?.defaultCurrency === 'THB') {
      if (customer?.priceMatrixThb) try { pm = JSON.parse(customer.priceMatrixThb); } catch {}
    } else if (customer?.priceMatrix) {
      try { pm = JSON.parse(customer.priceMatrix); } catch {} }
    const em = customer?.enableMinVolume !== 0;
    const minVol = (transport: string): number => { if (!em) return 0; return transport === '海运' ? 0.5 : 0.3; };

    const getPrice = (wh: string | null, transport: string, cargo: string): number => {
      const m = transport === '海运' ? 'sea' : 'land';
      const t = (cargo || '普货') === '普货' ? 'regular' : cargo === '商检货' ? 'inspection' : 'sensitive';
      const key = m + '_' + t;
      if (wh && typeof pm[wh] === 'object' && pm[wh] !== null) {
        if (typeof (pm[wh] as any)[key] === 'number') return (pm[wh] as any)[key];
      }
      return typeof pm[key] === 'number' ? pm[key] : 0;
    };

    const bits = await db.select().from(billItems).where(eq(billItems.billId, recalcId)).all();
    const markIds = [...new Set(bits.map(i => i.markId))];

    // 预取全部明细
    const markItems: { mid: number; allItems: any[] }[] = [];
    for (const mid of markIds) {
      const scItems = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, mid)).all();
      const ldItems = await db.select().from(loadingItems).where(eq(loadingItems.markId, mid)).all();
      markItems.push({ mid, allItems: [...scItems, ...ldItems] });
    }

    // 预计算：每个运单应收 + 回写映射
    const updates: { table: 'sc' | 'ld'; id: number; rec: number }[] = [];
    const newBillItems: { markId: number; mode: string; amount: number; costAmount: number }[] = [];
    let totalReceivable = 0;

    for (const { mid, allItems } of markItems) {
      const orders = new Map<string, any[]>();
      for (const item of allItems) {
        const ok = (item as any).运单号 || '_' + item.id;
        if (!orders.has(ok)) orders.set(ok, []);
        orders.get(ok)!.push(item);
      }
      for (const [ok, items] of orders) {
        let orderVol = 0;
        for (const item of items) orderVol = Math.max(orderVol, (item as any).总体积 || 0);

        const first = items[0];
        const transport = (first as any).运输方式 || '海运';
        const cargo = (first as any).货型 || '普货';
        const warehouse = (first as any).仓库 || null;
        const unitPrice = getPrice(warehouse, transport, cargo);
        const chargeVol = Math.max(orderVol, minVol(transport));
        const orderRecv = unitPrice * chargeVol;
        totalReceivable += orderRecv;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const cost = (item as any).需支付总价 || 0;
          const rec = i === 0 ? orderRecv : 0;
          const itemIsSc = (item as any).cost_status !== undefined;

          updates.push({ table: itemIsSc ? 'sc' : 'ld', id: item.id, rec });
          newBillItems.push({ markId: mid, mode: itemIsSc ? '拼柜' : '装柜', amount: rec, costAmount: cost });
        }
      }
    }

    const keepPaid = (bill as any).paidAmount || 0;
    const newRemaining = Math.max(0, totalReceivable - keepPaid);
    const newStatus = keepPaid > 0 ? (totalReceivable > keepPaid ? '付一部分' : '已付款') : '待付款';

    // ── 写入阶段（事务内） ──
    try {
      db.transaction((tx) => {
        tx.delete(billItems).where(eq(billItems.billId, recalcId)).run();

        for (const u of updates) {
          if (u.table === 'sc') {
            tx.update(sharedContainerItems).set({ 客户应收: u.rec }).where(eq(sharedContainerItems.id, u.id)).run();
          } else {
            tx.update(loadingItems).set({ 客户应收: u.rec }).where(eq(loadingItems.id, u.id)).run();
          }
        }

        for (const bi of newBillItems) {
          tx.insert(billItems).values({
            billId: recalcId, markId: bi.markId, mode: bi.mode,
            amount: bi.amount, costAmount: bi.costAmount,
          }).run();
        }

        tx.update(bills).set({
          totalAmount: totalReceivable,
          remainingAmount: newRemaining,
          paymentStatus: newStatus,
        }).where(eq(bills.id, recalcId)).run();
      });
    } catch (error) {
      console.error('重算账单失败:', error);
      return NextResponse.json({ error: '重算失败，已全部回滚' }, { status: 500 });
    }

    return NextResponse.json({ success: true, totalAmount: totalReceivable });
  }

  if (body.receiptUrl !== undefined) {
    if (typeof body.receiptUrl !== 'string' || (body.receiptUrl && !body.receiptUrl.startsWith('/uploads/'))) {
      return NextResponse.json({ error: '无效的文件路径' }, { status: 400 });
    }
    await db.update(bills).set({ receiptUrl: body.receiptUrl }).where(eq(bills.id, body.id));
  }
  return NextResponse.json({ success: true });
}
