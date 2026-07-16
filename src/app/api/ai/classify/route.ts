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

  const { batchId, batchIds, type = 'shared-container' } = await request.json();
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
      if (wh && typeof pm[wh] === 'object' && pm[wh] !== null) {
        const whPrices = pm[wh] as any;
        if (typeof whPrices[key] === 'number') return whPrices[key];
      }
      return typeof pm[key] === 'number' ? pm[key] : 0;
    };
    const minVol = (transport: string): number => {
      if (!enableMinVol) return 0;
      return transport === '海运' ? 0.5 : 0.3;
    };

    const monthTag = mark?.monthTag || new Date().toISOString().substring(0, 7);
    const billNo = `${markNo}-${monthTag}${customer?.defaultCurrency === 'THB' ? '-THB' : ''}`;

    if (!custId || custId <= 0) {
      results.push({ markId, billId: 0, billNo, markNo, customerName: '未知客户', itemCount: group.length, totalVolume: round6(0), totalCost: 0, error: '无有效客户' });
      continue;
    }

    // ── 读取阶段（事务外） ──
    const existing = await db.select().from(bills).where(eq(bills.billNo, billNo)).get();
    const isExisting = !!existing;

    if (existing) {
      if (existing.paymentStatus === '已付款' || existing.paymentStatus === '付一部分') {
        results.push({ markId, billId: existing.id, billNo, markNo, customerName: custMap.get(custId)?.name || markNo, itemCount: group.length, totalVolume: round6(0), totalCost: round6(0), skipped: true });
        continue;
      }
    }

    // 确定参与计算的明细范围：账单已存在时取该唛头全部明细，否则只取本次选中批次的
    let calcItems: any[];
    if (isExisting) {
      const allSc = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, markId)).all();
      const allLd = await db.select().from(loadingItems).where(eq(loadingItems.markId, markId)).all();
      calcItems = [...allSc, ...allLd];
    } else {
      calcItems = group;
    }

    // ── 计算阶段（事务外，纯内存） ──
    const orderGroups = new Map<string, any[]>();
    for (const item of calcItems) {
      const ok = item.运单号 || '_' + item.id;
      if (!orderGroups.has(ok)) orderGroups.set(ok, []);
      orderGroups.get(ok)!.push(item);
    }

    let totalReceivable = 0;
    let totalVol = 0;
    const missingPriceOrders: string[] = [];
    const keepPaid = (existing as any)?.paidAmount || 0;

    interface WriteItem { table: 'sc' | 'ld'; id: number; rec: number; }
    interface NewBillItem { markId: number; mode: string; amount: number; costAmount: number; }
    const updates: WriteItem[] = [];
    const newBillItems: NewBillItem[] = [];

    for (const [ok, items] of orderGroups) {
      let orderVol = 0;
      for (const item of items) orderVol = Math.max(orderVol, item.总体积 || 0);

      const first = items[0];
      const transport = first.运输方式 || '海运';
      const cargo = first.货型 || '普货';
      const warehouse = first.仓库 || null;
      const unitPrice = getPrice(warehouse, transport, cargo);
      const chargeVol = Math.max(orderVol, minVol(transport));
      const orderReceivable = unitPrice * chargeVol;

      totalVol += first.总体积 || 0;

      if (unitPrice === 0 && orderVol > 0) {
        missingPriceOrders.push(`运单${ok}（仓库:${warehouse || '未知'}, ${transport}/${cargo}）未配置价格，应收为0`);
      }

      totalReceivable += orderReceivable;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const cost = item.需支付总价 || 0;
        const rec = i === 0 ? orderReceivable : 0;
        const itemIsSc = (item as any).cost_status !== undefined;
        updates.push({ table: itemIsSc ? 'sc' : 'ld', id: item.id, rec });
        newBillItems.push({ markId, mode: itemIsSc ? '拼柜' : '装柜', amount: rec, costAmount: cost });
      }
    }

    const newStatus = keepPaid > 0 ? (totalReceivable > keepPaid ? '付一部分' : '已付款') : '待付款';

    // ── 写入阶段（事务内，同步） ──
    let finalBillId = 0;
    try {
      db.transaction((tx) => {
        let bid: number;
        if (isExisting) {
          tx.delete(billItems).where(eq(billItems.billId, existing!.id)).run();
          bid = existing!.id;
        } else {
          const r = tx.insert(bills).values({
            billNo, customerId: custId, monthTag, totalAmount: 0,
            currency: customer?.defaultCurrency || 'CNY', status: '已生成',
          }).run();
          bid = Number(r.lastInsertRowid);
        }

        for (const u of updates) {
          if (u.table === 'sc') {
            tx.update(sharedContainerItems).set({ 客户应收: u.rec }).where(eq(sharedContainerItems.id, u.id)).run();
          } else {
            tx.update(loadingItems).set({ 客户应收: u.rec }).where(eq(loadingItems.id, u.id)).run();
          }
        }

        for (const bi of newBillItems) {
          tx.insert(billItems).values({
            billId: bid, markId: bi.markId, mode: bi.mode,
            amount: bi.amount, costAmount: bi.costAmount,
          }).run();
        }

        tx.update(bills).set({
          totalAmount: totalReceivable, status: '已生成',
          remainingAmount: Math.max(0, totalReceivable - keepPaid),
          paymentStatus: newStatus,
        }).where(eq(bills.id, bid)).run();

        finalBillId = bid;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ markId, billId: 0, billNo, markNo, customerName: custMap.get(custId)?.name || markNo, itemCount: calcItems.length, totalVolume: round6(totalVol), totalCost: 0, error: `写入失败: ${msg}` });
      continue;
    }

    results.push({ markId,
      billId: finalBillId, billNo, markNo, customerName: custMap.get(custId)?.name || markNo,
      itemCount: calcItems.length, totalVolume: round6(totalVol), totalCost: round6(totalReceivable),
      warnings: missingPriceOrders.length > 0 ? missingPriceOrders : undefined,
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
