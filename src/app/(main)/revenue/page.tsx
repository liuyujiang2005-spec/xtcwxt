import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { shipments, customers, paymentShipmentAllocations } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { formatCents } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default async function RevenuePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allShipments = await db.select().from(shipments).all();
  const allCustomers = await db.select().from(customers).all();
  const allAllocations = await db.select().from(paymentShipmentAllocations).all();

  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const customerRevenue = new Map<number, { shipments: number; volume: number; receivable: number; received: number; byCurrency: { CNY: number; THB: number } }>();

  allShipments.forEach((s) => {
    const entry = customerRevenue.get(s.customerId!) || {
      shipments: 0, volume: 0, receivable: 0, received: 0, byCurrency: { CNY: 0, THB: 0 },
    };
    entry.shipments++;
    entry.volume += s.volume;
    entry.receivable += s.totalReceivableCents;
    entry.byCurrency[s.currency as 'CNY' | 'THB'] += s.totalReceivableCents;

    const alloc = allAllocations.filter((a) => a.shipmentId === s.id).reduce((sum, a) => sum + a.amountCents, 0);
    entry.received += alloc;

    customerRevenue.set(s.customerId!, entry);
  });

  const data = Array.from(customerRevenue.entries())
    .map(([customerId, v]) => ({
      customerId,
      customerName: customerMap.get(customerId as number) || '未知',
      ...v,
      unreceived: v.receivable - v.received,
    }))
    .sort((a, b) => b.receivable - a.receivable);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">收入总表</h1>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户</TableHead>
                <TableHead className="text-right">票数</TableHead>
                <TableHead className="text-right">总体积(m³)</TableHead>
                <TableHead className="text-right">应收 CNY</TableHead>
                <TableHead className="text-right">应收 THB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.customerId}>
                  <TableCell className="font-medium">{row.customerName}</TableCell>
                  <TableCell className="text-right">{row.shipments}</TableCell>
                  <TableCell className="text-right">{row.volume.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{formatCents(row.byCurrency.CNY)}</TableCell>
                  <TableCell className="text-right">{formatCents(row.byCurrency.THB, 'THB')}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无数据</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
