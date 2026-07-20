import { db } from '@/db/index';
import { marks, paymentsReceived, customerMetrics, sharedContainerItems, loadingItems, bills, billItems } from '@/db/schema';
import { eq, and, gte } from 'drizzle-orm';

export async function refreshCustomerMetrics(customerId: number) {
  const allMarks = await db.select().from(marks).where(eq(marks.customerId, customerId)).orderBy(marks.markNo).all();
  if (allMarks.length === 0) {
    // 客户唛头全部删除，清理陈旧指标
    await db.delete(customerMetrics).where(eq(customerMetrics.customerId, customerId));
    return;
  }

  const allPayments = await db.select().from(paymentsReceived).where(eq(paymentsReceived.customerId, customerId)).all();

  // 收集付款记录：{ markId, paymentDate }
  type PaymentRecord = { markId: number; paymentDate: string };
  const paymentRecords: PaymentRecord[] = [];

  // 来自 paymentsReceived
  for (const p of allPayments) {
    if (p.receivedDate && p.markId) {
      paymentRecords.push({ markId: p.markId, paymentDate: p.receivedDate });
    }
  }

  // 来自 bills（已付款账单），通过 bill_items.mark_id 关联唛头
  const paidBills = await db
    .select({
      billId: bills.id,
      paidAt: bills.paidAt,
      markId: billItems.markId,
    })
    .from(bills)
    .innerJoin(billItems, eq(billItems.billId, bills.id))
    .where(and(
      eq(bills.customerId, customerId),
      eq(bills.paymentStatus, '已付款'),
    ))
    .all();

  for (const row of paidBills) {
    if (row.paidAt && row.markId && !paymentRecords.some(r => r.markId === row.markId && r.paymentDate === row.paidAt)) {
      paymentRecords.push({ markId: row.markId, paymentDate: row.paidAt });
    }
  }

  // 计算平均回款天数
  let totalPaymentDays = 0;
  let paymentCount = 0;
  for (const rec of paymentRecords) {
    const mark = allMarks.find((m) => m.id === rec.markId);
    if (mark?.createdAt) {
      const createdDate = new Date(mark.createdAt);
      const paidDate = new Date(rec.paymentDate);
      const days = Math.max(0, Math.round((paidDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)));
      totalPaymentDays += days;
      paymentCount++;
    }
  }
  const avgPaymentDays = paymentCount > 0 ? Math.round(totalPaymentDays / paymentCount) : 0;

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const recentMarks = allMarks.filter((m) => m.createdAt && new Date(m.createdAt) >= sixMonthsAgo);
  let totalVolume = 0;
  if (recentMarks.length > 0) {
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().substring(0, 10);
    const scVol = await db.select().from(sharedContainerItems)
      .where(and(eq(sharedContainerItems.customerId, customerId), gte(sharedContainerItems.createdAt, sixMonthsAgoStr))).all();
    const ldVol = await db.select().from(loadingItems)
      .where(and(eq(loadingItems.customerId, customerId), gte(loadingItems.createdAt, sixMonthsAgoStr))).all();
    totalVolume = [...scVol, ...ldVol].reduce((s, i) => s + (i.总体积 || 0), 0);
  }
  const monthlyVolume = recentMarks.length > 0 ? (totalVolume / 6) : 0;
  const monthlyShipments = recentMarks.length > 0 ? Math.ceil(recentMarks.length / 6) : 0;

  const paidMarkIds = new Set(paymentRecords.map(r => r.markId));

  const overdueCount = allMarks.filter((m) => {
    if (!m.createdAt) return false;
    const created = new Date(m.createdAt);
    const daysSinceCreated = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreated < 60) return false;
    return !paidMarkIds.has(m.id);
  }).length;

  let overallRating = 'C';
  if (avgPaymentDays < 15 && overdueCount === 0) overallRating = 'A';
  else if (avgPaymentDays < 30 && overdueCount === 0) overallRating = 'B';
  else if (avgPaymentDays > 60 || overdueCount > 0) overallRating = 'D';

  const existing = await db.select().from(customerMetrics).where(eq(customerMetrics.customerId, customerId)).get();
  if (existing) {
    await db.update(customerMetrics)
      .set({ avgPaymentDays, monthlyVolume, monthlyShipments, overdueCount, overallRating, lastUpdated: new Date().toISOString() })
      .where(eq(customerMetrics.customerId, customerId));
  } else {
    await db.insert(customerMetrics)
      .values({ customerId, avgPaymentDays, monthlyVolume, monthlyShipments, overdueCount, overallRating, lastUpdated: new Date().toISOString() });
  }
}
