import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { bills, billItems, marks, sharedContainerItems, loadingItems, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

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

  const { customerId, monthTag } = await request.json();
  if (!customerId || !monthTag) {
    return NextResponse.json({ error: '缺少参数' }, { status: 400 });
  }

  const markList = await db.select().from(marks)
    .where(and(eq(marks.customerId, customerId), eq(marks.monthTag, monthTag)))
    .all();

  if (markList.length === 0) {
    return NextResponse.json({ error: '该客户在所选月份没有唛头数据' }, { status: 404 });
  }

  let total = 0;
  const items: { markId: number; mode: string; amount: number }[] = [];

  for (const mark of markList) {
    const scItems = await db.select().from(sharedContainerItems)
      .where(eq(sharedContainerItems.markId, mark.id)).all();
    const ldItems = await db.select().from(loadingItems)
      .where(eq(loadingItems.markId, mark.id)).all();

    scItems.forEach((i) => {
      const amount = i.客户应收 || 0;
      total += amount;
      items.push({ markId: mark.id, mode: '拼柜', amount: amount });
    });
    ldItems.forEach((i) => {
      const amount = i.需支付总价 || 0;
      total += amount;
      items.push({ markId: mark.id, mode: '装柜', amount: amount });
    });
  }

  const billNo = `${monthTag.replace('-', '')}-${String(customerId).padStart(4, '0')}`;

  // 修复1（编译）：billId 初始化为 0，避免 TS 严格模式报 used before assigned
  let billId: number = 0;
  let isUpdate = false;

  try {
    db.transaction((tx) => {
      const existing = tx.select().from(bills)
        .where(and(eq(bills.customerId, customerId), eq(bills.monthTag, monthTag)))
        .get();

      if (existing) {
        // 修复2（业务风险）：重新生成账单时，保留已付款金额，只更新总额和剩余额
        const keepPaid = existing.paidAmount ?? 0;
        const newRemaining = Math.max(0, total - keepPaid);

        tx.update(bills).set({
          totalAmount: total,
          status: '已生成',
          createdAt: new Date().toISOString(),
          remainingAmount: newRemaining,
          // ⚠️ paidAmount 不重置，保留客户已付的钱
          paymentStatus: newRemaining <= 0 ? '已付款' : keepPaid > 0 ? '付一部分' : '待付款',
        }).where(eq(bills.id, existing.id)).run();
        tx.delete(billItems).where(eq(billItems.billId, existing.id)).run();
        billId = existing.id;
        isUpdate = true;
      } else {
        const result = tx.insert(bills).values({
          billNo, customerId, monthTag,
          totalAmount: total,
          currency: 'CNY',
          status: '已生成',
          paidAmount: 0,
          remainingAmount: total,
          paymentStatus: '待付款',
        }).run();
        billId = Number(result.lastInsertRowid);
      }

      for (const item of items) {
        tx.insert(billItems).values({
          billId, markId: item.markId, mode: item.mode, amount: item.amount,
        }).run();
      }
    });
  } catch (error) {
    console.error('生成账单失败:', error);
    return NextResponse.json({ error: '生成账单失败，请重试' }, { status: 500 });
  }

  if (!billId) {
    return NextResponse.json({ error: '账单创建异常，请重试' }, { status: 500 });
  }

  return NextResponse.json({ success: true, billId, total, itemCount: items.length, isUpdate });
}

export async function PATCH(request: NextRequest) {
  const st = request.cookies.get('session')?.value;
  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const u = await validateSession(st);
  if (!u) return NextResponse.json({ error: '登录过期' }, { status: 401 });
  if (u.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const body = await request.json();
  if (body.recalculate && body.id) {
    const bill = await db.select().from(bills).where(eq(bills.id, body.id)).get();
    if (!bill) return NextResponse.json({ error: '账单不存在' }, { status: 404 });

    const customer = await db.select().from(customers).where(eq(customers.id, bill.customerId)).get();
    let pm: any = {};
    if (customer?.defaultCurrency === 'THB') {
      if (customer?.priceMatrixThb) try { pm = JSON.parse(customer.priceMatrixThb); } catch {}
    } else if (customer?.priceMatrix) {
      try { pm = JSON.parse(customer.priceMatrix); } catch {} }
    const em = customer?.enableMinVolume !== 0;
    const minVol = (transport: string): number => { if (!em) return 0; return transport === '海运' ? 0.5 : 0.3; };
    const bits = await db.select().from(billItems).where(eq(billItems.billId, body.id)).all();
    const markIds = [...new Set(bits.map(i => i.markId))];
    await db.delete(billItems).where(eq(billItems.billId, body.id));
    let totalReceivable = 0;
    for (const mid of markIds) {
      const scItems = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, mid)).all();
      const ldItems = await db.select().from(loadingItems).where(eq(loadingItems.markId, mid)).all();
      const allItems = [...scItems, ...ldItems];
      
      // 按运单号分组
      const orders = new Map<string, any[]>();
      for (const item of allItems) {
        const ok = (item as any).运单号 || '_' + item.id;
        if (!orders.has(ok)) orders.set(ok, []);
        orders.get(ok)!.push(item);
      }
      for (const [ok, items] of orders) {
        // 运单总体积：取每条总体积的最大值（同一运单下每条总体积相同，取 max 防某条为 0）
        let orderVol = 0;
        for (const item of items) orderVol = Math.max(orderVol, (item as any).总体积 || 0);
        const first = items[0];
        const transport = (first as any).运输方式 || '海运';
        const cargo = (first as any).货型 || '普货';
        const warehouse = (first as any).仓库 || null;
        const unitPrice = getMatrixPrice(pm, warehouse, transport, cargo);
        const chargeVol = Math.max(orderVol, minVol(transport));
        const orderRecv = unitPrice * chargeVol;
        totalReceivable += orderRecv;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const cost = (item as any).需支付总价 || 0;
          const rec = i === 0 ? orderRecv : 0;
          const isSc = (item as any).cost_status !== undefined;
          if (isSc) {
            await db.update(sharedContainerItems).set({ 客户应收: rec }).where(eq(sharedContainerItems.id, item.id));
          } else {
            await db.update(loadingItems).set({ 客户应收: rec }).where(eq(loadingItems.id, item.id));
          }
          await db.insert(billItems).values({ billId: body.id, markId: mid, mode: isSc ? '拼柜' : '装柜', amount: rec, costAmount: cost });
        }
      }
    }
    await db.update(bills).set({ totalAmount: totalReceivable }).where(eq(bills.id, body.id));
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
