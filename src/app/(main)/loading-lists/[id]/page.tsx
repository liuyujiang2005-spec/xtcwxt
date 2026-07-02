import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/db/index';
import { loadingBatches, loadingItems, expenses, customers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { formatCents } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingExpenseManager } from './LoadingExpenseManager';

export default async function LoadingListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const batch = await db.select().from(loadingBatches).where(eq(loadingBatches.id, parseInt(id))).get();
  if (!batch) notFound();

  const items = await db.select().from(loadingItems).where(eq(loadingItems.batchId, batch.id)).all();
  const costList = await db.select().from(expenses).where(eq(expenses.loadingBatchId, batch.id)).all();
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const totalVolume = items.reduce((s, i) => s + i.总体积, 0);
  const totalReceivable = items.reduce((s, i) => s + (i.需支付总价_cents || 0), 0);
  const totalCost = costList.reduce((s, c) => s + c.amountCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{batch.batchNo}</h1>
          <p className="text-muted-foreground">文件: {batch.originalFilename || '-'}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总立方</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold">{totalVolume.toFixed(2)} m³</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总应收</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold text-green-600">{formatCents(totalReceivable)}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总费用</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold text-red-600">{formatCents(totalCost)}</span></CardContent></Card>
      </div>

      <LoadingExpenseManager batchId={batch.id} initialExpenses={costList as any} />

      <Card>
        <CardHeader><CardTitle>装柜清单明细（{items.length} 条）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户</TableHead><TableHead>品名</TableHead>
                <TableHead className="text-right">总体积</TableHead><TableHead>货型</TableHead><TableHead>运输</TableHead>
                <TableHead className="text-right">应收</TableHead><TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{customerMap.get(item.customerId) || '-'}</TableCell>
                  <TableCell className="max-w-[120px] truncate">{item.品名 || '-'}</TableCell>
                  <TableCell className="text-right">{item.总体积.toFixed(2)}</TableCell>
                  <TableCell>{item.货型 || '-'}</TableCell>
                  <TableCell>{item.运输方式 || '-'}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCents(item.需支付总价_cents || 0)}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded ${item.payment_status === '已支付' ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {item.payment_status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">暂无明细</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
