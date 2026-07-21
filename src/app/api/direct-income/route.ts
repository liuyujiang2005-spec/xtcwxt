import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { directIncome } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const st = request.cookies.get('session')?.value;
  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const u = await validateSession(st);
  if (!u) return NextResponse.json({ error: '登录过期' }, { status: 401 });
  const all = await db.select().from(directIncome).orderBy(desc(directIncome.createdAt)).all();
  return NextResponse.json(all);
}

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const body = await request.json();
  if (!body.customerId || !Number.isFinite(body.customerId) || body.customerId <= 0) return NextResponse.json({ error: '缺少客户' }, { status: 400 });
  if (!body.amount || !Number.isFinite(body.amount) || body.amount <= 0) return NextResponse.json({ error: '金额必须为正数' }, { status: 400 });
  if (!body.incomeDate || typeof body.incomeDate !== 'string' || !body.incomeDate.trim()) return NextResponse.json({ error: '请选择收入日期' }, { status: 400 });
  try {
    const result = await db.insert(directIncome).values({
      markId: body.markId || null,
      customerId: body.customerId,
      amount: body.amount,
      currency: body.currency || 'CNY',
      volume: body.volume || null,
      incomeDate: body.incomeDate,
      remark: body.remark || null,
    });
    return NextResponse.json({ success: true, id: Number(result.lastInsertRowid) });
  } catch (error) {
    console.error('录入直接收入失败:', error);
    return NextResponse.json({ error: '录入失败' }, { status: 500 });
  }
}
