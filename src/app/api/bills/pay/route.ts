import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { bills } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { billId, paymentStatus, paidAmount } = await request.json();
  const validStatus = ['待付款','付一部分','已付款'];
  if (paymentStatus && !validStatus.includes(paymentStatus)) return NextResponse.json({ error: '无效付款状态' }, { status: 400 });
  if (!billId) return NextResponse.json({ error: '缺少参数' }, { status: 400 });

  const data: any = { paymentStatus };
  if (typeof paidAmount === 'number') {
    data.paidAmount = paidAmount;
    const bill = await db.select().from(bills).where(eq(bills.id, billId)).get();
    if (bill) data.remainingAmount = (bill.totalAmountCents || 0) - paidAmount;
  }
  if (paymentStatus === '已付款') data.paidAt = new Date().toISOString();

  await db.update(bills).set(data).where(eq(bills.id, billId));
  return NextResponse.json({ success: true });
}
