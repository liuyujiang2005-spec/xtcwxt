import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { refreshCustomerMetrics } from '@/lib/metrics';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));

    if (body.customerId) {
      await refreshCustomerMetrics(body.customerId);
      return NextResponse.json({ success: true, refreshed: 1 });
    }

    const allCustomers = await db.select().from(customers).all();
    let count = 0;
    for (const c of allCustomers) {
      try { await refreshCustomerMetrics(c.id); count++; } catch (e) { console.error(`刷新客户 ${c.id} 失败:`, e); }
    }
    return NextResponse.json({ success: true, refreshed: count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '刷新失败' }, { status: 500 });
  }
}
