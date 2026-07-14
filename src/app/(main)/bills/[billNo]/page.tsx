import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/db/index';
import { bills, billItems, marks, sharedContainerItems, loadingItems, customers } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { PaymentForm } from './PaymentForm';
import { formatAmount } from '@/lib/format';

export default async function BillDetailPage({ params }: { params: Promise<{ billNo: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { billNo } = await params;
  const bill = await db.select().from(bills).where(eq(bills.billNo, billNo)).get();
  if (!bill) notFound();

  const items = await db.select().from(billItems).where(eq(billItems.billId, bill.id)).all();
  const markIds = items.map(i => i.markId);
  const markList = await db.select().from(marks).where(inArray(marks.id, markIds)).all();
  const markMap = new Map(markList.map(m => [m.id, m]));

  const custIds = [...new Set(markList.map(m => m.customerId))];
  const custList = await db.select().from(customers).where(inArray(customers.id, custIds)).all();
  const custMap = new Map(custList.map(c => [c.id, c]));

  const customer = custMap.get(bill.customerId);

  const allSC = markIds.length > 0
    ? (await db.select().from(sharedContainerItems).where(inArray(sharedContainerItems.markId, markIds)).all())
        .map(i => ({ ...i, _markNo: markMap.get(i.markId)?.markNo || '', _type: '拼柜' }))
    : [];
  const allLD = markIds.length > 0
    ? (await db.select().from(loadingItems).where(inArray(loadingItems.markId, markIds)).all())
        .map(i => ({ ...i, _markNo: markMap.get(i.markId)?.markNo || '', _type: '装柜' }))
    : [];
  const allItems = [...allSC, ...allLD];

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
        <div className="flex-1"><h1 className="text-2xl font-bold">{bill.billNo}</h1>
          {customer && <p className="text-sm text-muted-foreground">客户：{customer.name} · 月份：{bill.monthTag}</p>}
        </div>
        <Badge className={bill.status === '已生成' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>{bill.status}</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs">总金额</CardTitle></CardHeader><CardContent className="py-2 px-3"><span className="text-lg font-bold">{formatAmount(totalAmount)}</span></CardContent></Card>
        <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs">已付</CardTitle></CardHeader><CardContent className="py-2 px-3"><span className="text-lg font-bold text-green-600">{formatAmount(paid)}</span></CardContent></Card>
        <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs">剩余</CardTitle></CardHeader><CardContent className="py-2 px-3"><span className="text-lg font-bold text-orange-600">{formatAmount(remaining)}</span></CardContent></Card>
        <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs">导出时间</CardTitle></CardHeader><CardContent className="py-2 px-3"><span className="text-sm">{exportedAt ? new Date(exportedAt).toLocaleDateString('zh-CN') : '-'}</span></CardContent></Card>
        <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs">付款时间</CardTitle></CardHeader><CardContent className="py-2 px-3"><span className="text-sm">{paidAt ? new Date(paidAt).toLocaleDateString('zh-CN') : '-'}</span></CardContent></Card>
      </div>

      <PaymentForm
        billId={bill.id}
        totalAmount={totalAmount}
        currentPaid={paid}
        currentStatus={pStatus}
      />

      <div className="flex gap-2">
        <a href={`/api/bills/export?billId=${bill.id}`}><Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1" />导出Excel</Button></a>
      </div>

      {allItems.length > 0 ? (
        (() => {
          const grouped = new Map<string, any[]>();
          for (const item of allItems) {
            const k = item._markNo || '';
            if (!grouped.has(k)) grouped.set(k, []);
            grouped.get(k)!.push(item);
          }
          return Array.from(grouped.entries()).map(([mk, group]: [string, any[]]) => {
          const gMark = markMap.get(group[0]?.markId);
          const gCust = custMap.get(gMark?.customerId || 0);
          return (
            <Card key={mk}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {mk}
                  {gCust && <span className="font-normal text-muted-foreground ml-2">({gCust.name})</span>}
                  <span className="font-normal text-muted-foreground ml-2">{gMark?.mode || ''}</span>
                  <span className="font-normal text-muted-foreground ml-2">{group.length} 条</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table className="border">
                  <TableHeader>
                    <TableRow>
                      <TableHead>品名</TableHead>
                      <TableHead>仓库</TableHead>
                      <TableHead>运单号</TableHead>
                      <TableHead>货型</TableHead>
                      <TableHead>运输</TableHead>
                      <TableHead className="text-right">总体积</TableHead>
                      <TableHead className="text-right">单箱体积</TableHead>
                      <TableHead className="text-right">件数</TableHead>
                      <TableHead>国内单号</TableHead>
                      <TableHead className="text-right">总重量</TableHead>
                      <TableHead className="text-right">成本</TableHead>
                      <TableHead className="text-right">应收</TableHead>
                      <TableHead>结算</TableHead>
                      <TableHead>类型</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      let lastOrder = '';
                      return group.map((item: any, ri: number) => {
                        const orderKey = item.运单号 || `#${item.id}`;
                        const isFirstInOrder = orderKey !== lastOrder;
                        const orderRowSpan = group.filter((it: any) => (it.运单号 || `#${it.id}`) === orderKey).length;
                        lastOrder = orderKey;
                        return (
                          <TableRow key={item.id || ri}>
                            <TableCell className="border max-w-[100px] truncate" title={item.品名 || ''}>{item.品名 || '-'}</TableCell>
                            {isFirstInOrder ? (
                              <TableCell className="border" rowSpan={orderRowSpan}>{item.仓库 || '-'}</TableCell>
                            ) : null}
                            {isFirstInOrder ? (
                              <TableCell className="border text-xs font-mono" rowSpan={orderRowSpan}>{item.运单号 || '-'}</TableCell>
                            ) : null}
                            <TableCell className="border">{item.货型 || '-'}</TableCell>
                            <TableCell className="border">{item.运输方式 || '-'}</TableCell>
                            {isFirstInOrder ? (
                              <TableCell className="border text-right font-medium" rowSpan={orderRowSpan}>
                                {(item.总体积 ?? 0).toFixed(6)}
                              </TableCell>
                            ) : null}
                            <TableCell className="border text-right">{item.单箱体积 ?? '-'}</TableCell>
                            <TableCell className="border text-right">{item.箱数 || '-'}</TableCell>
                            <TableCell className="border text-xs">{item.国内单号 || '-'}</TableCell>
                            <TableCell className="border text-right">{item.总重量 || '-'}</TableCell>
                            <TableCell className="border text-right text-red-600">{formatAmount((item.需支付总价 || 0))}</TableCell>
                            <TableCell className="border text-right text-green-600">{formatAmount(item.客户应收 || 0)}</TableCell>
                            <TableCell className="border">{item.cost_status || item.payment_status || '-'}</TableCell>
                            <TableCell className="border">
                              <Badge variant="outline" className="text-xs">{item._type}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        });
      })()
      ) : (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无明细数据</CardContent></Card>
      )}
    </div>
  );
}
