import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { loadingBatches, loadingItems, expenses } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user) return NextResponse.json({ error: '登录过期' }, { status: 401 });

  const { id } = await params;
  const batch = await db.select().from(loadingBatches).where(eq(loadingBatches.id, parseInt(id))).get();
  if (!batch) return NextResponse.json({ error: '未找到' }, { status: 404 });

  const items = await db.select().from(loadingItems).where(eq(loadingItems.batchId, batch.id)).all();
  const costList = await db.select().from(expenses).where(eq(expenses.loadingBatchId, batch.id)).all();
  return NextResponse.json({ batch, items, expenses: costList });
}

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
  await db.update(loadingBatches).set({ status: body.status }).where(eq(loadingBatches.id, parseInt(id)));
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || (user.role !== 'admin' && user.role !== 'finance'))
    return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { id } = await params;
  const batchId = parseInt(id);

  // 🟡修复：三步删除改为事务，避免中途失败留下孤立数据
  try {
    db.transaction((tx) => {
      tx.delete(loadingItems).where(eq(loadingItems.batchId, batchId)).run();
      tx.delete(expenses).where(eq(expenses.loadingBatchId, batchId)).run();
      tx.delete(loadingBatches).where(eq(loadingBatches.id, batchId)).run();
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除批次失败:', error);
    return NextResponse.json({ error: '删除失败，请重试' }, { status: 500 });
  }
}
