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

  const allSC: any[] = [];
  const allLD: any[] = [];
  for (const mId of markIds) {
    const scItems = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, mId)).all();
    const ldItems = await db.select().from(loadingItems).where(eq(loadingItems.markId, mId)).all();
    allSC.push(...scItems.map(i => ({ ...i, _markNo: markMap.get(mId)?.markNo || '', _type: '拼柜' })));
    allLD.push(...ldItems.map(i => ({ ...i, _markNo: markMap.get(mId)?.markNo || '', _type: '装柜' })));
  }
  const allItems = [...allSC, ...allLD];

  // Group by mark
  const groups = new Map<string, any[]>();
  for (const item of allItems) { const k = item._markNo || `#${item.markId}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(item); }

  const paid = (bill as any).paidAmount || 0;
  const remaining = bill.totalAmountCents - paid;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/bills"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="flex-1"><h1 className="text-2xl font-bold">{bill.billNo}</h1></div>
        <Badge className={bill.status === '已生成' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>{bill.status}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总金额</CardTitle></CardHeader><CardContent><span className="text-xl font-bold">¥{bill.totalAmountCents.toFixed(2)}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">已付</CardTitle></CardHeader><CardContent><span className="text-xl font-bold text-green-600">¥{paid.toFixed(2)}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">剩余</CardTitle></CardHeader><CardContent><span className="text-xl font-bold text-orange-600">¥{remaining.toFixed(2)}</span></CardContent></Card>
      </div>

      <PaymentForm billId={bill.id} currentPaid={paid} currentStatus={(bill as any).paymentStatus || '待付款'} />

      <div className="flex gap-2"><a href={`/api/bills/export?billId=${bill.id}`}><Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1" />导出Excel</Button></a></div>

      {Array.from(groups.entries()).map(([markNo, group]) => (
        <Card key={markNo}>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{markNo} <span className="font-normal text-muted-foreground">{group.length} 条</span></CardTitle></CardHeader>
          <CardContent className="p-0"><Table>
            <TableHeader><TableRow>
              <TableHead>品名</TableHead><TableHead>货型</TableHead><TableHead>运输</TableHead><TableHead className="text-right">件数</TableHead><TableHead className="text-right">总体积</TableHead><TableHead>国内单号</TableHead><TableHead className="text-right">总重量</TableHead><TableHead>类型</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(() => { let last = ''; return group.map((item, ri) => { const mk = item._markNo; const first = mk !== last; last = mk; return (<TableRow key={ri}>
                {first ? <TableCell className="font-medium" rowSpan={group.length}>{mk}</TableCell> : null}
                <TableCell className="max-w-[100px] truncate">{item.品名 || '-'}</TableCell>
                <TableCell>{item.货型 || '-'}</TableCell><TableCell>{item.运输方式 || '-'}</TableCell>
                <TableCell className="text-right">{item.箱数 || '-'}</TableCell>
                <TableCell className="text-right">{(item.总体积 || 0).toFixed(6)}</TableCell>
                <TableCell className="text-xs">{item.国内单号 || '-'}</TableCell>
                <TableCell className="text-right">{item.总重量 || '-'}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{item._type}</Badge></TableCell>
              </TableRow>); }); })()}
            </TableBody>
          </Table></CardContent>
        </Card>
      ))}
    </div>
  );
}
