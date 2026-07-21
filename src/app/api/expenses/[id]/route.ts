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
  if (body.amount !== undefined) updates.amount = body.amount;
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

    // 部分更新:只改传来的字段,别把没传的清空(付款/改金额/传水单各发不同字段)
    const updates: any = {};
    if (body.receiptUrl !== undefined) {
      if (body.receiptUrl !== null && (typeof body.receiptUrl !== 'string' || !body.receiptUrl.startsWith('/uploads/'))) {
        return NextResponse.json({ error: '无效的文件路径' }, { status: 400 });
      }
      updates.receiptUrl = body.receiptUrl;
    }
    if (body.amount !== undefined) updates.amount = body.amount;
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.remark !== undefined) updates.remark = body.remark;
    if (body.status !== undefined) {
      updates.status = body.status;
      // 状态变已支付记付款日期,否则清空;调用方显式传了 paidDate 则以其为准
      if (body.paidDate !== undefined) updates.paidDate = body.paidDate;
      else updates.paidDate = body.status === '已支付' ? new Date().toISOString().substring(0, 10) : null;
    } else if (body.paidDate !== undefined) {
      updates.paidDate = body.paidDate;
    }

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: '没有要更新的字段' }, { status: 400 });

    await db.update(expenses).set(updates).where(eq(expenses.id, parseInt(id)));
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
