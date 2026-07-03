import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, inArray } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { ids, updates } = await request.json();
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: '缺少 ids' }, { status: 400 });
  }

  const setData: any = {};
  if (typeof updates.成本单价_cents === 'number') setData.成本单价_cents = updates.成本单价_cents;
  if (typeof updates.客户应收_cents === 'number') setData.客户应收_cents = updates.客户应收_cents;
  if (typeof updates.需支付总价_cents === 'number') setData.需支付总价_cents = updates.需支付总价_cents;
  if (Object.keys(setData).length === 0) {
    return NextResponse.json({ error: '没有要更新的字段' }, { status: 400 });
  }

  await db.update(sharedContainerItems).set(setData).where(inArray(sharedContainerItems.id, ids));
  return NextResponse.json({ success: true, updatedCount: ids.length });
}
