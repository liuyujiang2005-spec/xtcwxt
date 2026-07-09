import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { expenses } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const st = request.cookies.get('session')?.value;
  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const u = await validateSession(st);
  if (!u) return NextResponse.json({ error: '登录过期' }, { status: 401 });
  const all = await db.select().from(expenses).orderBy(desc(expenses.createdAt)).all();
  return NextResponse.json(all);
}

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const body = await request.json();
  const result = await db.insert(expenses).values({
    loadingBatchId: body.loadingBatchId || null,
    expenseType: body.expenseType,
    amountCents: body.amountCents,
    currency: body.currency || 'CNY',
    supplierId: body.supplierId || null,
    status: '待支付',
    remark: body.remark || null,
  });
  return NextResponse.json({ success: true, id: Number(result.lastInsertRowid) });
}
