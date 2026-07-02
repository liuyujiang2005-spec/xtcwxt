import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { directIncome, customers } from '@/db/schema';
import { formatCents } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function RevenuePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allIncome = await db.select().from(directIncome).all();
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const byCustomer = new Map<number, { CNY: number; THB: number; count: number }>();
  allIncome.forEach((i) => {
    const entry = byCustomer.get(i.customerId) || { CNY: 0, THB: 0, count: 0 };
    entry.count++;
    if (i.currency === 'THB') entry.THB += i.amountCents;
    else entry.CNY += i.amountCents;
    byCustomer.set(i.customerId, entry);
  });

  const data = Array.from(byCustomer.entries())
    .map(([cid, v]) => ({ customerId: cid, customerName: customerMap.get(cid) || '未知', ...v }))
    .sort((a, b) => (b.CNY + b.THB) - (a.CNY + a.THB));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">收入总表</h1>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户</TableHead>
                <TableHead className="text-right">笔数</TableHead>
                <TableHead className="text-right">CNY</TableHead>
                <TableHead className="text-right">THB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.customerId}>
                  <TableCell className="font-medium">{row.customerName}</TableCell>
                  <TableCell className="text-right">{row.count}</TableCell>
                  <TableCell className="text-right">{formatCents(row.CNY)}</TableCell>
                  <TableCell className="text-right">{formatCents(row.THB, 'THB')}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
