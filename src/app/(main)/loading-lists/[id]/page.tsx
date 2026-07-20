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
import { RecalculateButton } from '@/components/RecalculateButton';
import { formatAmount } from '@/lib/format';

export default async function LoadingListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const batch = await db.select().from(loadingBatches).where(eq(loadingBatches.id, parseInt(id))).get();
  if (!batch) notFound();

  const items = await db.select().from(loadingItems).where(eq(loadingItems.batchId, batch.id)).orderBy(loadingItems.customerId).all();
  const costList = await db.select().from(expenses).where(eq(expenses.loadingBatchId, batch.id)).all();
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const markIds = [...new Set(items.map(i => i.markId))];
  const markList = markIds.length > 0 ? await db.select().from(marks).where(inArray(marks.id, markIds)).all() : [];
  const markMap = new Map(markList.map(m => [m.id, m.markNo]));

  // 总体积是"按运单合计、每条明细重复"的值，全加会重复累加虚高；按运单号去重、每个运单只算一次
  const volGroups = new Map<string, number>();
  items.forEach((i, idx) => {
    const ok = ((i as any).运单号 || '').trim() || `_${i.id ?? idx}`;
    const gk = `${i.customerId}__${ok}`;
    volGroups.set(gk, Math.max(volGroups.get(gk) ?? 0, i.总体积 ?? 0));
  });
  const totalVolume = [...volGroups.values()].reduce((s, v) => s + v, 0);
  const totalReceivable = items.reduce((s, i) => s + (Number(i.客户应收) || 0), 0);
  const goodsCost = items.reduce((s, i) => s + (Number(i.需支付总价) || 0), 0); // 货物成本=各明细需支付总价之和(付供应商的货款)
  const feeCost = costList.reduce((s, c) => s + c.amount, 0); // 各项费用=费用管理里手录的报关/拖车等
  const totalCost = goodsCost + feeCost; // 总成本=货款+费用
  const custCurrencyMap = new Map(allCustomers.map(c => [c.id, c.defaultCurrency || 'CNY']));
  const isThb = items.length > 0 && custCurrencyMap.get(items[0].customerId) === 'THB';

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
        <RecalculateButton batchId={batch.id} apiPath="/api/loading-batches" />
      </div>
      <ClassifyButton batchId={batch.id} type="loading-list" items={items} markMap={Object.fromEntries(markMap)} />

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
              <p className="text-xl font-bold text-red-600">{formatAmount(totalCost)}</p>
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
            <div className="border rounded-lg overflow-auto max-h-80">
            <Table className="[&_td]:border [&_th]:border [&_td]:border-gray-300 [&_th]:border-gray-300">
              <TableHeader><TableRow>
                <TableHead>客户</TableHead><TableHead>品名</TableHead><TableHead>运单号</TableHead><TableHead>仓库</TableHead><TableHead className="text-right">总体积</TableHead>
                <TableHead className="text-right">单项体积</TableHead><TableHead className="text-right">箱数</TableHead><TableHead className="text-right">单箱数量</TableHead>
                <TableHead>国内单号</TableHead><TableHead className="text-right">总重量</TableHead>
                <TableHead>货型</TableHead><TableHead>运输</TableHead>                <TableHead className="text-right">单价</TableHead><TableHead className="text-right">单项应收</TableHead>
                <TableHead className="text-right">应收</TableHead><TableHead>状态</TableHead><TableHead className="w-10"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(() => {
                  // 两级合并：先按客户，客户内再按连续运单号；运单级合并 运单号/仓库/总体积/货型/运输/单价/应收
                  type Row = { item: (typeof items)[number]; isCustFirst: boolean; custRowSpan: number; isOrderFirst: boolean; orderRowSpan: number };
                  const flat: Row[] = [];
                  let ci = 0;
                  while (ci < items.length) {
                    const custId = items[ci].customerId;
                    let cj = ci; while (cj < items.length && items[cj].customerId === custId) cj++;
                    const custRows = items.slice(ci, cj);
                    let custFirst = true;
                    let oi = 0;
                    while (oi < custRows.length) {
                      const ok = ((custRows[oi] as any).运单号 || '').trim();
                      let oj = oi + 1;
                      if (ok) { while (oj < custRows.length && ((custRows[oj] as any).运单号 || '').trim() === ok) oj++; }
                      const orderRows = custRows.slice(oi, oj);
                      orderRows.forEach((item, ri) => {
                        flat.push({ item, isCustFirst: custFirst, custRowSpan: custRows.length, isOrderFirst: ri === 0, orderRowSpan: orderRows.length });
                        custFirst = false;
                      });
                      oi = oj;
                    }
                    ci = cj;
                  }
                  return flat.map(({ item, isCustFirst, custRowSpan, isOrderFirst, orderRowSpan }) => (
                    <TableRow key={item.id}>
                      {isCustFirst ? <TableCell className="font-medium align-top" rowSpan={custRowSpan}>{customerMap.get(item.customerId) || '-'}</TableCell> : null}
                      <TableCell className="max-w-[120px] truncate" title={item.品名 || ''}>{item.品名 || '-'}</TableCell>
                      {isOrderFirst ? <TableCell className="text-xs font-mono align-top" rowSpan={orderRowSpan}>{item.运单号 || '-'}</TableCell> : null}
                      {isOrderFirst ? <TableCell className="align-top" rowSpan={orderRowSpan}>{(item as any).仓库 || '-'}</TableCell> : null}
                      {isOrderFirst ? <TableCell className="text-right align-top" rowSpan={orderRowSpan}>{(item.总体积 ?? 0).toFixed(6)}</TableCell> : null}
                      <TableCell className="text-right">{item.单项体积 || '-'}</TableCell>
                      <TableCell className="text-right">{item.箱数 || '-'}</TableCell>
                      <TableCell className="text-right">{item.单箱数量 || '-'}</TableCell>
                      <TableCell className="text-xs">{item.国内单号 || '-'}</TableCell>
                      {isOrderFirst ? <TableCell className="text-right align-top" rowSpan={orderRowSpan}>{item.总重量 || '-'}</TableCell> : null}
                      <TableCell>{item.货型 || '-'}</TableCell>
                      {isOrderFirst ? <TableCell className="align-top" rowSpan={orderRowSpan}>{item.运输方式 || '-'}</TableCell> : null}
                      <TableCell className="text-right">{(Number(item.单价) || 0).toFixed(3)}</TableCell>
                      <TableCell className="text-right">{formatAmount((item as any).单项应收 || 0, custCurrencyMap.get(item.customerId) === 'THB' ? 'THB' : 'CNY')}</TableCell>
                      {isOrderFirst ? <TableCell className="text-right text-green-600 align-top" rowSpan={orderRowSpan}>{formatAmount((item.客户应收 || 0), custCurrencyMap.get(item.customerId) === 'THB' ? 'THB' : 'CNY')}</TableCell> : null}
                      <TableCell><span className={`text-xs px-2 py-1 rounded ${item.payment_status === '已支付' ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-700'}`}>{item.payment_status}</span></TableCell>
                      <TableCell><DeleteItemButton itemId={item.id} apiPath="/api/loading-items" /></TableCell>
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