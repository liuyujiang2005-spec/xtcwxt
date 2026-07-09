import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { customers, bills, marks, sharedContainerItems, loadingItems } from '@/db/schema';
import { eq, like, and } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PaymentReceivedDialog } from './PaymentReceivedDialog';

export default async function CustomerAccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; month?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const q = sp.q || '';
  const month = sp.month || '';

  const allCustomers = await db.select().from(customers).all();
  const allBills = await db.select().from(bills).all();
  const allMarks = await db.select().from(marks).all();
  const allScItems = await db.select().from(sharedContainerItems).all();
  const allLdItems = await db.select().from(loadingItems).all();

  const volumeByCustomer = new Map<number, number>();
  allScItems.forEach((i) => volumeByCustomer.set(i.customerId, (volumeByCustomer.get(i.customerId) || 0) + (i.总体积 || 0)));
  allLdItems.forEach((i) => volumeByCustomer.set(i.customerId, (volumeByCustomer.get(i.customerId) || 0) + (i.总体积 || 0)));

  const availableMonths = [...new Set(allBills.map(b => b.monthTag))].sort().reverse();

  let filteredCustomers = allCustomers;
  if (q) {
    const markMatches = allMarks.filter(m => m.markNo?.includes(q) ?? false).map(m => m.customerId);
    filteredCustomers = allCustomers.filter(c =>
      (c.name?.includes(q) ?? false) || markMatches.includes(c.id)
    );
  }

  const data = filteredCustomers.map((c) => {
    const custMarks = allMarks.filter((m) => m.customerId === c.id);
    const custBills = allBills.filter((b) => b.customerId === c.id);
    const monthBills = month ? custBills.filter(b => b.monthTag === month) : custBills;

    const totalAmount = monthBills.reduce((s, b) => s + (b.totalAmountCents || 0), 0);
    const paidAmount = monthBills.reduce((s, b) => s + ((b as any).paidAmount || 0), 0);
    const paidBills = monthBills.filter(b => (b as any).paymentStatus === '已付款');
    const partialBills = monthBills.filter(b => (b as any).paymentStatus === '付一部分');
    const lastPaidAt = [...custBills.map(b => (b as any).paidAt)].filter(Boolean).sort().reverse()[0] || null;

    return {
      customerId: c.id,
      name: c.name,
      marksCount: custMarks.length,
      totalAmount,
      paidAmount,
      remaining: totalAmount - paidAmount,
      billCount: monthBills.length,
      paidCount: paidBills.length,
      partialCount: partialBills.length,
      lastPaidAt,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">客户账期</h1>

      <form method="get" className="flex gap-2 items-end flex-wrap">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">客户名/唛头</label>
          <input name="q" defaultValue={q} placeholder="搜索客户或唛头..." className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm w-48" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">月份</label>
          <select name="month" defaultValue={month} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm w-36">
            <option value="">全部月份</option>
            {availableMonths.map(m => (<option key={m} value={m}>{m}</option>))}
          </select>
        </div>
        <Button type="submit" variant="outline" size="sm">筛选</Button>
        {(q || month) && <Link href="/accounts/customers"><Button variant="ghost" size="sm">清除</Button></Link>}
      </form>

      {data.map((row) => {
        const custMarks = allMarks.filter(m => m.customerId === row.customerId).map(m => ({ id: m.id, markNo: m.markNo }));
        return (
        <Card key={row.customerId}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold">{row.name}</h3>
                <p className="text-xs text-muted-foreground">{row.marksCount} 个唛头 · {row.billCount} 张账单{month ? ` (${month})` : ''}</p>
              </div>
              <div className="flex gap-2 items-center">
                <PaymentReceivedDialog customerId={row.customerId} customerName={row.name} marks={custMarks} />
                {row.paidCount > 0 && <Badge className="bg-green-100 text-green-700">{row.paidCount}张已付</Badge>}
                {row.partialCount > 0 && <Badge className="bg-orange-100 text-orange-700">{row.partialCount}张部分</Badge>}
                {(row.billCount - row.paidCount - row.partialCount) > 0 && <Badge className="bg-red-100 text-red-700">{row.billCount - row.paidCount - row.partialCount}张待付</Badge>}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-2 bg-muted rounded">
                <p className="text-xs text-muted-foreground">账单总额</p>
                <p className="text-lg font-bold">¥{row.totalAmount.toFixed(6)}</p>
              </div>
              <div className="text-center p-2 bg-green-50 rounded">
                <p className="text-xs text-muted-foreground">已收</p>
                <p className="text-lg font-bold text-green-600">¥{row.paidAmount.toFixed(6)}</p>
              </div>
              <div className="text-center p-2 bg-orange-50 rounded">
                <p className="text-xs text-muted-foreground">未收</p>
                <p className="text-lg font-bold text-orange-600">¥{row.remaining.toFixed(6)}</p>
              </div>
              <div className="text-center p-2 bg-blue-50 rounded">
                <p className="text-xs text-muted-foreground">最近付款</p>
                <p className="text-sm">{row.lastPaidAt ? new Date(row.lastPaidAt).toLocaleDateString('zh-CN') : '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        );
      })}
      {data.length === 0 && <Card><CardContent className="py-8 text-center text-muted-foreground">暂无匹配的客户数据</CardContent></Card>}
    </div>
  );
}
