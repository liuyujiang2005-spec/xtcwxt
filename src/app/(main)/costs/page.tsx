import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { expenses, suppliers } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { formatCents } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus } from 'lucide-react';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
  '待支付': 'bg-yellow-100 text-yellow-700',
  '已支付': 'bg-gray-100 text-gray-700',
};

export default async function CostsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allExpenses = await db.select().from(expenses).orderBy(desc(expenses.createdAt)).all();
  const allSuppliers = await db.select().from(suppliers).all();
  const supplierMap = new Map(allSuppliers.map((s) => [s.id, s.name]));

  const totalPending = allExpenses.filter((e) => e.status === '待支付').reduce((s, e) => s + e.amountCents, 0);
  const totalPaid = allExpenses.filter((e) => e.status === '已支付').reduce((s, e) => s + e.amountCents, 0);

  const isViewer = user.role === 'viewer';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">费用管理</h1>
        {!isViewer && (
          <Link href="/costs/new">
            <Button><Plus className="h-4 w-4 mr-2" />新建费用</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-orange-600">待支付</CardTitle></CardHeader>
          <CardContent><span className="text-2xl font-bold text-orange-600">{formatCents(totalPending)}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-green-600">已支付</CardTitle></CardHeader>
          <CardContent><span className="text-2xl font-bold text-green-600">{formatCents(totalPaid)}</span></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>费用类型</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead>币种</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>支付日期</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allExpenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.expenseType}</TableCell>
                  <TableCell className="text-right">{formatCents(e.amountCents, e.currency || undefined)}</TableCell>
                  <TableCell>{e.currency}</TableCell>
                  <TableCell className="text-sm">{e.supplierId ? supplierMap.get(e.supplierId) || '-' : '-'}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[e.status!] || ''}>{e.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{e.paidDate || '-'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">{e.remark || '-'}</TableCell>
                </TableRow>
              ))}
              {allExpenses.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">暂无费用</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
