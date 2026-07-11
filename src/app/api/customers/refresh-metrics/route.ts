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

    // 🔵修复：改为并发执行（Promise.allSettled），客户多时不会串行超时
    // allSettled 保证即使某个客户失败也不影响其他的
    const results = await Promise.allSettled(
      allCustomers.map((c) => refreshCustomerMetrics(c.id))
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results
      .map((r, i) => ({ r, id: allCustomers[i].id }))
      .filter(({ r }) => r.status === 'rejected')
      .map(({ r, id }) => {
        console.error(`刷新客户 ${id} 失败:`, (r as PromiseRejectedResult).reason);
        return id;
      });

    return NextResponse.json({
      success: true,
      refreshed: succeeded,
      failed: failed.length > 0 ? failed : undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '刷新失败' }, { status: 500 });
  }
}
