import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerBatches, sharedContainerItems, marks } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, inArray } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user) return NextResponse.json({ error: '登录过期' }, { status: 401 });

  const { id } = await params;
  const batch = await db.select().from(sharedContainerBatches).where(eq(sharedContainerBatches.id, parseInt(id))).get();
  if (!batch) return NextResponse.json({ error: '未找到' }, { status: 404 });

  const items = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.batchId, batch.id)).all();
  const markIds = [...new Set(items.map(i => i.markId))];
  const markList = markIds.length > 0 ? await db.select().from(marks).where(inArray(marks.id, markIds)).all() : [];
  const markMap = new Map(markList.map(m => [m.id, m.markNo]));
  const itemsWithMark = items.map(i => ({ ...i, markNo: markMap.get(i.markId) || '' }));

  return NextResponse.json({ batch, items: itemsWithMark });
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
  await db.update(sharedContainerBatches).set({ status: body.status }).where(eq(sharedContainerBatches.id, parseInt(id)));
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

  // 🟡修复：两步删除改为事务
  try {
    db.transaction((tx) => {
      tx.delete(sharedContainerItems).where(eq(sharedContainerItems.batchId, batchId)).run();
      tx.delete(sharedContainerBatches).where(eq(sharedContainerBatches.id, batchId)).run();
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除拼柜批次失败:', error);
    return NextResponse.json({ error: '删除失败，请重试' }, { status: 500 });
  }
}
