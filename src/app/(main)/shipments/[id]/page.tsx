import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/db/index';
import { shipments, shipmentCosts, customers, suppliers, paymentShipmentAllocations, paymentsReceived } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { formatCents } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ShipmentActions from './actions';
import DeleteCostButton from './delete-cost-button';

const STATUS_COLORS: Record<string, string> = {
  '运输中': 'bg-blue-100 text-blue-700',
  '已到仓': 'bg-yellow-100 text-yellow-700',
  '已签收': 'bg-green-100 text-green-700',
  '已结算': 'bg-gray-100 text-gray-700',
  '部分已收': 'bg-orange-100 text-orange-700',
};

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const shipment = await db.select().from(shipments).where(eq(shipments.id, parseInt(id))).get();
  if (!shipment) notFound();

  const customer = await db.select().from(customers).where(eq(customers.id, shipment.customerId!)).get();
  const costs = await db.select().from(shipmentCosts).where(eq(shipmentCosts.shipmentId, shipment.id)).all();
  const allSuppliers = await db.select().from(suppliers).all();
  const supplierMap = new Map(allSuppliers.map((s) => [s.id, s.name]));

  const totalCost = costs.reduce((sum, c) => sum + c.amountCents, 0);
  const profit = shipment.totalReceivableCents - totalCost;

  const allocations = await db
    .select()
    .from(paymentShipmentAllocations)
    .where(eq(paymentShipmentAllocations.shipmentId, shipment.id))
    .all();

  const paymentIds = allocations.map((a) => a.paymentReceivedId);
  let paymentMap = new Map<number, any>();
  if (paymentIds.length > 0) {
    const allPayments = await db.select().from(paymentsReceived).all();
    allPayments.forEach((p) => paymentMap.set(p.id, p));
  }

  const totalAllocated = allocations.reduce((sum, a) => sum + a.amountCents, 0);

  const isViewer = user.role === 'viewer';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{shipment.shipmentNo}</h1>
          <p className="text-muted-foreground">{customer?.name || '未知客户'}</p>
        </div>
                <Badge className={`text-base px-3 py-1 ${STATUS_COLORS[shipment.status!] || ''}`}>
          {shipment.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">运输方式:</span>
                <span className="ml-2 font-medium">{shipment.shipmentType! === 'sea' ? '海运' : '陆运'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">货物类型:</span>
                <span className="ml-2 font-medium">
                  {shipment.goodsType! === 'regular' ? '普货' : shipment.goodsType! === 'inspection' ? '商检货' : '敏感货'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">体积:</span>
                <span className="ml-2 font-medium">{shipment.volume} m³</span>
              </div>
              <div>
                <span className="text-muted-foreground">单价:</span>
                <span className="ml-2 font-medium">{formatCents(shipment.unitPriceCents)}/m³</span>
              </div>
              <div>
                <span className="text-muted-foreground">币种:</span>
                <span className="ml-2 font-medium">{shipment.currency}</span>
              </div>
              <div>
                <span className="text-muted-foreground">提单号:</span>
                <span className="ml-2 font-medium">{shipment.blNo || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">柜号:</span>
                <span className="ml-2 font-medium">{shipment.containerNo || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">ETD:</span>
                <span className="ml-2 font-medium">{shipment.etd || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">ETA BKK:</span>
                <span className="ml-2 font-medium">{shipment.etaBkk || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">月份:</span>
                <span className="ml-2 font-medium">{shipment.monthTag}</span>
              </div>
              <div>
                <span className="text-muted-foreground">创建时间:</span>
                <span className="ml-2 font-medium">{shipment.createdAt?.substring(0, 10) || '-'}</span>
              </div>
            </div>
            {shipment.remark && (
              <>
                <Separator className="my-3" />
                <p className="text-sm text-muted-foreground">备注: {shipment.remark}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>利润汇总</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">应收金额:</span>
              <span className="font-bold">{formatCents(shipment.totalReceivableCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">总成本:</span>
              <span className="font-bold text-red-600">{formatCents(totalCost)}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">利润:</span>
              <span className={`text-lg font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCents(profit)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">已收:</span>
              <span>{formatCents(totalAllocated)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">未收:</span>
              <span className="text-orange-600">{formatCents(Math.max(0, shipment.totalReceivableCents - totalAllocated))}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>成本明细</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>费用类型</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead>币种</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.costType}</TableCell>
                  <TableCell className="text-right">{formatCents(c.amountCents)}</TableCell>
                  <TableCell>{c.currency}</TableCell>
                  <TableCell>{c.supplierId ? supplierMap.get(c.supplierId) || '-' : '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{c.remark || '-'}</TableCell>
                  <TableCell>
                    {!isViewer && user.role !== 'operator' && (
                      <DeleteCostButton costId={c.id} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {costs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-4">暂无成本数据</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>回款记录</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>回款日期</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead>币种</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((a) => {
                const payment = paymentMap.get(a.paymentReceivedId!);
                return (
                  <TableRow key={a.id}>
                    <TableCell>{payment?.receivedDate || '-'}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCents(a.amountCents)}</TableCell>
                    <TableCell>{payment?.currency || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{payment?.remark || '-'}</TableCell>
                  </TableRow>
                );
              })}
              {allocations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-4">暂无回款记录</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!isViewer && <ShipmentActions shipmentId={shipment.id} currentStatus={shipment.status!} />}
    </div>
  );
}
