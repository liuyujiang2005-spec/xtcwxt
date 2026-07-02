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
  await db.update(expenses).set({
    expenseType: body.expenseType,
    amountCents: body.amountCents,
    currency: body.currency,
    supplierId: body.supplierId || null,
    status: body.status,
    paidDate: body.paidDate || null,
    remark: body.remark || null,
  }).where(eq(expenses.id, parseInt(id)));
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
