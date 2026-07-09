import { db } from '@/db/index';
import { marks, paymentsReceived, customerMetrics, sharedContainerItems, loadingItems } from '@/db/schema';
import { eq, and, gte } from 'drizzle-orm';

export async function refreshCustomerMetrics(customerId: number) {
  const allMarks = await db.select().from(marks).where(eq(marks.customerId, customerId)).all();
  if (allMarks.length === 0) return;

  const allPayments = await db.select().from(paymentsReceived).where(eq(paymentsReceived.customerId, customerId)).all();

  let totalPaymentDays = 0;
  let paymentCount = 0;
  for (const p of allPayments) {
    const mark = allMarks.find((m) => m.id === p.markId);
    if (mark?.createdAt) {
      const createdDate = new Date(mark.createdAt);
      const paidDate = new Date(p.receivedDate);
      totalPaymentDays += Math.round((paidDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      paymentCount++;
    }
  }
  const avgPaymentDays = paymentCount > 0 ? Math.round(totalPaymentDays / paymentCount) : 0;

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const recentMarks = allMarks.filter((m) => m.createdAt && new Date(m.createdAt) >= sixMonthsAgo);
  const recentMarkIds = recentMarks.map((m) => m.id);
  let totalVolume = 0;
  if (recentMarkIds.length > 0) {
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().substring(0, 10);
    const scVol = await db.select().from(sharedContainerItems)
      .where(and(eq(sharedContainerItems.customerId, customerId), gte(sharedContainerItems.createdAt, sixMonthsAgoStr))).all();
    const ldVol = await db.select().from(loadingItems)
      .where(and(eq(loadingItems.customerId, customerId), gte(loadingItems.createdAt, sixMonthsAgoStr))).all();
    totalVolume = [...scVol, ...ldVol].reduce((s, i) => s + (i.总体积 || 0), 0);
  }
  const monthlyVolume = recentMarks.length > 0 ? (totalVolume / 6) : 0;
  const monthlyShipments = recentMarks.length > 0 ? Math.round(recentMarks.length / 6) : 0;

  const overdueCount = allMarks.filter((m) => {
    if (!m.createdAt) return false;
    const created = new Date(m.createdAt);
    const daysSinceCreated = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreated < 60) return false;
    const hasPayment = allPayments.some((p) => p.markId === m.id);
    return !hasPayment;
  }).length;

  let overallRating = 'C';
  if (avgPaymentDays < 15 && overdueCount === 0) overallRating = 'A';
  else if (avgPaymentDays < 30 && overdueCount === 0) overallRating = 'B';
  else if (avgPaymentDays > 60 || overdueCount > 0) overallRating = 'D';

  const existing = await db.select().from(customerMetrics).where(eq(customerMetrics.customerId, customerId)).get();
  if (existing) {
    await db.update(customerMetrics).set({ avgPaymentDays, monthlyVolume, monthlyShipments, overdueCount, overallRating, lastUpdated: new Date().toISOString() }).where(eq(customerMetrics.customerId, customerId));
  } else {
    await db.insert(customerMetrics).values({ customerId, avgPaymentDays, monthlyVolume, monthlyShipments, overdueCount, overallRating, lastUpdated: new Date().toISOString() });
  }
}
