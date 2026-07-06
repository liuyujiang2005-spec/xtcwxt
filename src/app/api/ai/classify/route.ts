import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, loadingItems, marks, customers, bills, billItems } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, inArray } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { batchId, type = 'shared-container' } = await request.json();
  if (!batchId) return NextResponse.json({ error: '缺少 batchId' }, { status: 400 });

  const items = type === 'shared-container'
    ? await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.batchId, batchId)).all()
    : await db.select().from(loadingItems).where(eq(loadingItems.batchId, batchId)).all();

  if (items.length === 0) return NextResponse.json({ error: '无数据' }, { status: 404 });

  const markIds = [...new Set(items.map(i => i.markId))];
  const markList = await db.select().from(marks).where(inArray(marks.id, markIds)).all();
  const markMap = new Map(markList.map(m => [m.id, m]));
  const custList = await db.select().from(customers).all();
  const custMap = new Map(custList.map(c => [c.id, c]));

  // 按唛头分组，每组生成一条账单
  const byMark = new Map<number, any[]>();
  for (const item of items) {
    if (!byMark.has(item.markId)) byMark.set(item.markId, []);
    byMark.get(item.markId)!.push(item);
  }

  const results: any[] = [];
  for (const [markId, group] of byMark) {
    const mark = markMap.get(markId);
    const markNo = mark?.markNo || `#${markId}`;
    const totalVol = group.reduce((s, i) => s + (i.单箱体积 || i.总体积 || 0), 0);
    const totalCost = group[0]?.订单总价_cents || group[0]?.需支付总价_cents || 0;

    // 查找是否有同唛头的客户
    let custId = group[0].customerId;
    if (!custId || !custMap.has(custId)) {
      const c = await db.select().from(customers).where(eq(customers.name, markNo)).get();
      if (c) custId = c.id;
    }

    const monthTag = mark?.monthTag || new Date().toISOString().substring(0, 7);
    const billNo = `BL-${monthTag.replace('-', '')}-${markNo}`;

    // 检查是否已有账单，有则更新
    const existing = await db.select().from(bills).where(eq(bills.billNo, billNo)).get();
    let billId: number;
    if (existing) {
      await db.update(bills).set({ totalAmountCents: Math.round(totalCost), status: '已生成', createdAt: new Date().toISOString() })
        .where(eq(bills.id, existing.id));
      await db.delete(billItems).where(eq(billItems.billId, existing.id));
      billId = existing.id;
    } else {
      const r = await db.insert(bills).values({
        billNo, customerId: custId || 0, monthTag, totalAmountCents: Math.round(totalCost),
        currency: 'CNY', status: '已生成',
      });
      billId = Number(r.lastInsertRowid);
    }

    for (const item of group) {
      await db.insert(billItems).values({
        billId, markId, mode: '拼柜',
        amountCents: Math.round(item.订单总价_cents || item.需支付总价_cents || 0),
      });
    }

    results.push({
      billId, billNo, markNo, customerName: custMap.get(custId)?.name || markNo,
      itemCount: group.length, totalVolume: round6(totalVol), totalCost: round6(totalCost),
    });
  }

  return NextResponse.json({ bills: results, totalMarks: results.length });
}

function round6(n: number): number { return Math.round(n * 1000000) / 1000000; }
