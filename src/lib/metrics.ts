import { db } from '@/db/index';
import { shipments, paymentsReceived, paymentShipmentAllocations, customerMetrics } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function refreshCustomerMetrics(customerId: number) {
  const customerShipments = await db
    .select()
    .from(shipments)
    .where(eq(shipments.customerId, customerId))
    .all();

  if (customerShipments.length === 0) return;

  const allAllocs = await db.select().from(paymentShipmentAllocations).all();
  const allPayments = await db.select().from(paymentsReceived).where(eq(paymentsReceived.customerId, customerId)).all();

  let totalPaymentDays = 0;
  let paymentCount = 0;
  for (const payment of allPayments) {
    const paymentAllocs = allAllocs.filter((a) => a.paymentReceivedId === payment.id);
    for (const alloc of paymentAllocs) {
      const shipment = customerShipments.find((s) => s.id === alloc.shipmentId);
      if (shipment?.createdAt) {
        const createdDate = new Date(shipment.createdAt);
        const paidDate = new Date(payment.receivedDate);
        totalPaymentDays += Math.round((paidDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
        paymentCount++;
      }
    }
  }
  const avgPaymentDays = paymentCount > 0 ? Math.round(totalPaymentDays / paymentCount) : 0;

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const recentShipments = customerShipments.filter((s) => {
    return s.createdAt && new Date(s.createdAt) >= sixMonthsAgo;
  });
  const monthlyVolume = recentShipments.reduce((sum, s) => sum + s.volume, 0) / 6;

  let overdueCount = 0;
  for (const s of customerShipments) {
    if (s.status === '运输中' || s.status === '已到仓' || s.status === '已签收') {
      const allocSum = allAllocs
        .filter((a) => a.shipmentId === s.id)
        .reduce((sum, a) => sum + a.amountCents, 0);
      if (allocSum < s.totalReceivableCents && s.createdAt) {
        const daysSinceCreated = Math.round((now.getTime() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceCreated > 60) overdueCount++;
      }
    }
  }

  let overallRating = 'C';
  if (avgPaymentDays < 15 && monthlyVolume > 10) {
    overallRating = 'A';
  } else if (avgPaymentDays < 30) {
    overallRating = 'B';
  } else if (avgPaymentDays > 60 || overdueCount > 0) {
    overallRating = 'D';
  }

  const existing = await db
    .select()
    .from(customerMetrics)
    .where(eq(customerMetrics.customerId, customerId))
    .get();

  if (existing) {
    await db.update(customerMetrics)
      .set({
        avgPaymentDays,
        monthlyVolume,
        monthlyShipments: recentShipments.length,
        overdueCount,
        overallRating,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(customerMetrics.customerId, customerId));
  } else {
    await db.insert(customerMetrics).values({
      customerId,
      avgPaymentDays,
      monthlyVolume,
      monthlyShipments: recentShipments.length,
      overdueCount,
      overallRating,
      lastUpdated: new Date().toISOString(),
    });
  }
}
