import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db/index';
import { sharedContainerBatches, sharedContainerItems, customers, marks, expenses } from '@/db/schema';
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
import { LoadingExpenseManager } from '../../loading-lists/[id]/LoadingExpenseManager';
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
  const markList = markIds.length > 0 ? await db.select().from(marks).where(inArray(marks.id, markIds)).orderBy(marks.markNo).all() : [];
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
  // 应收合计 = 各明细客户应收之和(客户应收按运单落首条、其余0)
  const totalReceivable = items.reduce((s, i) => s + (Number(i.客户应收) || 0), 0);
  const custCurrencyMap = new Map(allCustomers.map(c => [c.id, c.defaultCurrency || 'CNY']));
  const isThb = items.length > 0 && custCurrencyMap.get(items[0].customerId) === 'THB';

  // 费用管理
  const costList = await db.select().from(expenses).where(eq(expenses.sharedContainerBatchId, batch.id)).all();
  const goodsCost = items.reduce((s, i) => s + (Number(i.需支付总价) || 0), 0);
  const feeCost = costList.reduce((s, c) => s + c.amount, 0);
  const totalAllCost = goodsCost + feeCost;

  const byMark = new Map<number, { markNo: string; volume: number; cost: number; receivable: number; count: number; seenOrders: Set<string> }>();
  items.forEach((item) => {
    const m = byMark.get(item.markId) || { markNo: markMap.get(item.markId) || `#${item.markId}`, volume: 0, cost: 0, receivable: 0, count: 0, seenOrders: new Set<string>() };
    const orderKey = item.运单号 || `m${item.markId}`;
    if (!m.seenOrders.has(orderKey)) {
      m.volume += item.总体积;
      m.cost += orderCosts.get(orderKey) || 0;
      m.seenOrders.add(orderKey);
    }
    m.receivable += (Number(item.客户应收) || 0);
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
        <ClassifyButton batchId={batch.id} items={items} markMap={Object.fromEntries(markMap)} />
      </div>

      {/* 本柜成本小结 */}
      <Card className="border-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">本柜成本小结</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">货物成本（货款）</p>
              <p className="text-xl font-bold text-red-600">{formatAmount(goodsCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">各项费用</p>
              <p className="text-xl font-bold text-red-600">{formatAmount(feeCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">总成本（货款+费用）</p>
              <p className="text-xl font-bold text-red-600">{formatAmount(totalAllCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">应收合计</p>
              <p className="text-xl font-bold text-green-600">{formatAmount(totalReceivable, isThb ? 'THB' : 'CNY')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总立方</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold">{totalVolume.toFixed(6)} m³</span></CardContent></Card>
      </div>

      <LoadingExpenseManager batchId={batch.id} initialExpenses={costList as any} batchType="shared-container" />

      {markStats.length > 0 && (
        <Card>
          <CardHeader><CardTitle>按唛头统计</CardTitle></CardHeader>
          <CardContent className="p-0"><Table><TableHeader><TableRow>
            <TableHead>唛头</TableHead><TableHead className="text-right">件数</TableHead><TableHead className="text-right">总体积</TableHead><TableHead className="text-right">应收</TableHead><TableHead className="text-right">总成本</TableHead>
          </TableRow></TableHeader><TableBody>
            {markStats.map((m) => (<TableRow key={m.markNo}>
              <TableCell className="font-medium">{m.markNo}</TableCell><TableCell className="text-right">{m.count}</TableCell>
              <TableCell className="text-right font-bold">{(m.volume ?? 0).toFixed(6)} m³</TableCell><TableCell className="text-right text-green-600">{formatAmount((m.receivable ?? 0), isThb ? 'THB' : 'CNY')}</TableCell><TableCell className="text-right">{formatAmount((m.cost ?? 0))}</TableCell>
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
            <div className="border rounded-lg overflow-auto max-h-80">
            <Table className="[&_td]:border [&_th]:border [&_td]:border-gray-300 [&_th]:border-gray-300">
              <TableHeader><TableRow>
                <TableHead>唛头</TableHead><TableHead>品名</TableHead><TableHead>运单号</TableHead><TableHead>仓库</TableHead><TableHead className="text-right">总体积</TableHead>
                <TableHead className="text-right">单项体积</TableHead><TableHead className="text-right">箱数</TableHead><TableHead className="text-right">单箱数量</TableHead>
                <TableHead className="max-w-[100px]">国内单号</TableHead><TableHead className="text-right w-20">总重量</TableHead>
                <TableHead>货型</TableHead><TableHead>运输</TableHead>
                <TableHead className="text-right">成本单价</TableHead><TableHead className="text-right">成本</TableHead>
                <TableHead className="text-right">单项应收</TableHead><TableHead className="text-right">应收</TableHead>
                <TableHead>结算</TableHead><TableHead>状态</TableHead><TableHead className="w-10"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(() => {
                  // 两级合并：先按唛头，唛头内再按连续运单号
                  type Row = { item: (typeof items)[number]; isMarkFirst: boolean; markRowSpan: number; isOrderFirst: boolean; orderRowSpan: number };
                  const flat: Row[] = [];
                  let ci = 0;
                  while (ci < items.length) {
                    const mk = items[ci].markId;
                    let cj = ci; while (cj < items.length && items[cj].markId === mk) cj++;
                    const markRows = items.slice(ci, cj);
                    let markFirst = true;
                    let oi = 0;
                    while (oi < markRows.length) {
                      const ok = ((markRows[oi] as any).运单号 || '').trim();
                      let oj = oi + 1;
                      if (ok) { while (oj < markRows.length && ((markRows[oj] as any).运单号 || '').trim() === ok) oj++; }
                      const orderRows = markRows.slice(oi, oj);
                      orderRows.forEach((item, ri) => {
                        flat.push({ item, isMarkFirst: markFirst, markRowSpan: markRows.length, isOrderFirst: ri === 0, orderRowSpan: orderRows.length });
                        markFirst = false;
                      });
                      oi = oj;
                    }
                    ci = cj;
                  }
                  const cur = (cid: number) => custCurrencyMap.get(cid) === 'THB' ? 'THB' : 'CNY';
                  return flat.map(({ item, isMarkFirst, markRowSpan, isOrderFirst, orderRowSpan }) => (
                    <TableRow key={item.id}>
                      {isMarkFirst ? <TableCell className="font-medium align-top" rowSpan={markRowSpan}>{markMap.get(item.markId) || '-'}</TableCell> : null}
                      <TableCell className="max-w-[120px] truncate" title={item.品名 || ''}>{item.品名 || '-'}</TableCell>
                      {isOrderFirst ? <TableCell className="text-xs font-mono align-top" rowSpan={orderRowSpan}>{item.运单号 || '-'}</TableCell> : null}
                      {isOrderFirst ? <TableCell className="align-top" rowSpan={orderRowSpan}>{item.仓库 || '-'}</TableCell> : null}
                      {isOrderFirst ? <TableCell className="text-right align-top" rowSpan={orderRowSpan}>{(item.总体积 ?? 0).toFixed(6)}</TableCell> : null}
                      <TableCell className="text-right">{item.单项体积 || '-'}</TableCell>
                      <TableCell className="text-right">{item.箱数 || '-'}</TableCell>
                      <TableCell className="text-right">{item.单箱数量 || '-'}</TableCell>
                      <TableCell className="text-xs max-w-[100px] truncate">{item.国内单号 || '-'}</TableCell>
                      {isOrderFirst ? <TableCell className="text-right align-top" rowSpan={orderRowSpan}>{item.总重量 || '-'}</TableCell> : null}
                      {isOrderFirst ? <TableCell className="align-top" rowSpan={orderRowSpan}>{item.货型 || '-'}</TableCell> : null}
                      {isOrderFirst ? <TableCell className="align-top" rowSpan={orderRowSpan}>{item.运输方式 || '-'}</TableCell> : null}
                      <TableCell className="text-right">{formatAmount((item.成本单价 || 0))}</TableCell>
                      <TableCell className="text-right">{formatAmount((item.需支付总价 || 0))}</TableCell>
                      <TableCell className="text-right">{formatAmount((item as any).单项应收 || 0, cur(item.customerId))}</TableCell>
                      {isOrderFirst ? <TableCell className="text-right text-green-600 align-top" rowSpan={orderRowSpan}>{formatAmount((Number(item.客户应收) || 0), cur(item.customerId))}</TableCell> : null}
                      <TableCell>{item.cost_status || '-'}</TableCell>
                      <TableCell><Badge className={item.cost_status === '已支出' ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-700'}>{item.cost_status || '-'}</Badge></TableCell>
                      <TableCell><DeleteItemButton itemId={item.id} apiPath="/api/shared-container-items" /></TableCell>
                    </TableRow>
                  ));
                })()}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
