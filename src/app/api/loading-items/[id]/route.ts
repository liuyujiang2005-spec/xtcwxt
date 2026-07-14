import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { loadingItems } from '@/db/schema';
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
  if (body.payment_status !== undefined) updates.payment_status = body.payment_status;
  if (body.需支付总价 !== undefined) updates.需支付总价 = body.需支付总价;
  await db.update(loadingItems).set(updates).where(eq(loadingItems.id, parseInt(id)));
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || (user.role !== 'admin' && user.role !== 'finance')) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { id } = await params;
  await db.delete(loadingItems).where(eq(loadingItems.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
