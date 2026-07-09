import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db/index';
import { loadingBatches, loadingItems, expenses, customers, marks } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft } from 'lucide-react';
import { LoadingExpenseManager } from './LoadingExpenseManager';
import { DeleteItemButton } from '../../shared-containers/[id]/DeleteButton';
import { ReviewActions } from '../../shared-containers/[id]/ReviewActions';
import { ClassifyButton } from '../../shared-containers/[id]/ClassifyButton';

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

  const markIds = [...new Set(items.map(i => i.markId))];
  const markList = markIds.length > 0 ? await db.select().from(marks).where(inArray(marks.id, markIds)).all() : [];
  const markMap = new Map(markList.map(m => [m.id, m.markNo]));

  const totalVolume = items.reduce((s, i) => s + (i.总体积 ?? 0), 0);
  const totalReceivable = items.reduce((s, i) => s + (i.需支付总价_cents || 0), 0);
  const totalCost = costList.reduce((s, c) => s + c.amountCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/loading-lists"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{batch.batchNo}</h1>
          <p className="text-muted-foreground">文件: {batch.originalFilename || '-'}</p>
        </div>
        {batch.status && <span className={`text-xs px-2 py-1 rounded ${batch.status === '待审核' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{batch.status}</span>}
        {batch.status === '待审核' && <ReviewActions batchId={batch.id} apiPath="/api/loading-batches" listPath="/loading-lists" />}
      </div>
      <ClassifyButton batchId={batch.id} type="loading-list" items={items} markMap={Object.fromEntries(markMap)} />

      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总立方</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold">{totalVolume.toFixed(6)} m³</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总应收</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold text-green-600">¥{totalReceivable.toFixed(6)}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总费用</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold text-red-600">¥{totalCost.toFixed(6)}</span></CardContent></Card>
      </div>

      <LoadingExpenseManager batchId={batch.id} initialExpenses={costList as any} />

      <Card>
        <CardHeader><CardTitle>装柜清单明细（{items.length} 条）</CardTitle></CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <p>暂无明细数据</p>
              <p className="text-xs mt-2">批次: {batch.batchNo} | 文件: {batch.originalFilename || '-'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>客户</TableHead><TableHead>品名</TableHead><TableHead className="text-right">总体积</TableHead>
                <TableHead className="text-right">单箱体积</TableHead><TableHead className="text-right">箱数</TableHead><TableHead className="text-right">单箱数量</TableHead>
                <TableHead>国内单号</TableHead><TableHead className="text-right">总重量</TableHead>
                <TableHead>货型</TableHead><TableHead>运输</TableHead><TableHead className="text-right">单价</TableHead>
                <TableHead className="text-right">应收</TableHead><TableHead>状态</TableHead><TableHead className="w-10"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(() => { const groups: { custId: number; rows: typeof items }[] = []; let last = -1; for (const i of items) { if (i.customerId !== last) { groups.push({ custId: i.customerId, rows: [] }); last = i.customerId; } groups[groups.length - 1].rows.push(i); } return groups.map(g => g.rows.map((item, ri) => (<TableRow key={item.id}>
                  {ri === 0 ? <TableCell className="font-medium" rowSpan={g.rows.length}>{customerMap.get(item.customerId) || '-'}</TableCell> : null}
                  <TableCell className="max-w-[120px] truncate" title={item.品名 || ''}>{item.品名 || '-'}</TableCell>
                  <TableCell className="text-right">{item.总体积.toFixed(6)}</TableCell>
                  <TableCell className="text-right">{item.单箱体积 || '-'}</TableCell>
                  <TableCell className="text-right">{item.箱数 || '-'}</TableCell>
                  <TableCell className="text-right">{item.单箱数量 || '-'}</TableCell>
                  <TableCell className="text-xs">{item.国内单号 || '-'}</TableCell>
                  <TableCell className="text-right">{item.总重量 || '-'}</TableCell>
                  <TableCell>{item.货型 || '-'}</TableCell><TableCell>{item.运输方式 || '-'}</TableCell>
                  <TableCell className="text-right">{(item.单价_cents || 0).toFixed(6)}</TableCell>
                  <TableCell className="text-right text-green-600">¥{(item.需支付总价_cents || 0).toFixed(6)}</TableCell>
                  <TableCell><span className={`text-xs px-2 py-1 rounded ${item.payment_status === '已支付' ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-700'}`}>{item.payment_status}</span></TableCell>
                  <TableCell><DeleteItemButton itemId={item.id} apiPath="/api/loading-items" /></TableCell>
                </TableRow>))); })()}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}