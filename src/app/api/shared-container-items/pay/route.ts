import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { inArray } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || (user.role !== 'admin' && user.role !== 'finance')) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { markIds } = await request.json();
  if (!markIds || !Array.isArray(markIds) || markIds.length === 0) {
    return NextResponse.json({ error: '缺少 markIds' }, { status: 400 });
  }

  await db.update(sharedContainerItems)
    .set({ cost_status: '已支出', paidDate: new Date().toISOString().substring(0, 10) })
    .where(inArray(sharedContainerItems.markId, markIds));

  return NextResponse.json({ success: true });
}
