import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { bills, customers } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { formatCents } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import BillDownloadCard from './bill-download-card';

export default async function BillsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allBills = await db.select().from(bills).orderBy(desc(bills.createdAt)).all();
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">账单管理</h1>

      <BillDownloadCard />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>账单号</TableHead>
                <TableHead>客户</TableHead>
                <TableHead>月份</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead>币种</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allBills.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.billNo}</TableCell>
                  <TableCell>{customerMap.get(b.customerId) || '-'}</TableCell>
                  <TableCell>{b.monthTag}</TableCell>
                  <TableCell className="text-right font-bold">{formatCents(b.totalAmountCents, b.currency || undefined)}</TableCell>
                  <TableCell>{b.currency}</TableCell>
                  <TableCell>
                    <Badge className={b.status === '已生成' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                      {b.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{b.createdAt?.substring(0, 10) || '-'}</TableCell>
                </TableRow>
              ))}
              {allBills.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">暂无账单</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
