import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { directIncome, expenses, customers, sharedContainerItems, loadingItems, marks, sharedContainerBatches, loadingBatches } from '@/db/schema';
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

  for (const item of [...allScItems, ...allLdItems]) {
    const ok = (item as any).cost_status !== undefined ? scBatchOk.get(item.batchId) : ldBatchOk.get(item.batchId);
    if (ok !== true) continue; // 待审核不计入
    const month = markMonthMap.get(item.markId); // 业务月份
    if (!month) continue;
    const isThb = custCurrencyMap.get(item.customerId) === 'THB';
    const rec = Number(item.客户应收) || 0;
    const e = ensure(month);
    const rc = ensureRC(month, item.customerId);
    if (isThb) { e.recTHB += rec; rc.THB += rec; }
    else { e.recCNY += rec; rc.CNY += rec; }
    e.costCNY += (item.需支付总价 || 0);
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
  ])].filter(Boolean).sort().reverse();

  // 每月汇总(应收/成本) + 全月合计。系统不算利润(跨币种汇率不好算,用户手动)
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
    return { month, revCNY, revTHB, costCNY, costTHB };
  });
  const totalCNY = monthAgg.reduce((a, m) => ({ rev: a.rev + m.revCNY, cost: a.cost + m.costCNY }), { rev: 0, cost: 0 });
  const totalTHB = monthAgg.reduce((a, m) => ({ rev: a.rev + m.revTHB, cost: a.cost + m.costTHB }), { rev: 0, cost: 0 });
  const hasTHB = monthAgg.some(m => m.revTHB || m.costTHB);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">月度报表</h1>

      {allMonths.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无数据</CardContent></Card>
      ) : (
        <>
          {/* 全年概览(人民币) */}
          <Card>
            <CardHeader><CardTitle>各月概览 · 人民币</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>月份</TableHead><TableHead className="text-right">应收</TableHead><TableHead className="text-right">成本</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {monthAgg.map(m => (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium"><Link href={`/bills?month=${m.month}&tab=cny`} className="hover:underline">{m.month}</Link></TableCell>
                      <TableCell className="text-right">{formatAmount(m.revCNY)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatAmount(m.costCNY)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted">
                    <TableCell className="font-bold">合计</TableCell>
                    <TableCell className="text-right font-bold">{formatAmount(totalCNY.rev)}</TableCell>
                    <TableCell className="text-right font-bold text-red-600">{formatAmount(totalCNY.cost)}</TableCell>
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
                    <TableHead>月份</TableHead><TableHead className="text-right">应收</TableHead><TableHead className="text-right">成本</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {monthAgg.map(m => (
                      <TableRow key={m.month}>
                        <TableCell className="font-medium"><Link href={`/bills?month=${m.month}&tab=thb`} className="hover:underline">{m.month}</Link></TableCell>
                        <TableCell className="text-right">{formatAmount(m.revTHB, 'THB')}</TableCell>
                        <TableCell className="text-right text-red-600">{formatAmount(m.costTHB, 'THB')}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted">
                      <TableCell className="font-bold">合计</TableCell>
                      <TableCell className="text-right font-bold">{formatAmount(totalTHB.rev, 'THB')}</TableCell>
                      <TableCell className="text-right font-bold text-red-600">{formatAmount(totalTHB.cost, 'THB')}</TableCell>
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
