import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { customers, bills, marks } from '@/db/schema';
import { sql, eq, like, and } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PaymentReceivedDialog } from './PaymentReceivedDialog';

// 🔴修复：用SQL聚合替代全表加载，去掉死代码 volumeByCustomer
export default async function CustomerAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const q = sp.q || '';
  const month = sp.month || '';

  const allCustomers = await db.select().from(customers).all();

  // 按月聚合账单数据（SQL层完成）
  const billAgg = await db
    .select({
      customerId: bills.customerId,
      monthTag: bills.monthTag,
      totalAmount: sql<number>`sum(total_amount_cents)`,
      paidAmount: sql<number>`sum(paid_amount)`,
      billCount: sql<number>`count(*)`,
      paidCount: sql<number>`sum(case when payment_status='已付款' then 1 else 0 end)`,
      partialCount: sql<number>`sum(case when payment_status='付一部分' then 1 else 0 end)`,
      lastPaidAt: sql<string>`max(paid_at)`,
    })
    .from(bills)
    .groupBy(bills.customerId, bills.monthTag)
    .all();

  // 唛头数量（只查 id 和 customerId，不全量拉数据）
  const markCounts = await db
    .select({
      customerId: marks.customerId,
      count: sql<number>`count(*)`,
      markNos: sql<string>`group_concat(mark_no)`,
    })
    .from(marks)
    .groupBy(marks.customerId)
    .all();
  const markCountMap = new Map(markCounts.map((r) => [r.customerId, r.count]));

  // 每个客户的唛头列表（用于 PaymentReceivedDialog 关联唛头）
  const allMarks = await db
    .select({ id: marks.id, markNo: marks.markNo, customerId: marks.customerId })
    .from(marks)
    .all();

  // 可用月份
  const availableMonths = [...new Set(billAgg.map((r) => r.monthTag))].sort().reverse();

  // 客户搜索过滤
  let filteredCustomers = allCustomers;
  if (q) {
    const matchCustIds = allMarks
      .filter((m) => m.markNo?.includes(q))
      .map((m) => m.customerId);
    filteredCustomers = allCustomers.filter(
      (c) => c.name?.includes(q) || matchCustIds.includes(c.id)
    );
  }

  const data = filteredCustomers.map((c) => {
    const custAgg = month
      ? billAgg.filter((r) => r.customerId === c.id && r.monthTag === month)
      : billAgg.filter((r) => r.customerId === c.id);

    const totalAmount = custAgg.reduce((s, r) => s + (r.totalAmount || 0), 0);
    const paidAmount = custAgg.reduce((s, r) => s + (r.paidAmount || 0), 0);
    const billCount = custAgg.reduce((s, r) => s + (r.billCount || 0), 0);
    const paidCount = custAgg.reduce((s, r) => s + (r.paidCount || 0), 0);
    const partialCount = custAgg.reduce((s, r) => s + (r.partialCount || 0), 0);
    const lastPaidAt = custAgg.map((r) => r.lastPaidAt).filter(Boolean).sort().reverse()[0] || null;

    return {
      customerId: c.id,
      name: c.name,
      marksCount: markCountMap.get(c.id) || 0,
      totalAmount,
      paidAmount,
      remaining: totalAmount - paidAmount,
      billCount,
      paidCount,
      partialCount,
      lastPaidAt,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">客户账期</h1>

      <form method="get" className="flex gap-2 items-end flex-wrap">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">客户名/唛头</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="搜索客户或唛头..."
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm w-48"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">月份</label>
          <select
            name="month"
            defaultValue={month}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm w-36"
          >
            <option value="">全部月份</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" size="sm">筛选</Button>
        {(q || month) && (
          <Link href="/accounts/customers">
            <Button variant="ghost" size="sm">清除</Button>
          </Link>
        )}
      </form>

      {data.map((row) => {
        const custMarks = allMarks
          .filter((m) => m.customerId === row.customerId)
          .map((m) => ({ id: m.id, markNo: m.markNo }));
        return (
          <Card key={row.customerId}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold">{row.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {row.marksCount} 个唛头 · {row.billCount} 张账单{month ? ` (${month})` : ''}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  <PaymentReceivedDialog
                    customerId={row.customerId}
                    customerName={row.name}
                    marks={custMarks}
                  />
                  {row.paidCount > 0 && <Badge className="bg-green-100 text-green-700">{row.paidCount}张已付</Badge>}
                  {row.partialCount > 0 && <Badge className="bg-orange-100 text-orange-700">{row.partialCount}张部分</Badge>}
                  {(row.billCount - row.paidCount - row.partialCount) > 0 && (
                    <Badge className="bg-red-100 text-red-700">
                      {row.billCount - row.paidCount - row.partialCount}张待付
                    </Badge>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-2 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">账单总额</p>
                  <p className="text-lg font-bold">¥{row.totalAmount.toFixed(2)}</p>
                </div>
                <div className="text-center p-2 bg-green-50 rounded">
                  <p className="text-xs text-muted-foreground">已收</p>
                  <p className="text-lg font-bold text-green-600">¥{row.paidAmount.toFixed(2)}</p>
                </div>
                <div className="text-center p-2 bg-orange-50 rounded">
                  <p className="text-xs text-muted-foreground">未收</p>
                  <p className="text-lg font-bold text-orange-600">¥{row.remaining.toFixed(2)}</p>
                </div>
                <div className="text-center p-2 bg-blue-50 rounded">
                  <p className="text-xs text-muted-foreground">最近付款</p>
                  <p className="text-sm">
                    {row.lastPaidAt ? new Date(row.lastPaidAt).toLocaleDateString('zh-CN') : '-'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {data.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">暂无匹配的客户数据</CardContent>
        </Card>
      )}
    </div>
  );
}
