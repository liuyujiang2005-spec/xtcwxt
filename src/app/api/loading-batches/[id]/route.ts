import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { loadingBatches, loadingItems, expenses } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const batch = await db.select().from(loadingBatches).where(eq(loadingBatches.id, parseInt(id))).get();
  if (!batch) return NextResponse.json({ error: '未找到' }, { status: 404 });

  const items = await db.select().from(loadingItems).where(eq(loadingItems.batchId, batch.id)).all();
  const costList = await db.select().from(expenses).where(eq(expenses.loadingBatchId, batch.id)).all();
  return NextResponse.json({ batch, items, expenses: costList });
}
