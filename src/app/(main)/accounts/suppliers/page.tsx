import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { suppliers, expenses, paymentsMade } from '@/db/schema';
import { formatCents } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function SupplierAccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allSuppliers = await db.select().from(suppliers).all();
  const allExpenses = await db.select().from(expenses).all();
  const allPayments = await db.select().from(paymentsMade).all();

  const data = allSuppliers.map((s) => {
    const payable = allExpenses.filter((e) => e.supplierId === s.id).reduce((sum, e) => sum + e.amountCents, 0);
    const paid = allPayments.filter((p) => p.supplierId === s.id).reduce((sum, p) => sum + p.amountCents, 0);
    return { id: s.id, name: s.name, type: s.type || '-', payable, paid, unpaid: payable - paid };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">供应商应付</h1>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>供应商</TableHead><TableHead>类型</TableHead><TableHead className="text-right">应付</TableHead><TableHead className="text-right">已付</TableHead><TableHead className="text-right">未付</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell><TableCell>{row.type}</TableCell>
                  <TableCell className="text-right">{formatCents(row.payable)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCents(row.paid)}</TableCell>
                  <TableCell className="text-right text-orange-600">{formatCents(row.unpaid)}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
