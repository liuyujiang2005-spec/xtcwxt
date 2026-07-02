import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { expenses, suppliers } from '@/db/schema';
import { formatCents } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function ExpensesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allExpenses = await db.select().from(expenses).all();
  const allSuppliers = await db.select().from(suppliers).all();
  const supplierMap = new Map(allSuppliers.map((s) => [s.id, s.name]));

  const byType = new Map<string, { count: number; CNY: number; THB: number }>();
  allExpenses.forEach((e) => {
    const entry = byType.get(e.expenseType) || { count: 0, CNY: 0, THB: 0 };
    entry.count++;
    if (e.currency === 'THB') entry.THB += e.amountCents;
    else entry.CNY += e.amountCents;
    byType.set(e.expenseType, entry);
  });

  const bySupplier = new Map<number, { name: string; count: number; CNY: number; THB: number }>();
  allExpenses.forEach((e) => {
    if (!e.supplierId) return;
    const entry = bySupplier.get(e.supplierId) || { name: supplierMap.get(e.supplierId) || '未知', count: 0, CNY: 0, THB: 0 };
    entry.count++;
    if (e.currency === 'THB') entry.THB += e.amountCents;
    else entry.CNY += e.amountCents;
    bySupplier.set(e.supplierId, entry);
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">支出总表</h1>
      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">按费用类型</h2></div>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>费用类型</TableHead><TableHead className="text-right">笔数</TableHead><TableHead className="text-right">CNY</TableHead><TableHead className="text-right">THB</TableHead></TableRow></TableHeader>
            <TableBody>
              {Array.from(byType.entries()).map(([type, v]) => (
                <TableRow key={type}><TableCell className="font-medium">{type}</TableCell><TableCell className="text-right">{v.count}</TableCell><TableCell className="text-right">{formatCents(v.CNY)}</TableCell><TableCell className="text-right">{formatCents(v.THB, 'THB')}</TableCell></TableRow>
              ))}
              {byType.size === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">按供应商</h2></div>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>供应商</TableHead><TableHead className="text-right">笔数</TableHead><TableHead className="text-right">CNY</TableHead><TableHead className="text-right">THB</TableHead></TableRow></TableHeader>
            <TableBody>
              {Array.from(bySupplier.entries()).map(([id, v]) => (
                <TableRow key={id}><TableCell className="font-medium">{v.name}</TableCell><TableCell className="text-right">{v.count}</TableCell><TableCell className="text-right">{formatCents(v.CNY)}</TableCell><TableCell className="text-right">{formatCents(v.THB, 'THB')}</TableCell></TableRow>
              ))}
              {bySupplier.size === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
