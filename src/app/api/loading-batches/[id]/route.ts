import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { loadingBatches, loadingItems, expenses, bills, billItems } from '@/db/schema';
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

  try {
    db.transaction((tx) => {
      // 1. 查出本批次所有明细的 markId
      const items = tx.select({ markId: loadingItems.markId })
        .from(loadingItems)
        .where(eq(loadingItems.batchId, batchId))
        .all();

      const markIds = [...new Set(items.map(i => i.markId))];

      // 2. 查出这些 markId 关联的 billItems 和 bills，一并删除
      if (markIds.length > 0) {
        const biRows = tx.select({ billId: billItems.billId })
          .from(billItems)
          .where(inArray(billItems.markId, markIds))
          .all();

        const billIds = [...new Set(biRows.map(bi => bi.billId))];

        if (billIds.length > 0) {
          tx.delete(billItems).where(inArray(billItems.billId, billIds)).run();
          tx.delete(bills).where(inArray(bills.id, billIds)).run();
        }
      }

      // 3. 删除明细、支出和批次
      tx.delete(loadingItems).where(eq(loadingItems.batchId, batchId)).run();
      tx.delete(expenses).where(eq(expenses.loadingBatchId, batchId)).run();
      tx.delete(loadingBatches).where(eq(loadingBatches.id, batchId)).run();
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除装柜批次失败:', error);
    return NextResponse.json({ error: '删除失败，请重试' }, { status: 500 });
  }
}
