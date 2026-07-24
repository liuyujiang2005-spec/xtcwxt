import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { fullContainerBatches, fullContainerItems, expenses } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

const round2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().substring(0, 10);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const st = request.cookies.get('session')?.value;
  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!(await validateSession(st))) return NextResponse.json({ error: '登录过期' }, { status: 401 });
  const { id } = await params;
  const batch = await db.select().from(fullContainerBatches).where(eq(fullContainerBatches.id, parseInt(id))).get();
  if (!batch) return NextResponse.json({ error: '批次不存在' }, { status: 404 });
  return NextResponse.json(batch);
}

// 改柜型/应收/货值/4日期/状态;分次付(payAmount 累加已付,自动算剩余,付清写实付日期)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const st = request.cookies.get('session')?.value;
  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(st);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { id } = await params;
  const batch = await db.select().from(fullContainerBatches).where(eq(fullContainerBatches.id, parseInt(id))).get();
  if (!batch) return NextResponse.json({ error: '批次不存在' }, { status: 404 });
  const body = await request.json();
  const updates: any = {};

  for (const f of ['柜型', '货物申报价值', '国内收货日期', '泰国到货日期', '出账单日期', 'status', 'currency'] as const) {
    if (body[f] !== undefined) updates[f] = body[f];
  }

  // 应收变更 → 重算剩余
  let 应收 = Number(batch.整柜应收) || 0;
  let 已付 = Number(batch.已付) || 0;
  if (body.整柜应收 !== undefined) { 应收 = Number(body.整柜应收) || 0; updates.整柜应收 = 应收; }

  // 分次付:payAmount 累加到已付(可为负=退款/纠错)
  if (body.payAmount !== undefined) 已付 = round2(已付 + (Number(body.payAmount) || 0));
  if (body.已付 !== undefined) 已付 = Number(body.已付) || 0; // 直接改已付

  if (body.整柜应收 !== undefined || body.payAmount !== undefined || body.已付 !== undefined) {
    updates.已付 = 已付;
    updates.剩余 = round2(应收 - 已付);
    // 付清自动写实付日期,未付清则清掉
    if (应收 > 0 && 已付 >= 应收) updates.实付日期 = body.实付日期 || batch.实付日期 || today();
    else updates.实付日期 = null;
  }
  if (body.实付日期 !== undefined) updates.实付日期 = body.实付日期; // 手动指定优先

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: '没有要更新的字段' }, { status: 400 });
  await db.update(fullContainerBatches).set(updates).where(eq(fullContainerBatches.id, parseInt(id)));
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const st = request.cookies.get('session')?.value;
  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(st);
  if (!user || (user.role !== 'admin' && user.role !== 'finance')) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { id } = await params;
  const bid = parseInt(id);
  try {
    await db.transaction((tx) => {
      tx.delete(fullContainerItems).where(eq(fullContainerItems.batchId, bid)).run();
      tx.delete(expenses).where(eq(expenses.fullContainerBatchId, bid)).run();
      tx.delete(fullContainerBatches).where(eq(fullContainerBatches.id, bid)).run();
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除整柜批次失败:', error);
    return NextResponse.json({ error: '删除失败，请重试' }, { status: 500 });
  }
}
