import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { bills, billItems, marks, sharedContainerItems, loadingItems } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

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

  let totalCents = 0;
  const items: { markId: number; mode: string; amountCents: number }[] = [];

  for (const mark of markList) {
    const scItems = await db.select().from(sharedContainerItems)
      .where(eq(sharedContainerItems.markId, mark.id)).all();
    const ldItems = await db.select().from(loadingItems)
      .where(eq(loadingItems.markId, mark.id)).all();

    scItems.forEach((i) => {
      const amount = i.需支付总价_cents || 0;
      totalCents += amount;
      items.push({ markId: mark.id, mode: '拼柜', amountCents: amount });
    });
    ldItems.forEach((i) => {
      const amount = i.需支付总价_cents || 0;
      totalCents += amount;
      items.push({ markId: mark.id, mode: '装柜', amountCents: amount });
    });
  }

  const billNo = `${monthTag.replace('-', '')}-${String(customerId).padStart(4, '0')}`;

  const existing = await db.select().from(bills)
    .where(and(eq(bills.customerId, customerId), eq(bills.monthTag, monthTag)))
    .get();

  let billId: number;
  if (existing) {
    await db.update(bills).set({ totalAmountCents: totalCents, status: '已生成', createdAt: new Date().toISOString() })
      .where(eq(bills.id, existing.id));
    await db.delete(billItems).where(eq(billItems.billId, existing.id));
    billId = existing.id;
  } else {
    const result = await db.insert(bills).values({
      billNo, customerId, monthTag, totalAmountCents: totalCents, currency: 'CNY', status: '已生成',
    });
    billId = Number(result.lastInsertRowid);
  }

  for (const item of items) {
    await db.insert(billItems).values({ billId, markId: item.markId, mode: item.mode, amountCents: item.amountCents });
  }

  return NextResponse.json({ success: true, billId, totalCents, itemCount: items.length, isUpdate: !!existing });
}

export async function PATCH(request: NextRequest) {
  const st = request.cookies.get('session')?.value;
  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const u = await validateSession(st);
  if (!u) return NextResponse.json({ error: '登录过期' }, { status: 401 });

  const body = await request.json();
  if (body.receiptUrl !== undefined) {
    await db.update(bills).set({ receiptUrl: body.receiptUrl }).where(eq(bills.id, body.id));
  }
  return NextResponse.json({ success: true });
}
