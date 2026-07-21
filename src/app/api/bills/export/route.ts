import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, loadingItems, marks, billItems, billLines, customers, bills } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, inArray } from 'drizzle-orm';
import { generateBillXlsx, type BillRow } from '@/lib/generate-bill-xlsx';
import { cargoKey } from '@/lib/pricing';

function getMatrixPrice(pm: any, warehouse: string | null, transport: string, cargo: string): number {
  const m = transport === '海运' ? 'sea' : 'land';
  const t = cargoKey(cargo);
  const key = m + '_' + t;
  if (warehouse && pm[warehouse] && typeof pm[warehouse][key] === 'number') return pm[warehouse][key];
  return typeof pm[key] === 'number' ? pm[key] : 0;
}

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user) return NextResponse.json({ error: '登录已过期' }, { status: 401 });

  // 🔵修复：校验 billId 为正整数
  const billIdRaw = request.nextUrl.searchParams.get('billId') || '';
  const billId = parseInt(billIdRaw);
  if (!billId || billId <= 0 || String(billId) !== billIdRaw.trim()) {
    return NextResponse.json({ error: '无效的 billId' }, { status: 400 });
  }

  const bill = await db.select().from(bills).where(eq(bills.id, billId)).get();
  if (!bill) return NextResponse.json({ error: '账单不存在' }, { status: 404 });

  const bItems = await db.select().from(billItems).where(eq(billItems.billId, billId)).all();
  const markIds = [...new Set(bItems.map(i => i.markId))];
  if (markIds.length === 0) return NextResponse.json({ error: '无明细' }, { status: 404 });

  const markList = await db.select().from(marks).where(inArray(marks.id, markIds)).all();
  const markMap = new Map(markList.map(m => [m.id, m]));
  const customer = await db.select().from(customers).where(eq(customers.id, bill.customerId)).get();

  let pm: any = {};
  if (customer?.defaultCurrency === 'THB') {
    if (customer?.priceMatrixThb) try { pm = JSON.parse(customer.priceMatrixThb); } catch {}
  } else if (customer?.priceMatrix) {
    try { pm = JSON.parse(customer.priceMatrix); } catch {} }

  const enableMinVol = customer?.enableMinVolume !== 0;
  const minVol = (t: string): number => {
    if (!enableMinVol) return 0;
    return t === '海运' ? 0.5 : 0.3;
  };

  // 🟡修复：批量查询所有 mark 的 sc/ld items，避免循环内 N*2 次查询
  const allScItems = markIds.length > 0
    ? await db.select().from(sharedContainerItems).where(inArray(sharedContainerItems.markId, markIds)).all()
    : [];
  const allLdItems = markIds.length > 0
    ? await db.select().from(loadingItems).where(inArray(loadingItems.markId, markIds)).all()
    : [];

  const scByMark = new Map<number, typeof allScItems>();
  allScItems.forEach(i => {
    if (!scByMark.has(i.markId)) scByMark.set(i.markId, []);
    scByMark.get(i.markId)!.push(i);
  });
  const ldByMark = new Map<number, typeof allLdItems>();
  allLdItems.forEach(i => {
    if (!ldByMark.has(i.markId)) ldByMark.set(i.markId, []);
    ldByMark.get(i.markId)!.push(i);
  });

  // 账单手改过(有快照)则用 bill_lines 建行,反映用户改的尺寸/体积/应收;成本相关列不变
  const snapLines = await db.select().from(billLines).where(eq(billLines.billId, billId)).all();
  const hasSnapshot = snapLines.length > 0;
  // 快照缺的次要列(单项重量/备注)从源明细按 id 补(这些不可编辑,源值即可)
  const scExtra = new Map(allScItems.map(i => [i.id, i]));
  const ldExtra = new Map(allLdItems.map(i => [i.id, i]));
  const linesByMark = new Map<number, any[]>();
  if (hasSnapshot) {
    for (const l of snapLines) {
      const src: any = l.sourceType === 'sc' ? scExtra.get(l.sourceItemId as number) : ldExtra.get(l.sourceItemId as number);
      const mapped = { ...l, 单项重量: (src as any)?.单项重量 ?? 0, 备注: (src as any)?.备注 ?? '' };
      if (!linesByMark.has(l.markId)) linesByMark.set(l.markId, []);
      linesByMark.get(l.markId)!.push(mapped);
    }
  }

  const rows: BillRow[] = [];

  for (const mId of markIds) {
    const mark = markMap.get(mId);
    const allItems = hasSnapshot
      ? (linesByMark.get(mId) || [])
      : [...(scByMark.get(mId) || []), ...(ldByMark.get(mId) || [])];
    if (allItems.length === 0) continue;

    // ── 按运单号分组，计算每个运单的应收 ──
    const orderGroups = new Map<string, any[]>();
    for (const item of allItems) {
      const ok = (item as any).运单号 || '_' + (item as any).id;
      if (!orderGroups.has(ok)) orderGroups.set(ok, []);
      orderGroups.get(ok)!.push(item);
    }

    // 从已存客户应收取每个运单的应收（取最大值，第一条非0、其余为0）
    const orderReceivableMap = new Map<string, number>();
    const orderChargeVolMap = new Map<string, number>();

    for (const [ok, items] of orderGroups) {
      let maxRec = 0;
      let orderVol = 0;
      for (const item of items) {
        maxRec = Math.max(maxRec, (item as any).客户应收 || 0);
        orderVol = Math.max(orderVol, (item as any).总体积 || 0);
      }
      const first = items[0];
      const transport = (first as any).运输方式 || '海运';
      orderReceivableMap.set(ok, maxRec);
      orderChargeVolMap.set(ok, Math.max(orderVol, minVol(transport)));
    }

    // ── 生成行 ──
    for (const item of allItems) {
      const vol = (item as any).总体积 ?? 0;
      const transport = (item as any).运输方式 || '海运';
      const warehouse = (item as any).仓库 || null;
      const okey = (item as any).运单号 || '_' + (item as any).id;
      const up = getMatrixPrice(pm, warehouse, transport, (item as any).货型 || '');
      const cv = orderChargeVolMap.get(okey) || Math.max((item as any).单项体积 || 0, minVol(transport));
      const ct = (item as any).箱数 ?? 0;
      const oRec = orderReceivableMap.get(okey) || 0;

      const dims = [(item as any).尺寸_长, (item as any).尺寸_宽, (item as any).尺寸_高]
        .filter((d: any) => d != null && d > 0)
        .join('×');

      rows.push({
        日期: mark?.createdAt?.substring(0, 10) ?? bill.monthTag,
        唛头: mark?.markNo ?? '',
        仓库: (item as any).仓库 || '',
        运输方式: (item as any).运输方式 ?? '',
        运单号: (item as any).运单号 ?? mark?.markNo ?? '',
        货型: (item as any).货型 ?? '',
        品名: (item as any).品名 ?? '',
        尺寸: dims,
        件数: ct,
        国内单号: (item as any).国内单号 ?? '',
        单项体积: (item as any).单项体积 ?? 0,
        单项重量: (item as any).单项重量 ?? 0,
        总体积: vol,
        总重量: (item as any).总重量 ?? 0,
        计费体积: (item as any).单项体积 ?? 0,
        总计费体积: cv,
        单价: up,
        订单总价: oRec,
         备注: (item as any).备注 || '',
       });
    }
  }

  // 去重：同一运单号只计一次总额
  const seenOrders = new Set<string>();
  let dedupedTotal = 0;
  for (const row of rows) {
    const key = row.运单号 || row.唛头;
    if (!seenOrders.has(key)) {
      seenOrders.add(key);
      dedupedTotal += row.订单总价;
    }
  }

  try {
    await db.update(bills).set({ exportedAt: new Date().toISOString() }).where(eq(bills.id, billId));

    const buffer = await generateBillXlsx(
      customer?.name ?? '深圳新泓瀚国际物流有限公司',
      customer?.name ?? '未知客户',
      bill.monthTag,
      rows,
      dedupedTotal, // 修复：使用实际计算的总额
      0,
    );

    const fileName = '账单_' + (customer?.name ?? bill.billNo) + '_' + bill.monthTag + '.xlsx';
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(fileName),
      },
    });
  } catch (error) {
    console.error('账单导出失败:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
