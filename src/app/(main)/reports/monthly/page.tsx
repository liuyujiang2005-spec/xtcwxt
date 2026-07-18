import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { directIncome, expenses, customers, sharedContainerItems, loadingItems } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

  for (const item of allScItems) {
    const month = item.createdAt?.substring(0, 7);
    if (!month) continue;
    const isThb = custCurrencyMap.get(item.customerId) === 'THB';
    const e = ensure(month);
    if (isThb) { e.recTHB += (item.客户应收 || 0); }
    else { e.recCNY += (item.客户应收 || 0); }
    e.costCNY += (item.需支付总价 || 0);
  }
  for (const item of allLdItems) {
    const month = item.createdAt?.substring(0, 7);
    if (!month) continue;
    const isThb = custCurrencyMap.get(item.customerId) === 'THB';
    const e = ensure(month);
    if (isThb) { e.recTHB += (item.客户应收 || 0); }
    else { e.recCNY += (item.客户应收 || 0); }
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

  // 收集所有月份
  const allMonths = [...new Set([
    ...incomeByMonth.map(r => r.month),
    ...expenseByMonth.map(r => r.month),
    ...accumByMonth.keys(),
  ])].filter(Boolean).sort().reverse();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">月度报表</h1>
      {allMonths.map((month) => {
        const directCNY = incomeByMonth.filter(r => r.month === month && r.currency !== 'THB').reduce((s, r) => s + (r.total || 0), 0);
        const directTHB = incomeByMonth.filter(r => r.month === month && r.currency === 'THB').reduce((s, r) => s + (r.total || 0), 0);
        const am = accumByMonth.get(month) || { recCNY: 0, recTHB: 0, costCNY: 0, costTHB: 0 };
        const revenueCNY = directCNY + am.recCNY;
        const revenueTHB = directTHB + am.recTHB;

        const expCNY = expenseByMonth.filter(r => r.month === month && r.currency !== 'THB').reduce((s, r) => s + (r.total || 0), 0);
        const expTHB = expenseByMonth.filter(r => r.month === month && r.currency === 'THB').reduce((s, r) => s + (r.total || 0), 0);
        const costCNY = expCNY + am.costCNY;
        const costTHB = expTHB;

        // 按客户汇总（只含直接收入部分）
        const byCustomer = new Map<number, { CNY: number; THB: number }>();
        incomeByMonthCustomer.filter(r => r.month === month).forEach((r) => {
          const e = byCustomer.get(r.customerId!) || { CNY: 0, THB: 0 };
          if (r.currency === 'THB') e.THB += r.total || 0; else e.CNY += r.total || 0;
          byCustomer.set(r.customerId!, e);
        });

        return (
          <Card key={month}>
            <CardHeader><CardTitle>{month}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-bold text-muted-foreground">人民币</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">营收</p>
                  <p className="text-lg font-bold">{formatAmount(revenueCNY)}</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">支出</p>
                  <p className="text-lg font-bold text-red-600">{formatAmount(costCNY)}</p>
                </div>
              </div>
              {byCustomer.size > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>客户</TableHead>
                      <TableHead className="text-right">CNY</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from(byCustomer.entries()).filter(([_, v]) => v.CNY > 0).map(([cid, v]) => (
                      <TableRow key={cid}>
                        <TableCell>{customerMap.get(cid) || '-'}</TableCell>
                        <TableCell className="text-right">{formatAmount(v.CNY)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="text-sm font-bold text-orange-600">泰铢</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground text-orange-600">营收</p>
                  <p className="text-lg font-bold text-orange-600">{formatAmount(revenueTHB, 'THB')}</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground text-orange-600">支出</p>
                  <p className="text-lg font-bold text-orange-600">{formatAmount(costTHB, 'THB')}</p>
                </div>
              </div>
              {byCustomer.size > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>客户</TableHead>
                      <TableHead className="text-right">THB</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from(byCustomer.entries()).filter(([_, v]) => v.THB > 0).map(([cid, v]) => (
                      <TableRow key={cid}>
                        <TableCell>{customerMap.get(cid) || '-'}</TableCell>
                        <TableCell className="text-right">{formatAmount(v.THB, 'THB')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}
      {allMonths.length === 0 && <Card><CardContent className="py-8 text-center text-muted-foreground">暂无数据</CardContent></Card>}
    </div>
  );
}
