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

  const { batchId, batchIds, type = 'shared-container', month } = await request.json();
  const allBatchIds: number[] = batchIds && batchIds.length > 0 ? batchIds : (batchId ? [batchId] : []);
  if (allBatchIds.length === 0) return NextResponse.json({ error: '缺少 batchId 或 batchIds' }, { status: 400 });

  const isSc = type === 'shared-container';
  const sourceTable = isSc ? sharedContainerItems : loadingItems;
  const batchField = isSc ? sharedContainerItems.batchId : loadingItems.batchId;
  let items: any[] = [];
  for (const bid of allBatchIds) {
    const batchItems = await db.select().from(sourceTable).where(eq(batchField, bid)).all();
    items = items.concat(batchItems);
  }

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
    let pm: any = {};
    if (customer?.defaultCurrency === 'THB' && customer?.priceMatrixThb) {
      try { pm = JSON.parse(customer.priceMatrixThb); } catch {}
    } else if (customer?.priceMatrix) {
      try { pm = JSON.parse(customer.priceMatrix); } catch {}
    }
    const enableMinVol = customer?.enableMinVolume !== 0;

    const getPrice = (wh: string | null, transport: string, cargo: string): number => {
      const m = transport === '海运' ? 'sea' : 'land';
      const t = cargo === '普货' ? 'regular' : cargo === '商检货' ? 'inspection' : 'sensitive';
      const key = m + '_' + t;
      // 按仓库取价
      if (wh && typeof pm[wh] === 'object' && pm[wh] !== null) {
        const whPrices = pm[wh] as any;
        if (typeof whPrices[key] === 'number') return whPrices[key];
      }
      // 兼容旧格式
      return typeof pm[key] === 'number' ? pm[key] : 0;
    };
    const minVol = (transport: string): number => {
      if (!enableMinVol) return 0;
      return transport === '海运' ? 0.5 : 0.3;
    };

    const totalVol = group.reduce((s, i) => s + (i.单箱体积 || i.总体积 || 0), 0);
    let totalReceivable = 0;

    const monthTag = month || mark?.monthTag || new Date().toISOString().substring(0, 7);
    const billNo = `${markNo}-${monthTag}${customer?.defaultCurrency === 'THB' ? '-THB' : ''}`;

    if (!custId || custId <= 0) {
      results.push({ markId, billId: 0, billNo, markNo, customerName: '未知客户', itemCount: group.length, totalVolume: round6(totalVol), totalCost: 0, error: '无有效客户' });
      continue;
    }

    const existing = await db.select().from(bills).where(eq(bills.billNo, billNo)).get();
    let billId: number;
    if (existing) {
      // 已付款账单跳过，不再追加
      if (existing.paymentStatus === '已付款' || existing.paymentStatus === '付一部分') {
        results.push({ markId, billId: existing.id, billNo, markNo, customerName: custMap.get(custId)?.name || markNo, itemCount: group.length, totalVolume: round6(totalVol), totalCost: round6(totalReceivable), skipped: true });
        continue;
      }
      // 账单已存在，累加新明细
      totalReceivable = existing.totalAmount || 0;
      billId = existing.id;
    } else {
      const r = await db.insert(bills).values({
        billNo, customerId: custId, monthTag, totalAmount: 0, currency: customer?.defaultCurrency || 'CNY', status: '已生成',
      });
      billId = Number(r.lastInsertRowid);
    }

    for (const item of group) {
      const transport = (item as any).运输方式 || '海运';
      const cargo = (item as any).货型 || '普货';
      const warehouse = (item as any).仓库 || null;
      const unitPrice = getPrice(warehouse, transport, cargo);
      const vol = (item as any).单箱体积 || (item as any).总体积 || 0;
      const chargeVol = Math.max(vol, minVol(transport));
      const receivable = isSc
        ? ((item as any).客户应收 || (unitPrice * chargeVol))
        : ((item as any).需支付总价 || (unitPrice * chargeVol));
      const cost = (item as any).需支付总价 || 0;

      totalReceivable += receivable;

      await db.insert(billItems).values({
        billId, markId, mode: isSc ? '拼柜' : '装柜',
        amount: receivable,
        costAmount: cost,
      });
    }

    const keepPaid = (existing as any)?.paidAmount || 0;
    const newStatus = keepPaid > 0 ? (totalReceivable > keepPaid ? '付一部分' : '已付款') : '待付款';
    await db.update(bills).set({ totalAmount: totalReceivable, status: '已生成', remainingAmount: Math.max(0, totalReceivable - keepPaid), paymentStatus: newStatus }).where(eq(bills.id, billId));

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
