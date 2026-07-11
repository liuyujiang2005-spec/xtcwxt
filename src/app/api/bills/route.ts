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
      const amount = i.客户应收_cents || 0;
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
        const newRemaining = Math.max(0, totalCents - keepPaid);

        tx.update(bills).set({
          totalAmountCents: totalCents,
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
          totalAmountCents: totalCents,
          currency: 'CNY',
          status: '已生成',
          paidAmount: 0,
          remainingAmount: totalCents,
          paymentStatus: '待付款',
        }).run();
        billId = Number(result.lastInsertRowid);
      }

      for (const item of items) {
        tx.insert(billItems).values({
          billId, markId: item.markId, mode: item.mode, amountCents: item.amountCents,
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

  return NextResponse.json({ success: true, billId, totalCents, itemCount: items.length, isUpdate });
}

export async function PATCH(request: NextRequest) {
  const st = request.cookies.get('session')?.value;
  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const u = await validateSession(st);
  if (!u) return NextResponse.json({ error: '登录过期' }, { status: 401 });
  if (u.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const body = await request.json();
  if (body.receiptUrl !== undefined) {
    if (typeof body.receiptUrl !== 'string' || (body.receiptUrl && !body.receiptUrl.startsWith('/uploads/'))) {
      return NextResponse.json({ error: '无效的文件路径' }, { status: 400 });
    }
    await db.update(bills).set({ receiptUrl: body.receiptUrl }).where(eq(bills.id, body.id));
  }
  return NextResponse.json({ success: true });
}
