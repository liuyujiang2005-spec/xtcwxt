import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { bills, billItems, marks, sharedContainerItems, loadingItems, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const st = request.cookies.get('session')?.value;
  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const u = await validateSession(st);
  if (!u || u.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { billId } = await request.json();
  if (!billId) return NextResponse.json({ error: '缺少 billId' }, { status: 400 });

  const bill = await db.select().from(bills).where(eq(bills.id, billId)).get();
  if (!bill) return NextResponse.json({ error: '账单不存在' }, { status: 404 });

  const customer = await db.select().from(customers).where(eq(customers.id, bill.customerId)).get();
  let pm: Record<string, number> = {};
  if (customer?.priceMatrix) { try { pm = JSON.parse(customer.priceMatrix); } catch {} }
  const em = customer?.enableMinVolume !== 0;
  const gp = (t: string, c: string): number => {
    const m = t === '海运' ? 'sea' : 'land';
    const ty = c === '普货' ? 'regular' : c === '商检货' ? 'inspection' : 'sensitive';
    return pm[m + '_' + ty] || 0;
  };
  const mv = (t: string): number => { if (!em) return 0; return t === '海运' ? 0.5 : 0.3; };

  const bits = await db.select().from(billItems).where(eq(billItems.billId, billId)).all();
  const mids = [...new Set(bits.map(i => i.markId))];

  await db.delete(billItems).where(eq(billItems.billId, billId));

  let tr = 0;
  for (const mid of mids) {
    const sc = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, mid)).all();
    const ld = await db.select().from(loadingItems).where(eq(loadingItems.markId, mid)).all();
    const seen = new Set<string>();
    for (const item of [...sc, ...ld]) {
      const ok = (item as any).运单号 || '_' + (item as any).id;
      if (seen.has(ok)) continue;
      seen.add(ok);
      const tp = (item as any).运输方式 || '海运';
      const cg = (item as any).货型 || '普货';
      const up = gp(tp, cg);
      const sv = (item as any).单箱体积 || 0;
      const cv = Math.max(sv, mv(tp));
      const rec = up * cv;
      const cost = (item as any).需支付总价_cents || 0;
      tr += rec;
      await db.insert(billItems).values({ billId, markId: mid, mode: '拼柜', amountCents: rec, costAmount: cost });
    }
  }

  await db.update(bills).set({ totalAmountCents: tr }).where(eq(bills.id, billId));
  return NextResponse.json({ success: true, totalAmountCents: tr });
}
