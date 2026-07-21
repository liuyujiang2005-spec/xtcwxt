import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || (user.role !== 'admin' && user.role !== 'finance')) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const updates: any = {};
  if (typeof body.成本单价 === 'number') updates.成本单价 = body.成本单价;
  if (typeof body.客户应收 === 'number') updates.客户应收 = body.客户应收;
  if (typeof body.需支付总价 === 'number') updates.需支付总价 = body.需支付总价;
  if (body.cost_status !== undefined) {
    updates.cost_status = body.cost_status;
    updates.paidDate = body.cost_status === '已支出' ? new Date().toISOString().substring(0, 10) : null;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: '没有要更新的字段' }, { status: 400 });

  await db.update(sharedContainerItems).set(updates).where(eq(sharedContainerItems.id, parseInt(id)));
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || (user.role !== 'admin' && user.role !== 'finance')) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { id } = await params;
  await db.delete(sharedContainerItems).where(eq(sharedContainerItems.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
