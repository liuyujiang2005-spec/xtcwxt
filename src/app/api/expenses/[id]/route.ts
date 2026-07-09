import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { expenses } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const updates: any = {};
  if (body.expenseType !== undefined) updates.expenseType = body.expenseType;
  if (body.amountCents !== undefined) updates.amountCents = body.amountCents;
  if (body.currency !== undefined) updates.currency = body.currency;
  if (body.supplierId !== undefined) updates.supplierId = body.supplierId || null;
  if (body.status !== undefined) updates.status = body.status;
  if (body.paidDate !== undefined) updates.paidDate = body.paidDate || null;
  if (body.remark !== undefined) updates.remark = body.remark || null;
  if (Object.keys(updates).length > 0) {
    await db.update(expenses).set(updates).where(eq(expenses.id, parseInt(id)));
  }
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await request.json();

    await db.update(expenses)
      .set({
        amountCents: body.amountCents,
        currency: body.currency || 'CNY',
        status: body.status || '待支付',
        remark: body.remark || null,
      })
      .where(eq(expenses.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || (user.role !== 'admin' && user.role !== 'finance')) {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  const { id } = await params;
  await db.delete(expenses).where(eq(expenses.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
