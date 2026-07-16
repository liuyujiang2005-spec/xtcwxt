import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { paymentsReceived, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { refreshCustomerMetrics } from '@/lib/metrics';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const body = await request.json();
    const customerId = body.customerId;
    const amount = body.amount;
    const receivedDate = body.receivedDate;
    const currency = body.currency || 'CNY';

    // 校验客户
    if (!customerId || customerId <= 0) {
      return NextResponse.json({ error: '请选择客户' }, { status: 400 });
    }
    const cust = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!cust) {
      return NextResponse.json({ error: '客户不存在' }, { status: 400 });
    }

    // 校验金额
    if (amount === undefined || amount === null || typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: '金额必须大于0' }, { status: 400 });
    }

    // 校验日期
    if (!receivedDate || typeof receivedDate !== 'string' || receivedDate.trim() === '') {
      return NextResponse.json({ error: '请选择收款日期' }, { status: 400 });
    }

    // 校验币种
    if (currency !== 'CNY' && currency !== 'THB') {
      return NextResponse.json({ error: '币种只支持CNY或THB' }, { status: 400 });
    }

    await db.insert(paymentsReceived).values({
      customerId,
      markId: body.markId || null,
      amount: Math.round(amount * 100) / 100,
      currency,
      receivedDate,
      remark: body.remark || null,
    });

    try { await refreshCustomerMetrics(customerId); } catch (e) { console.error('刷新客户评分失败:', e); }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '录入失败' }, { status: 500 });
  }
}
