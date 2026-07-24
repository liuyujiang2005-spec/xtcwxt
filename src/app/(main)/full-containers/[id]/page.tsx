import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/db/index';
import { fullContainerBatches, fullContainerItems, expenses, customers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { formatAmount } from '@/lib/format';
import { BatchControls } from './BatchControls';
import { LoadingExpenseManager } from '../../loading-lists/[id]/LoadingExpenseManager';
import { riskStatus } from '../page';

export default async function FullContainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const batch = await db.select().from(fullContainerBatches).where(eq(fullContainerBatches.id, parseInt(id))).get();
  if (!batch) notFound();

  const items = await db.select().from(fullContainerItems).where(eq(fullContainerItems.batchId, batch.id)).all();
  const customer = batch.customerId ? await db.select().from(customers).where(eq(customers.id, batch.customerId)).get() : null;
  const exps = await db.select().from(expenses).where(eq(expenses.fullContainerBatchId, batch.id)).all();

  const cur = batch.currency || 'CNY';
  const 货款 = items.reduce((s, i) => s + (Number(i.需支付总价) || 0), 0);
  const 费用 = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const 总成本 = 货款 + 费用;
  const 应收 = Number(batch.整柜应收) || 0;
  const s = riskStatus(batch);

  // 按运单号合并展示
  const grouped = new Map<string, typeof items>();
  for (const it of items) { const k = it.运单号 || `#${it.id}`; if (!grouped.has(k)) grouped.set(k, []); grouped.get(k)!.push(it); }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/full-containers"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{batch.batchNo} <Badge className={s.cls}>{s.label}</Badge></h1>
          <p className="text-sm text-muted-foreground">客户：{customer?.name || '-'} · 月份：{batch.monthTag || '-'} · 柜型：{batch.柜型 || '-'} · {items.length} 条明细</p>
        </div>
        <a href={`/api/full-containers/export?id=${batch.id}`}><Button variant="outline" size="sm">生成请款单</Button></a>
      </div>

      {/* 成本小结 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">本柜小结</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-xs text-muted-foreground">货物成本(货款)</p><p className="text-xl font-bold text-red-600">{formatAmount(货款, cur)}</p></div>
            <div><p className="text-xs text-muted-foreground">各项费用</p><p className="text-xl font-bold text-red-600">{formatAmount(费用, cur)}</p></div>
            <div><p className="text-xs text-muted-foreground">总成本(货款+费用)</p><p className="text-xl font-bold text-red-600">{formatAmount(总成本, cur)}</p></div>
            <div><p className="text-xs text-muted-foreground">整柜应收</p><p className="text-xl font-bold text-green-600">{formatAmount(应收, cur)}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* 手填应收/货值 + 4日期 + 分次付 */}
      <BatchControls batch={batch} />

      {/* 费用管理 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">费用管理</CardTitle></CardHeader>
        <CardContent>
          <LoadingExpenseManager batchId={batch.id} batchType="full-container" initialExpenses={exps.map(e => ({ id: e.id, expenseType: e.expenseType, amount: Number(e.amount), currency: e.currency || 'CNY', status: e.status || '待支付' }))} />
        </CardContent>
      </Card>

      {/* 货物明细 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">货物明细（{items.length} 条）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table className="border">
            <TableHeader><TableRow>
              <TableHead>品名</TableHead><TableHead>仓库</TableHead><TableHead>运单号</TableHead><TableHead>货型</TableHead><TableHead>运输</TableHead>
              <TableHead className="text-right">总体积</TableHead><TableHead className="text-right">单项体积</TableHead><TableHead className="text-right">件数</TableHead>
              <TableHead className="text-right">成本</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {Array.from(grouped.values()).flatMap(group => group.map((item, ri) => (
                <TableRow key={item.id}>
                  <TableCell className="border max-w-[120px] truncate" title={item.品名 || ''}>{item.品名 || '-'}</TableCell>
                  {ri === 0 ? <TableCell className="border" rowSpan={group.length}>{item.仓库 || '-'}</TableCell> : null}
                  {ri === 0 ? <TableCell className="border text-xs font-mono" rowSpan={group.length}>{item.运单号 || '-'}</TableCell> : null}
                  <TableCell className="border">{item.货型 || '-'}</TableCell>
                  <TableCell className="border">{item.运输方式 || '-'}</TableCell>
                  {ri === 0 ? <TableCell className="border text-right font-medium" rowSpan={group.length}>{(item.总体积 ?? 0).toFixed(6)}</TableCell> : null}
                  <TableCell className="border text-right">{item.单项体积 ?? '-'}</TableCell>
                  <TableCell className="border text-right">{item.箱数 || '-'}</TableCell>
                  <TableCell className="border text-right text-red-600">{formatAmount(Number(item.需支付总价) || 0, cur)}</TableCell>
                </TableRow>
              )))}
              {items.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">暂无明细</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
