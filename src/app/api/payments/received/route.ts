import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { paymentsReceived } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { refreshCustomerMetrics } from '@/lib/metrics';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const body = await request.json();
    await db.insert(paymentsReceived).values({
      customerId: body.customerId,
      markId: body.markId || null,
      amount: body.amount,
      currency: body.currency || 'CNY',
      receivedDate: body.receivedDate,
      remark: body.remark || null,
    });

    try { await refreshCustomerMetrics(body.customerId); } catch (e) { console.error('刷新客户评分失败:', e); }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '录入失败' }, { status: 500 });
  }
}
