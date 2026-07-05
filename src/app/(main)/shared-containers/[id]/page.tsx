import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db/index';
import { sharedContainerBatches, sharedContainerItems, customers, marks } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { formatCents } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft } from 'lucide-react';
import { DeleteItemButton } from './DeleteButton';

export default async function SharedContainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const batch = await db.select().from(sharedContainerBatches).where(eq(sharedContainerBatches.id, parseInt(id))).get();
  if (!batch) notFound();

  const items = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.batchId, batch.id)).all();
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const markIds = [...new Set(items.map(i => i.markId))];
  const markList = markIds.length > 0 ? await db.select().from(marks).where(inArray(marks.id, markIds)).all() : [];
  const markMap = new Map(markList.map(m => [m.id, m.markNo]));

  const totalVolume = items.reduce((s, i) => s + i.总体积, 0);
  const totalCost = items.reduce((s, i) => s + (i.需支付总价_cents || 0), 0);
  const totalReceivable = items.reduce((s, i) => s + (i.客户应收_cents || 0), 0);

  const byMark = new Map<number, { markNo: string; volume: number; cost: number; count: number }>();
  items.forEach((item) => {
    const m = byMark.get(item.markId) || { markNo: markMap.get(item.markId) || `#${item.markId}`, volume: 0, cost: 0, count: 0 };
    m.volume += item.总体积; m.cost += (item.需支付总价_cents || 0); m.count++;
    byMark.set(item.markId, m);
  });
  const markStats = Array.from(byMark.values());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/shared-containers"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{batch.batchNo}</h1>
          <p className="text-muted-foreground">上传文件: {batch.originalFilename || '-'}</p>
        </div>
        <Badge className={batch.status === '已验证' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
          {batch.status}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总立方</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold">{totalVolume.toFixed(2)} m³</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总成本</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold text-red-600">{formatCents(totalCost)}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总应收</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold text-green-600">{formatCents(totalReceivable)}</span></CardContent></Card>
      </div>

      {markStats.length > 0 && (
        <Card>
          <CardHeader><CardTitle>按唛头统计</CardTitle></CardHeader>
          <CardContent className="p-0"><Table><TableHeader><TableRow>
            <TableHead>唛头</TableHead><TableHead className="text-right">件数</TableHead><TableHead className="text-right">总体积</TableHead><TableHead className="text-right">总成本</TableHead>
          </TableRow></TableHeader><TableBody>
            {markStats.map((m) => (<TableRow key={m.markNo}>
              <TableCell className="font-medium">{m.markNo}</TableCell><TableCell className="text-right">{m.count}</TableCell>
              <TableCell className="text-right font-bold">{m.volume.toFixed(2)} m³</TableCell><TableCell className="text-right">{formatCents(m.cost)}</TableCell>
            </TableRow>))}
          </TableBody></Table></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>明细（{items.length} 条）</CardTitle></CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <p>暂无明细数据</p>
              <p className="text-xs mt-2">批次: {batch.batchNo} | 状态: {batch.status}</p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>唛头</TableHead><TableHead>品名</TableHead><TableHead>货型</TableHead><TableHead>运输</TableHead>
                <TableHead className="text-right">总体积</TableHead><TableHead className="text-right">单箱体积</TableHead>
                <TableHead className="text-right">箱数</TableHead><TableHead className="text-right">单箱数量</TableHead>
                <TableHead>国内单号</TableHead><TableHead className="text-right">总重量</TableHead>
                <TableHead className="text-right">成本单价</TableHead><TableHead className="text-right">成本</TableHead><TableHead className="text-right">应收</TableHead>
                <TableHead>结算</TableHead><TableHead>状态</TableHead><TableHead className="w-10"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map((item) => (<TableRow key={item.id}>
                  <TableCell className="font-medium">{markMap.get(item.markId) || '-'}</TableCell>
                  <TableCell className="max-w-[120px] truncate" title={item.品名 || ''}>{item.品名 || '-'}</TableCell>
                  <TableCell>{item.货型 || '-'}</TableCell><TableCell>{item.运输方式 || '-'}</TableCell>
                  <TableCell className="text-right">{item.总体积.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{item.单箱体积 || '-'}</TableCell>
                  <TableCell className="text-right">{item.箱数 || '-'}</TableCell>
                  <TableCell className="text-right">{item.单箱数量 || '-'}</TableCell>
                  <TableCell className="text-xs">{item.国内单号 || '-'}</TableCell>
                  <TableCell className="text-right">{item.总重量 || '-'}</TableCell>
                  <TableCell className="text-right">{((item.成本单价_cents || 0) / 100).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{formatCents(item.需支付总价_cents || 0)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCents(item.客户应收_cents || 0)}</TableCell>
                  <TableCell>{item.cost_status || '-'}</TableCell>
                  <TableCell><Badge className={item.cost_status === '已支出' ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-700'}>{item.cost_status || '-'}</Badge></TableCell>
                  <TableCell><DeleteItemButton itemId={item.id} apiPath="/api/shared-container-items" /></TableCell>
                </TableRow>))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
