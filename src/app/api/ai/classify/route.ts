import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, loadingItems, marks, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

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

  // 按客户分组汇总
  const byCustomer = new Map<number, { volume: number; total: number; count: number }>();
  const byType = new Map<string, number>();
  const anomalies: string[] = [];

  for (const item of items) {
    const c = byCustomer.get(item.customerId) || { volume: 0, total: 0, count: 0 };
    c.volume += (item as any).总体积 || 0;
    c.total += (item as any).订单总价_cents || (item as any).需支付总价_cents || 0;
    c.count++;
    byCustomer.set(item.customerId, c);

    const cargoType = (item as any).货型 || '未知';
    byType.set(cargoType, (byType.get(cargoType) || 0) + 1);

    if (((item as any).总体积 || 0) <= 0) anomalies.push(`#${item.id} 体积为空`);
  }

  const customerList = await db.select().from(customers).all();
  const customerMap = new Map(customerList.map(c => [c.id, c.name]));

  return NextResponse.json({
    summary: { totalItems: items.length, totalVolume: Array.from(byCustomer.values()).reduce((s, v) => s + v.volume, 0) },
    byCustomer: Array.from(byCustomer.entries()).map(([id, v]) => ({
      customer: customerMap.get(id) || `#${id}`, ...v, total: (v.total / 100).toFixed(2),
    })),
    byCargoType: Array.from(byType.entries()).map(([type, count]) => ({ type, count })),
    anomalies,
  });
}
