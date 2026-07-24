import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { directIncome, expenses, customers, sharedContainerItems, loadingItems, marks, sharedContainerBatches, loadingBatches, paymentsReceived, bills, billItems, fullContainerBatches, fullContainerItems } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { formatAmount } from '@/lib/format';

export default async function MonthlyReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'operator')
    return <Card><CardContent className="py-8 text-center text-muted-foreground">无权限</CardContent></Card>;

  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));
  const custCurrencyMap = new Map(allCustomers.map(c => [c.id, c.defaultCurrency || 'CNY']));

  const allScItems = await db.select().from(sharedContainerItems).all();
  const allLdItems = await db.select().from(loadingItems).all();

  // 整柜(FCL)：应收/已付/剩余进收入，货款进成本，与拼柜/装柜对称。归月按柜 month_tag，币种按柜 currency，全部柜都算
  const allFcBatches = await db.select().from(fullContainerBatches).all();
  const allFcItems = await db.select().from(fullContainerItems).all();
  const fcBatchMonth = new Map(allFcBatches.map(b => [b.id, b.monthTag]));
  const fcIsTHB = (b: typeof allFcBatches[number]) => (b.currency || 'CNY') === 'THB';

  // 按业务月份(唛头monthTag)归月，只统计已确认(非待审核)批次
  const allMarks = await db.select().from(marks).all();
  const markMonthMap = new Map(allMarks.map(m => [m.id, m.monthTag]));
  const allScBatches = await db.select().from(sharedContainerBatches).all();
  const allLdBatches = await db.select().from(loadingBatches).all();
  const scBatchOk = new Map(allScBatches.map(b => [b.id, b.status !== '待审核']));
  const ldBatchOk = new Map(allLdBatches.map(b => [b.id, b.status !== '待审核']));

  // 按月汇总直接收入
  const incomeByMonth = await db
    .select({
      month: sql<string>`substr(income_date, 1, 7)`,
      currency: directIncome.currency,
      total: sql<number>`sum(amount)`,
    })
    .from(directIncome)
    .groupBy(sql`substr(income_date, 1, 7)`, directIncome.currency)
    .all();

  // 按月汇总自建费用
  const expenseByMonth = await db
    .select({
      month: sql<string>`substr(created_at, 1, 7)`,
      currency: expenses.currency,
      total: sql<number>`sum(amount)`,
    })
    .from(expenses)
    .groupBy(sql`substr(created_at, 1, 7)`, expenses.currency)
    .all();

  // 按币种拆分 sc/ld 的应收和成本
  const accumByMonth = new Map<string, { recCNY: number; recTHB: number; costCNY: number; costTHB: number }>();
  const ensure = (m: string) => { if (!accumByMonth.has(m)) accumByMonth.set(m, { recCNY: 0, recTHB: 0, costCNY: 0, costTHB: 0 }); return accumByMonth.get(m)!; };

  // 按 月份+客户 汇总完整营收(含拼柜/装柜客户应收，不只直接收入)
  const revByMonthCust = new Map<string, Map<number, { CNY: number; THB: number }>>();
  const ensureRC = (m: string, cid: number) => {
    if (!revByMonthCust.has(m)) revByMonthCust.set(m, new Map());
    const mm = revByMonthCust.get(m)!;
    if (!mm.has(cid)) mm.set(cid, { CNY: 0, THB: 0 });
    return mm.get(cid)!;
  };

  // 账单覆盖：已生成账单的唛头，应收用账单值(可能被手动调整)；未生成账单的用系统算的。成本永远按源明细。
  const allBills = await db.select().from(bills).all();
  const billById = new Map(allBills.map(b => [b.id, b]));
  const allBillItems = await db.select().from(billItems).all();
  const billByMark = new Map<number, { amount: number; isThb: boolean; monthTag: string; customerId: number }>();
  for (const bi of allBillItems) {
    const b = billById.get(bi.billId);
    if (!b) continue;
    const prev = billByMark.get(bi.markId);
    if (prev) prev.amount += Number(bi.amount) || 0;
    else billByMark.set(bi.markId, { amount: Number(bi.amount) || 0, isThb: (b.currency || 'CNY') === 'THB', monthTag: b.monthTag, customerId: b.customerId });
  }
  const isBilled = (mid: number) => billByMark.has(mid);

  for (const item of [...allScItems, ...allLdItems]) {
    const ok = (item as any).cost_status !== undefined ? scBatchOk.get(item.batchId) : ldBatchOk.get(item.batchId);
    if (ok !== true) continue; // 待审核不计入
    const month = markMonthMap.get(item.markId); // 业务月份
    if (!month) continue;
    const isThb = custCurrencyMap.get(item.customerId) === 'THB';
    const rec = Number(item.客户应收) || 0;
    const e = ensure(month);
    // 应收：已开账单的唛头跳过源值(后面用账单值补)；成本始终按源明细
    if (!isBilled(item.markId)) {
      const rc = ensureRC(month, item.customerId);
      if (isThb) { e.recTHB += rec; rc.THB += rec; }
      else { e.recCNY += rec; rc.CNY += rec; }
    }
    e.costCNY += (item.需支付总价 || 0);
  }
  // 补进账单应收(按账单月份/客户/币种)
  for (const v of billByMark.values()) {
    const e = ensure(v.monthTag);
    const rc = ensureRC(v.monthTag, v.customerId);
    if (v.isThb) { e.recTHB += v.amount; rc.THB += v.amount; }
    else { e.recCNY += v.amount; rc.CNY += v.amount; }
  }

  // 整柜应收进应收(按柜 month_tag/客户/币种)、整柜货款进成本(按柜 month_tag)
  for (const b of allFcBatches) {
    const month = b.monthTag; if (!month) continue;
    const rec = Number(b.整柜应收) || 0;
    if (rec > 0) {
      const e = ensure(month);
      const rc = b.customerId != null ? ensureRC(month, b.customerId) : null;
      if (fcIsTHB(b)) { e.recTHB += rec; if (rc) rc.THB += rec; }
      else { e.recCNY += rec; if (rc) rc.CNY += rec; }
    }
  }
  for (const item of allFcItems) {
    const month = fcBatchMonth.get(item.batchId); if (!month) continue;
    ensure(month).costCNY += (Number(item.需支付总价) || 0);
  }

  // 已收: 按收款日期归月(客户收款记录)
  const allReceived = await db.select().from(paymentsReceived).all();
  const recvByMonth = new Map<string, { CNY: number; THB: number }>();
  const ensureRcv = (m: string) => { if (!recvByMonth.has(m)) recvByMonth.set(m, { CNY: 0, THB: 0 }); return recvByMonth.get(m)!; };
  for (const p of allReceived) {
    const mo = (p.receivedDate || '').substring(0, 7); if (!mo) continue;
    const e = ensureRcv(mo);
    if (p.currency === 'THB') e.THB += p.amount; else e.CNY += p.amount;
  }
  // 整柜已付进已收(按柜 month_tag，币种按柜 currency)
  for (const b of allFcBatches) {
    const paid = Number(b.已付) || 0; if (paid <= 0 || !b.monthTag) continue;
    const e = ensureRcv(b.monthTag);
    if (fcIsTHB(b)) e.THB += paid; else e.CNY += paid;
  }

  // 已付: 货款(sc/ld已付,按付款日期,货款恒CNY) + 费用(已支付,按付款日期)
  const allExpRaw = await db.select().from(expenses).all();
  const paidByMonth = new Map<string, { CNY: number; THB: number }>();
  const ensurePaid = (m: string) => { if (!paidByMonth.has(m)) paidByMonth.set(m, { CNY: 0, THB: 0 }); return paidByMonth.get(m)!; };
  for (const item of allScItems) {
    if (item.cost_status !== '已支出') continue;
    const mo = ((item as any).paidDate || '').substring(0, 7); if (!mo) continue;
    ensurePaid(mo).CNY += (item.需支付总价 || 0);
  }
  for (const item of allLdItems) {
    if (item.payment_status !== '已支付') continue;
    const mo = ((item as any).paidDate || '').substring(0, 7); if (!mo) continue;
    ensurePaid(mo).CNY += (item.需支付总价 || 0);
  }
  for (const item of allFcItems) {
    if (item.payment_status !== '已支付') continue;
    const mo = ((item as any).paidDate || '').substring(0, 7); if (!mo) continue;
    ensurePaid(mo).CNY += (Number(item.需支付总价) || 0);
  }
  for (const e of allExpRaw) {
    if (e.status !== '已支付') continue;
    const mo = (e.paidDate || e.createdAt || '').substring(0, 7); if (!mo) continue;
    const p = ensurePaid(mo);
    if (e.currency === 'THB') p.THB += e.amount; else p.CNY += e.amount;
  }

  // 按客户汇总直接收入
  const incomeByMonthCustomer = await db
    .select({
      month: sql<string>`substr(income_date, 1, 7)`,
      customerId: directIncome.customerId,
      currency: directIncome.currency,
      total: sql<number>`sum(amount)`,
    })
    .from(directIncome)
    .groupBy(sql`substr(income_date, 1, 7)`, directIncome.customerId, directIncome.currency)
    .all();

  // 直接收入并入按客户营收
  for (const r of incomeByMonthCustomer) {
    if (!r.month || r.customerId == null) continue;
    const rc = ensureRC(r.month, r.customerId);
    if (r.currency === 'THB') rc.THB += r.total || 0; else rc.CNY += r.total || 0;
  }

  // 收集所有月份
  const allMonths = [...new Set([
    ...incomeByMonth.map(r => r.month),
    ...expenseByMonth.map(r => r.month),
    ...accumByMonth.keys(),
    ...recvByMonth.keys(),
    ...paidByMonth.keys(),
  ])].filter(Boolean).sort().reverse();

  // 每月汇总(应收/已收/成本/已付) + 全月合计。系统不算利润(跨币种汇率不好算,用户手动)
  const monthAgg = allMonths.map((month) => {
    const directCNY = incomeByMonth.filter(r => r.month === month && r.currency !== 'THB').reduce((s, r) => s + (r.total || 0), 0);
    const directTHB = incomeByMonth.filter(r => r.month === month && r.currency === 'THB').reduce((s, r) => s + (r.total || 0), 0);
    const am = accumByMonth.get(month) || { recCNY: 0, recTHB: 0, costCNY: 0, costTHB: 0 };
    const revCNY = directCNY + am.recCNY;
    const revTHB = directTHB + am.recTHB;
    const expCNY = expenseByMonth.filter(r => r.month === month && r.currency !== 'THB').reduce((s, r) => s + (r.total || 0), 0);
    const expTHB = expenseByMonth.filter(r => r.month === month && r.currency === 'THB').reduce((s, r) => s + (r.total || 0), 0);
    const costCNY = expCNY + am.costCNY;
    const costTHB = expTHB;
    const rcv = recvByMonth.get(month) || { CNY: 0, THB: 0 };
    const paid = paidByMonth.get(month) || { CNY: 0, THB: 0 };
    return { month, revCNY, revTHB, costCNY, costTHB, rcvCNY: rcv.CNY, rcvTHB: rcv.THB, paidCNY: paid.CNY, paidTHB: paid.THB };
  });
  const totalCNY = monthAgg.reduce((a, m) => ({ rev: a.rev + m.revCNY, cost: a.cost + m.costCNY, rcv: a.rcv + m.rcvCNY, paid: a.paid + m.paidCNY }), { rev: 0, cost: 0, rcv: 0, paid: 0 });
  const totalTHB = monthAgg.reduce((a, m) => ({ rev: a.rev + m.revTHB, cost: a.cost + m.costTHB, rcv: a.rcv + m.rcvTHB, paid: a.paid + m.paidTHB }), { rev: 0, cost: 0, rcv: 0, paid: 0 });

  // 待收/待付(累计,不分月): 待收=总应收-总已收(全部收款), 待付=总成本-总已付(全部已付)
  const paidAllCNY = allScItems.filter(i => i.cost_status === '已支出').reduce((s, i) => s + (i.需支付总价 || 0), 0)
    + allLdItems.filter(i => i.payment_status === '已支付').reduce((s, i) => s + (i.需支付总价 || 0), 0)
    + allFcItems.filter(i => i.payment_status === '已支付').reduce((s, i) => s + (Number(i.需支付总价) || 0), 0)
    + allExpRaw.filter(e => e.status === '已支付' && e.currency !== 'THB').reduce((s, e) => s + e.amount, 0);
  const paidAllTHB = allExpRaw.filter(e => e.status === '已支付' && e.currency === 'THB').reduce((s, e) => s + e.amount, 0);
  const rcvAllCNY = allReceived.filter(p => p.currency !== 'THB').reduce((s, p) => s + p.amount, 0)
    + allFcBatches.filter(b => !fcIsTHB(b)).reduce((s, b) => s + (Number(b.已付) || 0), 0);
  const rcvAllTHB = allReceived.filter(p => p.currency === 'THB').reduce((s, p) => s + p.amount, 0)
    + allFcBatches.filter(b => fcIsTHB(b)).reduce((s, b) => s + (Number(b.已付) || 0), 0);
  const pending = {
    recvCNY: Math.max(0, totalCNY.rev - rcvAllCNY), recvTHB: Math.max(0, totalTHB.rev - rcvAllTHB),
    payCNY: Math.max(0, totalCNY.cost - paidAllCNY), payTHB: Math.max(0, totalTHB.cost - paidAllTHB),
  };
  const hasTHB = monthAgg.some(m => m.revTHB || m.costTHB);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">月度报表</h1>

      {allMonths.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无数据</CardContent></Card>
      ) : (
        <>
          {/* 待收/待付(累计,不分月) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">待收 · 人民币</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-green-600">{formatAmount(pending.recvCNY)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">待付 · 人民币</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-red-600">{formatAmount(pending.payCNY)}</div></CardContent></Card>
            {hasTHB && <>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-orange-600">待收 · 泰铢</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-orange-600">{formatAmount(pending.recvTHB, 'THB')}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-orange-600">待付 · 泰铢</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-orange-600">{formatAmount(pending.payTHB, 'THB')}</div></CardContent></Card>
            </>}
          </div>

          {/* 全年概览(人民币) */}
          <Card>
            <CardHeader><CardTitle>各月概览 · 人民币</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>月份</TableHead><TableHead className="text-right">应收</TableHead><TableHead className="text-right">已收</TableHead><TableHead className="text-right">成本</TableHead><TableHead className="text-right">已付</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {monthAgg.map(m => (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium"><Link href={`/bills?month=${m.month}&tab=cny`} className="hover:underline">{m.month}</Link></TableCell>
                      <TableCell className="text-right">{formatAmount(m.revCNY)}</TableCell>
                      <TableCell className="text-right text-green-600">{formatAmount(m.rcvCNY)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatAmount(m.costCNY)}</TableCell>
                      <TableCell className="text-right">{formatAmount(m.paidCNY)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted">
                    <TableCell className="font-bold">合计</TableCell>
                    <TableCell className="text-right font-bold">{formatAmount(totalCNY.rev)}</TableCell>
                    <TableCell className="text-right font-bold text-green-600">{formatAmount(totalCNY.rcv)}</TableCell>
                    <TableCell className="text-right font-bold text-red-600">{formatAmount(totalCNY.cost)}</TableCell>
                    <TableCell className="text-right font-bold">{formatAmount(totalCNY.paid)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 全年概览(泰铢) */}
          {hasTHB && (
            <Card>
              <CardHeader><CardTitle className="text-orange-600">各月概览 · 泰铢</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>月份</TableHead><TableHead className="text-right">应收</TableHead><TableHead className="text-right">已收</TableHead><TableHead className="text-right">成本</TableHead><TableHead className="text-right">已付</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {monthAgg.map(m => (
                      <TableRow key={m.month}>
                        <TableCell className="font-medium"><Link href={`/bills?month=${m.month}&tab=thb`} className="hover:underline">{m.month}</Link></TableCell>
                        <TableCell className="text-right">{formatAmount(m.revTHB, 'THB')}</TableCell>
                        <TableCell className="text-right text-green-600">{formatAmount(m.rcvTHB, 'THB')}</TableCell>
                        <TableCell className="text-right text-red-600">{formatAmount(m.costTHB, 'THB')}</TableCell>
                        <TableCell className="text-right">{formatAmount(m.paidTHB, 'THB')}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted">
                      <TableCell className="font-bold">合计</TableCell>
                      <TableCell className="text-right font-bold">{formatAmount(totalTHB.rev, 'THB')}</TableCell>
                      <TableCell className="text-right font-bold text-green-600">{formatAmount(totalTHB.rcv, 'THB')}</TableCell>
                      <TableCell className="text-right font-bold text-red-600">{formatAmount(totalTHB.cost, 'THB')}</TableCell>
                      <TableCell className="text-right font-bold">{formatAmount(totalTHB.paid, 'THB')}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* 每月详情 */}
          {monthAgg.map((m) => {
            const byCustomer = revByMonthCust.get(m.month) || new Map<number, { CNY: number; THB: number }>();
            const cnyCusts = Array.from(byCustomer.entries()).filter(([, v]) => v.CNY > 0).sort((a, b) => b[1].CNY - a[1].CNY);
            const thbCusts = Array.from(byCustomer.entries()).filter(([, v]) => v.THB > 0).sort((a, b) => b[1].THB - a[1].THB);
            return (
              <Card key={m.month}>
                <CardHeader><CardTitle>{m.month}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm font-bold text-muted-foreground">人民币</p>
                  <div className="grid grid-cols-2 gap-4">
                    <Link href={`/bills?month=${m.month}&tab=cny`} className="block">
                      <div className="text-center p-3 bg-muted rounded-lg hover:bg-muted/70 cursor-pointer">
                        <p className="text-sm text-muted-foreground">应收 ›</p>
                        <p className="text-lg font-bold">{formatAmount(m.revCNY)}</p>
                      </div>
                    </Link>
                    <Link href={`/expenses?month=${m.month}`} className="block">
                      <div className="text-center p-3 bg-muted rounded-lg hover:bg-muted/70 cursor-pointer">
                        <p className="text-sm text-muted-foreground">成本 ›</p>
                        <p className="text-lg font-bold text-red-600">{formatAmount(m.costCNY)}</p>
                      </div>
                    </Link>
                  </div>
                  {cnyCusts.length > 0 && (
                    <Table>
                      <TableHeader><TableRow><TableHead>客户</TableHead><TableHead className="text-right">应收(CNY)</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {cnyCusts.map(([cid, v]) => (
                          <TableRow key={cid}><TableCell>{customerMap.get(cid) || '-'}</TableCell><TableCell className="text-right">{formatAmount(v.CNY)}</TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {(m.revTHB || m.costTHB || thbCusts.length > 0) && (
                    <>
                      <p className="text-sm font-bold text-orange-600">泰铢</p>
                      <div className="grid grid-cols-2 gap-4">
                        <Link href={`/bills?month=${m.month}&tab=thb`} className="block">
                          <div className="text-center p-3 bg-muted rounded-lg hover:bg-muted/70 cursor-pointer">
                            <p className="text-sm text-muted-foreground text-orange-600">应收 ›</p>
                            <p className="text-lg font-bold text-orange-600">{formatAmount(m.revTHB, 'THB')}</p>
                          </div>
                        </Link>
                        <Link href={`/expenses?month=${m.month}`} className="block">
                          <div className="text-center p-3 bg-muted rounded-lg hover:bg-muted/70 cursor-pointer">
                            <p className="text-sm text-muted-foreground text-orange-600">成本 ›</p>
                            <p className="text-lg font-bold text-orange-600">{formatAmount(m.costTHB, 'THB')}</p>
                          </div>
                        </Link>
                      </div>
                      {thbCusts.length > 0 && (
                        <Table>
                          <TableHeader><TableRow><TableHead>客户</TableHead><TableHead className="text-right">应收(THB)</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {thbCusts.map(([cid, v]) => (
                              <TableRow key={cid}><TableCell>{customerMap.get(cid) || '-'}</TableCell><TableCell className="text-right">{formatAmount(v.THB, 'THB')}</TableCell></TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
