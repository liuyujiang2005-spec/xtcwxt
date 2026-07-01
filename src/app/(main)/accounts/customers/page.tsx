import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { shipments, customers, paymentShipmentAllocations, paymentsReceived, customerMetrics, shipmentCosts } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { formatCents } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import PaymentForm from './payment-form';

export default async function CustomerAccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allCustomers = await db.select().from(customers).all();
  const allShipments = await db.select().from(shipments).all();
  const allAllocs = await db.select().from(paymentShipmentAllocations).all();
  const allMetrics = await db.select().from(customerMetrics).all();
  const allCosts = await db.select().from(shipmentCosts).all();

  const now = new Date();

  const data = allCustomers.map((c) => {
    const custShipments = allShipments.filter((s) => s.customerId === c.id && s.status !== '已结算');
    const receivable = custShipments.reduce((sum, s) => sum + s.totalReceivableCents, 0);

    const received = allAllocs
      .filter((a) => custShipments.some((s) => s.id === a.shipmentId))
      .reduce((sum, a) => sum + a.amountCents, 0);

    // Aging analysis
    let aging30 = 0, aging60 = 0, aging90 = 0, agingOver = 0;
    custShipments.forEach((s) => {
      if (!s.createdAt) return;
      const days = Math.round((now.getTime() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const allocSum = allAllocs.filter((a) => a.shipmentId === s.id).reduce((sum, a) => sum + a.amountCents, 0);
      const unpaid = s.totalReceivableCents - allocSum;
      if (unpaid <= 0) return;
      if (days <= 30) aging30 += unpaid;
      else if (days <= 60) aging60 += unpaid;
      else if (days <= 90) aging90 += unpaid;
      else agingOver += unpaid;
    });

    const metric = allMetrics.find((m) => m.customerId === c.id);

    return {
      customerId: c.id,
      name: c.name,
      receivable,
      received,
      unreceived: receivable - received,
      aging30,
      aging60,
      aging90,
      agingOver,
      rating: metric?.overallRating || '-',
      avgPaymentDays: metric?.avgPaymentDays || 0,
      monthlyVolume: metric?.monthlyVolume || 0,
    };
  });

  const isViewer = user.role === 'viewer';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">客户账期</h1>
        {!isViewer && <PaymentForm customers={allCustomers as any} shipments={allShipments as any} allocations={allAllocs as any} />}
      </div>

      {data.map((row) => (
        <Card key={row.customerId}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{row.name}</CardTitle>
              <Badge className={
                row.rating === 'A' ? 'bg-green-100 text-green-700' :
                row.rating === 'B' ? 'bg-blue-100 text-blue-700' :
                row.rating === 'C' ? 'bg-yellow-100 text-yellow-700' :
                row.rating === 'D' ? 'bg-red-100 text-red-700' : ''
              }>
                {row.rating}级 · 平均回款{row.avgPaymentDays}天 · 月均{row.monthlyVolume.toFixed(1)}m³
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">应收</p>
                <p className="text-lg font-bold">{formatCents(row.receivable)}</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-muted-foreground">已收</p>
                <p className="text-lg font-bold text-green-600">{formatCents(row.received)}</p>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <p className="text-sm text-muted-foreground">未收</p>
                <p className="text-lg font-bold text-orange-600">{formatCents(row.unreceived)}</p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>30天内</TableHead>
                  <TableHead>30-60天</TableHead>
                  <TableHead>60-90天</TableHead>
                  <TableHead>90天以上</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>{formatCents(row.aging30)}</TableCell>
                  <TableCell>{formatCents(row.aging60)}</TableCell>
                  <TableCell className="text-orange-600">{formatCents(row.aging90)}</TableCell>
                  <TableCell className="text-red-600">{formatCents(row.agingOver)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {data.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">暂无客户数据</CardContent>
        </Card>
      )}
    </div>
  );
}
