import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { directIncome, customers } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { formatCents } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export default async function DirectIncomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allIncome = await db.select().from(directIncome).orderBy(desc(directIncome.createdAt)).all();
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const isViewer = user.role === 'viewer';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">直接收入</h1>
        {!isViewer && (
          <Link href="/direct-income/new">
            <Button><Plus className="h-4 w-4 mr-2" />新建收入</Button>
          </Link>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead>币种</TableHead>
                <TableHead className="text-right">体积</TableHead>
                <TableHead>日期</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allIncome.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{customerMap.get(i.customerId) || '-'}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCents(i.amountCents, i.currency || undefined)}</TableCell>
                  <TableCell>{i.currency}</TableCell>
                  <TableCell className="text-right">{i.volume ? `${i.volume.toFixed(2)}m³` : '-'}</TableCell>
                  <TableCell className="text-sm">{i.incomeDate}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{i.remark || '-'}</TableCell>
                </TableRow>
              ))}
              {allIncome.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">暂无收入记录</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
