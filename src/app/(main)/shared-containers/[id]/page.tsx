import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db/index';
import { sharedContainerBatches, sharedContainerItems, customers, marks } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft } from 'lucide-react';
import { DeleteItemButton } from './DeleteButton';
import { ReviewActions } from './ReviewActions';
import { ClassifyButton } from './ClassifyButton';
import { RecalculateButton } from '@/components/RecalculateButton';
import { formatAmount } from '@/lib/format';

const STATUS_COLORS: Record<string, string> = {
  '待验证': 'bg-gray-100 text-gray-700',
  '待审核': 'bg-yellow-100 text-yellow-700',
  '已发布': 'bg-green-100 text-green-700',
};

export default async function SharedContainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const batch = await db.select().from(sharedContainerBatches).where(eq(sharedContainerBatches.id, parseInt(id))).get();
  if (!batch) notFound();

  const items = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.batchId, batch.id)).orderBy(sharedContainerItems.markId).all();
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const markIds = [...new Set(items.map(i => i.markId))];
  const markList = markIds.length > 0 ? await db.select().from(marks).where(inArray(marks.id, markIds)).all() : [];
  const markMap = new Map(markList.map(m => [m.id, m.markNo]));

  // 总立方 = 每个运单号对应的总体积累加（按运单号分组取唯一值，和声明的总立方一致）
  const orderVolumes = new Map<string, number>();
  items.forEach(i => {
    const key = i.运单号 || `mark_${i.markId}`;
    if (i.总体积 != null && !orderVolumes.has(key)) orderVolumes.set(key, i.总体积);
  });
  const totalVolume = Array.from(orderVolumes.values()).reduce((s, v) => s + v, 0);
  // 总成本 = 每个运单号的订单总价累加（按运单号分组取唯一值）
  const orderCosts = new Map<string, number>();
  items.forEach(i => { 
    const key = i.运单号 || `mark_${i.markId}`;
    if (i.订单总价 != null && !orderCosts.has(key)) orderCosts.set(key, i.订单总价); 
  });
  const totalCost = Array.from(orderCosts.values()).reduce((s, v) => s + v, 0);

  const byMark = new Map<number, { markNo: string; volume: number; cost: number; count: number; seenOrders: Set<string> }>();
  items.forEach((item) => {
    const m = byMark.get(item.markId) || { markNo: markMap.get(item.markId) || `#${item.markId}`, volume: 0, cost: 0, count: 0, seenOrders: new Set<string>() };
    const orderKey = item.运单号 || `m${item.markId}`;
    if (!m.seenOrders.has(orderKey)) {
      m.volume += item.总体积;
      m.cost += orderCosts.get(orderKey) || 0;
      m.seenOrders.add(orderKey);
    }
    m.count++;
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
        <Badge className={STATUS_COLORS[batch.status!] || 'bg-gray-100 text-gray-700'}>
          {batch.status}
        </Badge>
        {batch.status === '待审核' && <ReviewActions batchId={batch.id} apiPath="/api/shared-containers" listPath="/shared-containers" />}
        <RecalculateButton batchId={batch.id} apiPath="/api/shared-containers" />
      </div>
      <ClassifyButton batchId={batch.id} items={items} markMap={Object.fromEntries(markMap)} />

      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总立方</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold">{totalVolume.toFixed(6)} m³</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总成本</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold text-red-600">{formatAmount((totalCost ?? 0))}</span></CardContent></Card>
      </div>

      {markStats.length > 0 && (
        <Card>
          <CardHeader><CardTitle>按唛头统计</CardTitle></CardHeader>
          <CardContent className="p-0"><Table><TableHeader><TableRow>
            <TableHead>唛头</TableHead><TableHead className="text-right">件数</TableHead><TableHead className="text-right">总体积</TableHead><TableHead className="text-right">总成本</TableHead>
          </TableRow></TableHeader><TableBody>
            {markStats.map((m) => (<TableRow key={m.markNo}>
              <TableCell className="font-medium">{m.markNo}</TableCell><TableCell className="text-right">{m.count}</TableCell>
              <TableCell className="text-right font-bold">{(m.volume ?? 0).toFixed(6)} m³</TableCell><TableCell className="text-right">{formatAmount((m.cost ?? 0))}</TableCell>
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
                <TableHead>唛头</TableHead><TableHead>品名</TableHead><TableHead>仓库</TableHead><TableHead>货型</TableHead><TableHead>运输</TableHead>
                <TableHead className="text-right">总体积</TableHead><TableHead className="text-right">单箱体积</TableHead>
                <TableHead className="text-right">箱数</TableHead><TableHead className="text-right">单箱数量</TableHead>
                <TableHead>国内单号</TableHead><TableHead className="text-right">总重量</TableHead>
                <TableHead className="text-right">成本单价</TableHead>                <TableHead className="text-right">成本</TableHead>
                <TableHead>结算</TableHead><TableHead>状态</TableHead><TableHead className="w-10"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(() => { const groups: { markId: number; rows: typeof items }[] = []; let last = -1; for (const i of items) { if (i.markId !== last) { groups.push({ markId: i.markId, rows: [] }); last = i.markId; } groups[groups.length - 1].rows.push(i); } return groups.map(g => g.rows.map((item, ri) => (<TableRow key={item.id}>
                  {ri === 0 ? <TableCell className="font-medium" rowSpan={g.rows.length}>{markMap.get(item.markId) || '-'}</TableCell> : null}
                  <TableCell className="max-w-[120px] truncate" title={item.品名 || ''}>{item.品名 || '-'}</TableCell>
                  <TableCell>{item.仓库 || '-'}</TableCell>
                  <TableCell>{item.货型 || '-'}</TableCell><TableCell>{item.运输方式 || '-'}</TableCell>
                  <TableCell className="text-right">{(item.总体积 ?? 0).toFixed(6)}</TableCell>
                  <TableCell className="text-right">{item.单箱体积 || '-'}</TableCell>
                  <TableCell className="text-right">{item.箱数 || '-'}</TableCell>
                  <TableCell className="text-right">{item.单箱数量 || '-'}</TableCell>
                  <TableCell className="text-xs">{item.国内单号 || '-'}</TableCell>
                  <TableCell className="text-right">{item.总重量 || '-'}</TableCell>
                  <TableCell className="text-right">{formatAmount((item.成本单价 || 0))}</TableCell>
                  <TableCell className="text-right">{formatAmount((item.需支付总价 || 0))}</TableCell>
                  <TableCell>{item.cost_status || '-'}</TableCell>
                  <TableCell><Badge className={item.cost_status === '已支出' ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-700'}>{item.cost_status || '-'}</Badge></TableCell>
                  <TableCell><DeleteItemButton itemId={item.id} apiPath="/api/shared-container-items" /></TableCell>
                </TableRow>))); })()}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
