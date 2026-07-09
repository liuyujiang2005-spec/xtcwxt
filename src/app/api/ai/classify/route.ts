import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, loadingItems, marks, customers, bills, billItems } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, inArray } from 'drizzle-orm';
import { aiChat } from '@/lib/ai';

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

    let custId = group[0].customerId;
    const customer = custMap.get(custId || 0);
    let priceMatrix: Record<string, number> = {};
    if (customer?.priceMatrix) {
      try { priceMatrix = JSON.parse(customer.priceMatrix); } catch {}
    }
    const enableMinVol = customer?.enableMinVolume !== 0;

    const getPrice = (transport: string, cargo: string): number => {
      const m = transport === '海运' ? 'sea' : 'land';
      const t = cargo === '普货' ? 'regular' : cargo === '商检货' ? 'inspection' : 'sensitive';
      return priceMatrix[`${m}_${t}`] || 0;
    };
    const minVol = (transport: string): number => {
      if (!enableMinVol) return 0;
      return transport === '海运' ? 0.5 : 0.3;
    };

    const totalVol = group.reduce((s, i) => s + (i.单箱体积 || i.总体积 || 0), 0);
    let totalReceivable = 0;

    const monthTag = mark?.monthTag ?? new Date().toISOString().substring(0, 7);
    const billNo = `${markNo}-${monthTag}`;

    if (!custId || custId <= 0) {
      results.push({ markId, billId: 0, billNo, markNo, customerName: '未知客户', itemCount: group.length, totalVolume: round6(totalVol), totalCost: 0, error: '无有效客户' });
      continue;
    }

    const existing = await db.select().from(bills).where(eq(bills.billNo, billNo)).get();
    let billId: number;
    if (existing) {
      await db.update(bills).set({ totalAmountCents: 0, status: '已生成', paidAmount: 0, remainingAmount: 0, paymentStatus: '待付款', paidAt: null }).where(eq(bills.id, existing.id));
      await db.delete(billItems).where(eq(billItems.billId, existing.id));
      billId = existing.id;
    } else {
      const r = await db.insert(bills).values({
        billNo, customerId: custId, monthTag, totalAmountCents: 0, currency: 'CNY', status: '已生成',
      });
      billId = Number(r.lastInsertRowid);
    }

    const insertedOrders = new Set<string>();
    for (const item of group) {
      const orderKey = (item as any).运单号 || `_${item.id}`;
      if (insertedOrders.has(orderKey)) continue;
      insertedOrders.add(orderKey);

      const transport = (item as any).运输方式 || '海运';
      const cargo = (item as any).货型 || '普货';
      const unitPrice = getPrice(transport, cargo);
      const vol = (item as any).单箱体积 || (item as any).总体积 || 0;
      const chargeVol = Math.max(vol, minVol(transport));
      const receivable = unitPrice * chargeVol;
      const cost = (item as any).需支付总价_cents || 0;

      totalReceivable += receivable;

      await db.insert(billItems).values({
        billId, markId, mode: '拼柜',
        amountCents: receivable,
        costAmount: cost,
      });
    }

    await db.update(bills).set({ totalAmountCents: totalReceivable }).where(eq(bills.id, billId));

    results.push({ markId,
      billId, billNo, markNo, customerName: custMap.get(custId)?.name || markNo,
      itemCount: group.length, totalVolume: round6(totalVol), totalCost: round6(totalReceivable),
    });
  }

  // DeepSeek 分类分析
  let classifyResult: any = null;
  try {
    const summary = results.map(r => ({
      唛头: r.markNo, 客户: r.customerName, 件数: r.itemCount,
      总体积: r.totalVolume, 订单总价: r.totalCost.toFixed(6),
    }));
    const prompt = `分析以下拼柜账单分类数据，按客户、运输方式、货物类型做汇总，标记异常。\n\n${JSON.stringify(summary, null, 2)}\n\n返回JSON：{"summary":"一段中文总结","anomalies":[{"唛头":"xxx","问题":"描述"}],"按客户汇总":[{"客户":"xx","账单数":1,"总金额":123}]}`;
    const raw = await aiChat('你是物流财务分类助手，只返回JSON。', prompt);
    const json = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    classifyResult = JSON.parse(json);
  } catch (e) { console.error('DeepSeek 分类失败:', e); }

  return NextResponse.json({ bills: results, totalMarks: results.length, classify: classifyResult });
}

function round6(n: number): number { return Math.round(n * 1000000) / 1000000; }
