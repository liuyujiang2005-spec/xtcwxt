import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/db/index';
import { marks, customers, sharedContainerItems, loadingItems, directIncome } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { formatCents } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScItemEditDialog } from './ScItemEditDialog';

export default async function MarkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const mark = await db.select().from(marks).where(eq(marks.id, parseInt(id))).get();
  if (!mark) notFound();

  const customer = await db.select().from(customers).where(eq(customers.id, mark.customerId)).get();

  const scItems = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, mark.id)).all();
  const ldItems = await db.select().from(loadingItems).where(eq(loadingItems.markId, mark.id)).all();
  const diItems = await db.select().from(directIncome).where(eq(directIncome.markId, mark.id)).all();

  const costTotal = [...scItems, ...ldItems].reduce((s: number, i: any) => s + (i.需支付总价_cents || i.成本单价_cents || i.单价_cents || 0), 0);
  const receivableTotal = [...scItems, ...ldItems].reduce((s: number, i: any) => s + (i.客户应收_cents || 0), 0);
  const directTotal = diItems.reduce((s, i) => s + i.amountCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{mark.markNo}</h1>
          <p className="text-muted-foreground">{customer?.name || '未知客户'} · {mark.mode}</p>
        </div>
        <Badge className={mark.mode === '拼柜' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}>
          {mark.mode}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总成本</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold text-red-600">{formatCents(costTotal)}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">总应收</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-bold text-green-600">{formatCents(receivableTotal)}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">利润</CardTitle></CardHeader>
          <CardContent>
            <span className={`text-xl font-bold ${receivableTotal + directTotal - costTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCents(receivableTotal + directTotal - costTotal)}
            </span>
          </CardContent></Card>
      </div>

      {scItems.length > 0 && (
        <Card>
          <CardHeader><CardTitle>拼柜明细</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>品名</TableHead><TableHead className="text-right">体积</TableHead>
                  <TableHead>货型</TableHead><TableHead>运输</TableHead>
                  <TableHead className="text-right">成本</TableHead><TableHead className="text-right">应收</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.品名 || '-'}</TableCell>
                    <TableCell className="text-right">{item.总体积.toFixed(2)}</TableCell>
                    <TableCell>{item.货型 || '-'}</TableCell>
                    <TableCell>{item.运输方式 || '-'}</TableCell>
                    <TableCell className="text-right text-red-600">{formatCents(item.需支付总价_cents || 0)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCents(item.客户应收_cents || 0)}</TableCell>
                    <TableCell className="text-center">
                      <ScItemEditDialog
                        itemId={item.id}
                        volume={item.总体积}
                        成本单价_cents={item.成本单价_cents || 0}
                        客户应收_cents={item.客户应收_cents || 0}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {ldItems.length > 0 && (
        <Card>
          <CardHeader><CardTitle>装柜明细</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>品名</TableHead><TableHead className="text-right">体积</TableHead>
                  <TableHead>货型</TableHead><TableHead>运输</TableHead>
                  <TableHead className="text-right">应收</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ldItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.品名 || '-'}</TableCell>
                    <TableCell className="text-right">{item.总体积.toFixed(2)}</TableCell>
                    <TableCell>{item.货型 || '-'}</TableCell>
                    <TableCell>{item.运输方式 || '-'}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCents(item.需支付总价_cents || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {diItems.length > 0 && (
        <Card>
          <CardHeader><CardTitle>直接收入</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">金额</TableHead><TableHead>币种</TableHead>
                  <TableHead className="text-right">体积</TableHead><TableHead>日期</TableHead><TableHead>备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-right text-green-600">{formatCents(item.amountCents, item.currency || undefined)}</TableCell>
                    <TableCell>{item.currency}</TableCell>
                    <TableCell className="text-right">{item.volume ? `${item.volume.toFixed(2)}m³` : '-'}</TableCell>
                    <TableCell className="text-sm">{item.incomeDate}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.remark || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {scItems.length === 0 && ldItems.length === 0 && diItems.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">该唛头暂无相关数据</CardContent></Card>
      )}
    </div>
  );
}
