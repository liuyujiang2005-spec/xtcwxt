import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { customers, paymentsReceived, customerMetrics, marks, sharedContainerItems, loadingItems } from '@/db/schema';
import { formatCents } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function CustomerAccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allCustomers = await db.select().from(customers).all();
  const allPayments = await db.select().from(paymentsReceived).all();
  const allMetrics = await db.select().from(customerMetrics).all();
  const allMarks = await db.select().from(marks).all();
  const allScItems = await db.select().from(sharedContainerItems).all();
  const allLdItems = await db.select().from(loadingItems).all();
  const volumeByCustomer = new Map<number, number>();
  allScItems.forEach((i) => volumeByCustomer.set(i.customerId, (volumeByCustomer.get(i.customerId) || 0) + (i.总体积 || 0)));
  allLdItems.forEach((i) => volumeByCustomer.set(i.customerId, (volumeByCustomer.get(i.customerId) || 0) + (i.总体积 || 0)));

  const data = allCustomers.map((c) => {
    const custPayments = allPayments.filter((p) => p.customerId === c.id);
    const received = custPayments.reduce((sum, p) => sum + p.amountCents, 0);
    const metric = allMetrics.find((m) => m.customerId === c.id);
    const custMarks = allMarks.filter((m) => m.customerId === c.id);
    const totalVolume = volumeByCustomer.get(c.id) || 0;

    return {
      customerId: c.id,
      name: c.name,
      marksCount: custMarks.length,
      received,
      rating: metric?.overallRating || '-',
      avgPaymentDays: metric?.avgPaymentDays || 0,
      monthlyVolume: metric?.monthlyVolume || 0,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">客户账期</h1>
      {data.map((row) => (
        <Card key={row.customerId}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{row.name}</CardTitle>
              <Badge className={
                row.rating === 'A' ? 'bg-green-100 text-green-700' :
                row.rating === 'B' ? 'bg-blue-100 text-blue-700' :
                row.rating === 'C' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }>
                {row.rating}级 · 回款{row.avgPaymentDays}天 · 月均{row.monthlyVolume.toFixed(1)}m³
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">唛头数</p>
                <p className="text-lg font-bold">{row.marksCount}</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-muted-foreground">已收</p>
                <p className="text-lg font-bold text-green-600">{formatCents(row.received)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {data.length === 0 && <Card><CardContent className="py-8 text-center text-muted-foreground">暂无客户数据</CardContent></Card>}
    </div>
  );
}
