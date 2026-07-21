import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { directIncome } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user) return NextResponse.json({ error: '登录已过期' }, { status: 401 }); // 修复:原来只调用不检查返回值,任意非空cookie即可读记录(鉴权绕过)

  const { id } = await params;
  const item = await db.select().from(directIncome).where(eq(directIncome.id, parseInt(id))).get();
  if (!item) return NextResponse.json({ error: '未找到' }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(
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
  const body = await request.json();
  await db.update(directIncome)
    .set({
      customerId: body.customerId,
      amount: body.amount,
      currency: body.currency,
      volume: body.volume ?? null,
      incomeDate: body.incomeDate,
      remark: body.remark ?? null,
    })
    .where(eq(directIncome.id, parseInt(id)));
  return NextResponse.json({ success: true });
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
  await db.delete(directIncome).where(eq(directIncome.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
