import { db } from '@/db/index';
import { marks, paymentsReceived, customerMetrics } from '@/db/schema';
import { eq } from 'drizzle-orm';

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
  const monthlyVolume = recentMarks.length > 0 ? 10 : 0;

  let overallRating = 'C';
  if (avgPaymentDays < 15) overallRating = 'A';
  else if (avgPaymentDays < 30) overallRating = 'B';
  else if (avgPaymentDays > 60) overallRating = 'D';

  const existing = await db.select().from(customerMetrics).where(eq(customerMetrics.customerId, customerId)).get();
  if (existing) {
    await db.update(customerMetrics).set({ avgPaymentDays, monthlyVolume, monthlyShipments: recentMarks.length, overdueCount: 0, overallRating, lastUpdated: new Date().toISOString() }).where(eq(customerMetrics.customerId, customerId));
  } else {
    await db.insert(customerMetrics).values({ customerId, avgPaymentDays, monthlyVolume, monthlyShipments: recentMarks.length, overdueCount: 0, overallRating, lastUpdated: new Date().toISOString() });
  }
}
