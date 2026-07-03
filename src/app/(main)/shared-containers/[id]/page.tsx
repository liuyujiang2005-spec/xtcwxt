import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/db/index';
import { sharedContainerBatches, sharedContainerItems, customers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { formatCents } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function SharedContainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const batch = await db.select().from(sharedContainerBatches).where(eq(sharedContainerBatches.id, parseInt(id))).get();
  if (!batch) notFound();

  const items = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.batchId, batch.id)).all();
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const totalVolume = items.reduce((s, i) => s + i.总体积, 0);
  const totalCost = items.reduce((s, i) => s + (i.需支付总价_cents || 0), 0);
  const totalReceivable = items.reduce((s, i) => s + (i.客户应收_cents || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
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

      <Card>
        <CardHeader><CardTitle>明细（{items.length} 条）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户</TableHead>
                <TableHead>品名</TableHead>
                <TableHead className="text-right">总体积</TableHead>
                <TableHead>货型</TableHead>
                <TableHead>运输</TableHead>
                <TableHead className="text-right">成本价</TableHead>
                <TableHead className="text-right">应收</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{customerMap.get(item.customerId) || '-'}</TableCell>
                  <TableCell className="max-w-[150px] truncate" title={item.品名 || ''}>{item.品名 || '-'}</TableCell>
                  <TableCell className="text-right">{item.总体积.toFixed(2)}</TableCell>
                  <TableCell>{item.货型 || '-'}</TableCell>
                  <TableCell>{item.运输方式 || '-'}</TableCell>
                  <TableCell className="text-right">{formatCents(item.需支付总价_cents || 0)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCents(item.客户应收_cents || 0)}</TableCell>
                  <TableCell>
                    <Badge className={item.cost_status === '已支出' ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-700'}>
                      {item.cost_status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">暂无明细</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
