import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { directIncome, expenses, customers, sharedContainerItems, loadingItems } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function MonthlyReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'operator') return <Card><CardContent className="py-8 text-center text-muted-foreground">无权限</CardContent></Card>;

  const allIncome = await db.select().from(directIncome).all();
  const allExpenses = await db.select().from(expenses).all();
  const allScItems = await db.select().from(sharedContainerItems).all();
  const allLdItems = await db.select().from(loadingItems).all();
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const months = [...new Set(allIncome.map((i) => i.incomeDate?.substring(0, 7)).filter(Boolean))].sort().reverse();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">月度报表</h1>
      {months.map((month) => {
        const monthIncome = allIncome.filter((i) => i.incomeDate?.startsWith(month));
        const revenueCNY = monthIncome.filter((i) => i.currency === 'CNY').reduce((s, i) => s + i.amountCents, 0)
          + allScItems.filter((i) => i.createdAt?.startsWith(month)).reduce((s, i) => s + (i.客户应收_cents || 0), 0)
          + allLdItems.filter((i) => i.createdAt?.startsWith(month)).reduce((s, i) => s + (i.需支付总价_cents || 0), 0);
        const revenueTHB = monthIncome.filter((i) => i.currency === 'THB').reduce((s, i) => s + i.amountCents, 0);
        const costCNY = allExpenses.filter((e) => e.currency === 'CNY' && (e.paidDate?.startsWith(month) || (!e.paidDate && e.createdAt?.startsWith(month)))).reduce((s, e) => s + e.amountCents, 0)
          + allScItems.filter((i) => i.createdAt?.startsWith(month)).reduce((s, i) => s + (i.需支付总价_cents || 0), 0)
          + allLdItems.filter((i) => i.createdAt?.startsWith(month)).reduce((s, i) => s + (i.需支付总价_cents || 0), 0);
        const costTHB = allExpenses.filter((e) => e.currency === 'THB' && (e.paidDate?.startsWith(month) || (!e.paidDate && e.createdAt?.startsWith(month)))).reduce((s, e) => s + e.amountCents, 0);

        const byCustomer = new Map<number, { CNY: number; THB: number }>();
        monthIncome.forEach((i) => {
          const e = byCustomer.get(i.customerId) || { CNY: 0, THB: 0 };
          if (i.currency === 'THB') e.THB += i.amountCents; else e.CNY += i.amountCents;
          byCustomer.set(i.customerId, e);
        });

        return (
          <Card key={month}>
            <CardHeader><CardTitle>{month}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-muted rounded-lg"><p className="text-sm text-muted-foreground">营收</p><p className="text-lg font-bold">CNY ¥{revenueCNY.toFixed(6)}{revenueTHB > 0 ? ` + THB ${revenueTHB.toFixed(6)}` : ''}</p></div>
                <div className="text-center p-3 bg-muted rounded-lg"><p className="text-sm text-muted-foreground">支出</p><p className="text-lg font-bold text-red-600">CNY ¥{costCNY.toFixed(6)}{costTHB > 0 ? ` + THB ${costTHB.toFixed(6)}` : ''}</p></div>
                <div className="text-center p-3 bg-muted rounded-lg"><p className="text-sm text-muted-foreground">利润</p><p className={`text-lg font-bold ${revenueCNY - costCNY >= 0 ? 'text-green-600' : 'text-red-600'}`}>CNY ¥{(revenueCNY - costCNY).toFixed(6)}</p></div>
              </div>
              {byCustomer.size > 0 && (
                <Table>
                  <TableHeader><TableRow><TableHead>客户</TableHead><TableHead className="text-right">CNY</TableHead><TableHead className="text-right">THB</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {Array.from(byCustomer.entries()).map(([cid, v]) => (
                      <TableRow key={cid}><TableCell>{customerMap.get(cid) || '-'}</TableCell><TableCell className="text-right">¥{v.CNY.toFixed(6)}</TableCell><TableCell className="text-right">THB {v.THB.toFixed(6)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}
      {months.length === 0 && <Card><CardContent className="py-8 text-center text-muted-foreground">暂无数据</CardContent></Card>}
    </div>
  );
}
