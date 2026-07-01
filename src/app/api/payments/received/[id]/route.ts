import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { paymentsReceived, paymentShipmentAllocations, shipments } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { refreshCustomerMetrics } from '@/lib/metrics';
import { eq, inArray } from 'drizzle-orm';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || (user.role !== 'admin' && user.role !== 'finance'))
    return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const { id } = await params;
    const paymentId = parseInt(id);

    const allocations = await db
      .select()
      .from(paymentShipmentAllocations)
      .where(eq(paymentShipmentAllocations.paymentReceivedId, paymentId))
      .all();

    const affectedShipmentIds = [...new Set(allocations.map((a) => a.shipmentId!))].filter(Boolean) as number[];

    await db
      .delete(paymentShipmentAllocations)
      .where(eq(paymentShipmentAllocations.paymentReceivedId, paymentId));

    await db.delete(paymentsReceived).where(eq(paymentsReceived.id, paymentId));

    for (const shipmentId of affectedShipmentIds) {
      const remainingAllocs = await db
        .select()
        .from(paymentShipmentAllocations)
        .where(eq(paymentShipmentAllocations.shipmentId, shipmentId))
        .all();

      const totalAllocated = remainingAllocs.reduce((sum, a) => sum + a.amountCents, 0);
      const shipment = await db
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipmentId))
        .get();

      if (!shipment) continue;

      if (totalAllocated <= 0) {
        if (shipment.status === '已结算' || shipment.status === '部分已收') {
          await db.update(shipments).set({ status: '已签收' }).where(eq(shipments.id, shipmentId));
        }
      } else if (totalAllocated < shipment.totalReceivableCents) {
        await db.update(shipments).set({ status: '部分已收' }).where(eq(shipments.id, shipmentId));
      } else {
        await db.update(shipments).set({ status: '已结算' }).where(eq(shipments.id, shipmentId));
      }
    }

    if (affectedShipmentIds.length > 0) {
      const affectedShipments = await db
        .select()
        .from(shipments)
        .where(inArray(shipments.id, affectedShipmentIds))
        .all();

      const affectedCustomers = [...new Set(affectedShipments.map((s) => s.customerId!))].filter(Boolean) as number[];

      for (const customerId of affectedCustomers) {
        await refreshCustomerMetrics(customerId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete payment error:', error);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
