import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { paymentsMade } from '@/db/schema';
import { validateSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const body = await request.json();
    await db.insert(paymentsMade).values({
      supplierId: body.supplierId,
      expenseId: body.expenseId || null,
      amountCents: body.amountCents,
      currency: body.currency || 'CNY',
      paidDate: body.paidDate,
      remark: body.remark || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '录入失败' }, { status: 500 });
  }
}
