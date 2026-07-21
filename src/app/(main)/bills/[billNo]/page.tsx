import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/db/index';
import { bills, billItems, billLines, marks, sharedContainerItems, loadingItems, customers } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { PaymentForm } from './PaymentForm';
import { BillItemsTable } from './BillItemsTable';
import { formatAmount } from '@/lib/format';

export default async function BillDetailPage({ params }: { params: Promise<{ billNo: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { billNo } = await params;
  const bill = await db.select().from(bills).where(eq(bills.billNo, billNo)).get();
  if (!bill) notFound();

  const items = await db.select().from(billItems).where(eq(billItems.billId, bill.id)).all();
  const markIds = items.map(i => i.markId);
  const markList = await db.select().from(marks).where(inArray(marks.id, markIds)).orderBy(marks.markNo).all();
  const markMap = new Map(markList.map(m => [m.id, m]));

  const custIds = [...new Set(markList.map(m => m.customerId))];
  const custList = await db.select().from(customers).where(inArray(customers.id, custIds)).all();
  const custMap = new Map(custList.map(c => [c.id, c]));

  const customer = custMap.get(bill.customerId);

  // 账单是否已有独立快照(手动调整过)。有则用快照渲染,否则用原始明细
  const snapLines = await db.select().from(billLines).where(eq(billLines.billId, bill.id)).all();
  const hasSnapshot = snapLines.length > 0;

  let allItems: any[];
  if (hasSnapshot) {
    allItems = snapLines.map(l => ({
      ...l, id: l.id,
      _sourceType: l.sourceType, _sourceItemId: l.sourceItemId,
      _markNo: markMap.get(l.markId)?.markNo || '',
      _type: l.sourceType === 'sc' ? '拼柜' : '装柜',
    }));
  } else {
    const allSC = markIds.length > 0
      ? (await db.select().from(sharedContainerItems).where(inArray(sharedContainerItems.markId, markIds)).all())
          .map(i => ({ ...i, _sourceType: 'sc', _sourceItemId: i.id, _markNo: markMap.get(i.markId)?.markNo || '', _type: '拼柜' }))
      : [];
    const allLD = markIds.length > 0
      ? (await db.select().from(loadingItems).where(inArray(loadingItems.markId, markIds)).all())
          .map(i => ({ ...i, _sourceType: 'ld', _sourceItemId: i.id, _markNo: markMap.get(i.markId)?.markNo || '', _type: '装柜' }))
      : [];
    allItems = [...allSC, ...allLD];
  }

  // 按唛头分组,组内按运单号排序保证同运单相邻(rowSpan),并预计算每运单应收合计(存在运单某一条,汇总后显示在渲染首条)
  const groupMap = new Map<string, any[]>();
  for (const it of allItems) {
    const k = it._markNo || '';
    if (!groupMap.has(k)) groupMap.set(k, []);
    groupMap.get(k)!.push(it);
  }
  const itemGroups = Array.from(groupMap.entries()).map(([markNo, its]) => {
    its.sort((a, b) => String(a.运单号 || '').localeCompare(String(b.运单号 || '')));
    const recvByOrder = new Map<string, number>();
    for (const it of its) {
      const ok = it.运单号 || `#${it._sourceItemId}`;
      recvByOrder.set(ok, (recvByOrder.get(ok) || 0) + (Number(it.客户应收) || 0));
    }
    for (const it of its) it._orderRecv = recvByOrder.get(it.运单号 || `#${it._sourceItemId}`) || 0;
    const gMark = markMap.get(its[0]?.markId);
    const gCust = custMap.get(gMark?.customerId || 0);
    return { markNo, custName: gCust?.name || '', mode: gMark?.mode || '', items: its };
  });

  const canEdit = user.role === 'admin' || user.role === 'finance';

  const cur = (bill as any).currency || 'CNY';
  const isThb = cur === 'THB';
  const paid = (bill as any).paidAmount || 0;
  const totalAmount = bill.totalAmount || 0;
  const remaining = totalAmount - paid;
  const pStatus = (bill as any).paymentStatus || '待付款';
  const exportedAt = (bill as any).exportedAt;
  const paidAt = (bill as any).paidAt;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/bills"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="flex-1"><h1 className="text-2xl font-bold">{bill.billNo} <Badge className={isThb ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}>{isThb ? 'THB' : 'CNY'}</Badge></h1>
          {customer && <p className="text-sm text-muted-foreground">客户：{customer.name} · 月份：{bill.monthTag}</p>}
        </div>
        {(bill as any).manualAdjusted ? <Badge className="bg-purple-100 text-purple-700">已手动调整</Badge> : null}
        <Badge className={bill.status === '已生成' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>{bill.status}</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs">总金额</CardTitle></CardHeader><CardContent className="py-2 px-3"><span className="text-lg font-bold">{isThb ? formatAmount(totalAmount, 'THB') : formatAmount(totalAmount)}</span></CardContent></Card>
        <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs">已付</CardTitle></CardHeader><CardContent className="py-2 px-3"><span className="text-lg font-bold text-green-600">{isThb ? formatAmount(paid, 'THB') : formatAmount(paid)}</span></CardContent></Card>
        <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs">剩余</CardTitle></CardHeader><CardContent className="py-2 px-3"><span className="text-lg font-bold text-orange-600">{isThb ? formatAmount(remaining, 'THB') : formatAmount(remaining)}</span></CardContent></Card>
        <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs">导出时间</CardTitle></CardHeader><CardContent className="py-2 px-3"><span className="text-sm">{exportedAt ? new Date(exportedAt).toLocaleDateString('zh-CN') : '-'}</span></CardContent></Card>
        <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs">付款时间</CardTitle></CardHeader><CardContent className="py-2 px-3"><span className="text-sm">{paidAt ? new Date(paidAt).toLocaleDateString('zh-CN') : '-'}</span></CardContent></Card>
      </div>

      <PaymentForm
        billId={bill.id}
        totalAmount={totalAmount}
        currentPaid={paid}
        currentStatus={pStatus}
        currency={bill.currency || 'CNY'}
      />

      <div className="flex items-center gap-2">
        <a href={`/api/bills/export?billId=${bill.id}`}><Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1" />导出Excel</Button></a>
        {canEdit && <span className="text-xs text-muted-foreground">明细里点铅笔可改长宽高或直接改应收（只影响应收，不动成本）</span>}
      </div>

      {itemGroups.length > 0 ? (
        <BillItemsTable billNo={bill.billNo} currency={cur} groups={itemGroups} editable={canEdit} />
      ) : (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无明细数据</CardContent></Card>
      )}
    </div>
  );
}
