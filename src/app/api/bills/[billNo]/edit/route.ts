import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { bills, billItems, billLines, marks, sharedContainerItems, loadingItems, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, and, inArray } from 'drizzle-orm';
import { cargoKey, waybillReceivable } from '@/lib/pricing';

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const round2 = (n: number) => Math.round(n * 100) / 100;

function getMatrixPrice(pm: any, warehouse: string | null, transport: string, cargo: string | null | undefined): number {
  const m = transport === '海运' ? 'sea' : 'land';
  const t = cargoKey(cargo);
  const key = m + '_' + t;
  if (warehouse && typeof pm[warehouse] === 'object' && pm[warehouse] !== null && typeof pm[warehouse][key] === 'number') return (pm[warehouse] as any)[key];
  return typeof pm[key] === 'number' ? pm[key] : 0;
}

// 首次编辑时把原始明细快照进 bill_lines，之后账单只读/改这份快照，绝不动成本明细
function ensureSnapshot(tx: any, billId: number) {
  const existing = tx.select({ id: billLines.id }).from(billLines).where(eq(billLines.billId, billId)).all();
  if (existing.length > 0) return;

  const its = tx.select({ markId: billItems.markId }).from(billItems).where(eq(billItems.billId, billId)).all();
  const markIds = [...new Set(its.map((i: any) => i.markId))] as number[];
  if (markIds.length === 0) return;

  const sc = tx.select().from(sharedContainerItems).where(inArray(sharedContainerItems.markId, markIds)).all();
  const ld = tx.select().from(loadingItems).where(inArray(loadingItems.markId, markIds)).all();

  const push = (i: any, type: 'sc' | 'ld') => {
    tx.insert(billLines).values({
      billId, markId: i.markId, sourceType: type, sourceItemId: i.id,
      运单号: i.运单号 ?? null, 品名: i.品名 ?? null, 仓库: i.仓库 ?? null,
      货型: i.货型 ?? null, 运输方式: i.运输方式 ?? null,
      尺寸_长: i.尺寸_长 ?? null, 尺寸_宽: i.尺寸_宽 ?? null, 尺寸_高: i.尺寸_高 ?? null,
      单项体积: i.单项体积 ?? null, 总体积: i.总体积 ?? null, 箱数: i.箱数 ?? null,
      国内单号: i.国内单号 ?? null, 总重量: i.总重量 ?? null,
      需支付总价: i.需支付总价 ?? null, 客户应收: Number(i.客户应收) || 0,
    }).run();
  };
  for (const i of sc) push(i, 'sc');
  for (const i of ld) push(i, 'ld');
}

// 重算某运单的应收(客户价×max(总体积,低消))，落运单首条其余0；成本永不动
function recalcWaybillReceivable(tx: any, billId: number, markId: number, 运单号: string | null, pm: any, enableMin: boolean) {
  const lines = tx.select().from(billLines).where(eq(billLines.billId, billId)).all()
    .filter((l: any) => l.markId === markId && (l.运单号 ?? null) === (运单号 ?? null));
  if (lines.length === 0) return;
  const first = lines[0];
  const transport = first.运输方式 || '海运';
  const warehouse = first.仓库 || null;
  const minVol = enableMin ? (transport === '海运' ? 0.5 : 0.3) : 0;
  const receivable = waybillReceivable(lines, (cargo) => getMatrixPrice(pm, warehouse, transport, cargo), minVol);
  tx.update(billLines).set({ 客户应收: receivable }).where(eq(billLines.id, first.id)).run();
  for (let i = 1; i < lines.length; i++) tx.update(billLines).set({ 客户应收: 0 }).where(eq(billLines.id, lines[i].id)).run();
}

// 重算账单每唛头小计。bill_items 每唛头有多行(每条明细一行),
// 把该唛头应收合计落在第一行,其余行置0,保证按唛头求和正确、不翻倍。
function recalcBillItems(tx: any, billId: number) {
  const lines = tx.select().from(billLines).where(eq(billLines.billId, billId)).all();
  const byMark = new Map<number, number>();
  for (const l of lines) byMark.set(l.markId, (byMark.get(l.markId) || 0) + (Number(l.客户应收) || 0));

  const bitems = tx.select().from(billItems).where(eq(billItems.billId, billId)).all();
  const seen = new Set<number>();
  for (const bi of bitems) {
    const isFirst = !seen.has(bi.markId);
    seen.add(bi.markId);
    const amount = isFirst ? round2(byMark.get(bi.markId) || 0) : 0;
    tx.update(billItems).set({ amount }).where(eq(billItems.id, bi.id)).run();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ billNo: string }> }) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || (user.role !== 'admin' && user.role !== 'finance')) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { billNo } = await params;
  const body = await request.json();

  try {
    const bill = db.select().from(bills).where(eq(bills.billNo, billNo)).get();
    if (!bill) return NextResponse.json({ error: '账单不存在' }, { status: 404 });

    // 客户价格矩阵(账单币种对应)
    const cust = db.select().from(customers).where(eq(customers.id, bill.customerId)).get();
    let pm: any = {};
    const isThb = (bill.currency || 'CNY') === 'THB';
    if (isThb) { if (cust?.priceMatrixThb) try { pm = JSON.parse(cust.priceMatrixThb); } catch {} }
    else if (cust?.priceMatrix) { try { pm = JSON.parse(cust.priceMatrix); } catch {} }
    const enableMin = cust?.enableMinVolume !== 0;

    db.transaction((tx) => {
      ensureSnapshot(tx, bill.id);

      // 用 源类型+源明细id 定位(首次快照后 sourceItemId 恒定，前端不必知道 bill_line id)
      const line = tx.select().from(billLines).where(and(
        eq(billLines.billId, bill.id),
        eq(billLines.sourceType, body.sourceType),
        eq(billLines.sourceItemId, body.sourceItemId),
      )).get();
      if (!line) throw new Error('明细不存在');

      if (body.type === 'dims') {
        const L = Number(body.尺寸_长) || 0, W = Number(body.尺寸_宽) || 0, H = Number(body.尺寸_高) || 0;
        const boxes = Number(line.箱数) || 1;
        const unitVol = round6((L * W * H) / 1e6 * boxes);
        tx.update(billLines).set({ 尺寸_长: L, 尺寸_宽: W, 尺寸_高: H, 单项体积: unitVol }).where(eq(billLines.id, line.id)).run();
        // 该运单总体积 = 组内单项体积之和，写回组内每条
        const grp = tx.select().from(billLines).where(eq(billLines.billId, bill.id)).all()
          .filter((l: any) => l.markId === line.markId && (l.运单号 ?? null) === (line.运单号 ?? null));
        let sum = 0;
        for (const g of grp) sum += Number(g.id === line.id ? unitVol : g.单项体积) || 0;
        const totalVol = round6(sum);
        for (const g of grp) tx.update(billLines).set({ 总体积: totalVol }).where(eq(billLines.id, g.id)).run();
        recalcWaybillReceivable(tx, bill.id, line.markId, line.运单号 ?? null, pm, enableMin);
      } else if (body.type === 'recv') {
        // 直接手输应收，覆盖到该运单首条，其余0
        const grp = tx.select().from(billLines).where(eq(billLines.billId, bill.id)).all()
          .filter((l: any) => l.markId === line.markId && (l.运单号 ?? null) === (line.运单号 ?? null));
        const val = round2(Number(body.客户应收) || 0);
        tx.update(billLines).set({ 客户应收: val }).where(eq(billLines.id, grp[0].id)).run();
        for (let i = 1; i < grp.length; i++) tx.update(billLines).set({ 客户应收: 0 }).where(eq(billLines.id, grp[i].id)).run();
      } else {
        throw new Error('未知编辑类型');
      }

      recalcBillItems(tx, bill.id);

      // 账单总额 = 各唛头小计之和
      const items = tx.select().from(billItems).where(eq(billItems.billId, bill.id)).all();
      const total = round2(items.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0));
      const paid = Number(bill.paidAmount) || 0;
      tx.update(bills).set({
        totalAmount: total, remainingAmount: round2(total - paid), manualAdjusted: 1,
      }).where(eq(bills.id, bill.id)).run();
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('编辑账单失败:', e);
    return NextResponse.json({ error: e?.message || '编辑失败' }, { status: 500 });
  }
}
