import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { suppliers, shipments, shipmentCosts, paymentsMade } from '@/db/schema';
import { formatCents } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SupplierPaymentForm from './payment-form';

export default async function SupplierAccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allSuppliers = await db.select().from(suppliers).all();
  const allCosts = await db.select().from(shipmentCosts).all();
  const allPayments = await db.select().from(paymentsMade).all();
  const allShipments = await db.select().from(shipments).all();
  const shipmentMap = new Map(allShipments.map((s) => [s.id, s]));

  const unpaidCosts = allCosts.map((c) => ({
    id: c.id,
    costType: c.costType,
    amountCents: c.amountCents,
    currency: c.currency || 'CNY',
    shipmentNo: shipmentMap.get(c.shipmentId!)?.shipmentNo || '-',
    shipmentId: c.shipmentId!,
    supplierId: c.supplierId!,
  }));

  const data = allSuppliers.map((s) => {
    const payable = allCosts
      .filter((c) => c.supplierId === s.id)
      .reduce((sum, c) => sum + c.amountCents, 0);

    const paid = allPayments
      .filter((p) => p.supplierId === s.id)
      .reduce((sum, p) => sum + p.amountCents, 0);

    return {
      id: s.id,
      name: s.name,
      type: s.type || '-',
      payable,
      paid,
      unpaid: payable - paid,
    };
  });

  const isViewer = user.role === 'viewer';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">供应商应付</h1>
        {!isViewer && <SupplierPaymentForm suppliers={allSuppliers as any} unpaidCosts={unpaidCosts as any} />}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>供应商</TableHead>
                <TableHead>类型</TableHead>
                <TableHead className="text-right">应付</TableHead>
                <TableHead className="text-right">已付</TableHead>
                <TableHead className="text-right">未付</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell className="text-right">{formatCents(row.payable)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCents(row.paid)}</TableCell>
                  <TableCell className="text-right text-orange-600">{formatCents(row.unpaid)}</TableCell>
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
