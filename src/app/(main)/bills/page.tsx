import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { bills, customers, billItems } from '@/db/schema';
import { eq, desc, like, and } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import Link from 'next/link';

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const q = sp.q || '';

  let allBills;
  if (q) {
    allBills = await db.select().from(bills)
      .where(like(bills.billNo, `%${q}%`))
      .orderBy(desc(bills.createdAt)).all();
  } else {
    allBills = await db.select().from(bills).orderBy(desc(bills.createdAt)).all();
  }

  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const billItemCounts = new Map<number, number>();
  for (const b of allBills) {
    const items = await db.select().from(billItems).where(eq(billItems.billId, b.id)).all();
    billItemCounts.set(b.id, items.length);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">账单管理</h1>

      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="搜索唛头/月份..." className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm flex-1" />
        <Button type="submit" variant="outline" size="sm">搜索</Button>
        {q && <a href="/bills"><Button variant="ghost" size="sm">清除</Button></a>}
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allBills.map((b) => {
          const paid = (b as any).paidAmount || 0;
          const total = b.totalAmountCents || 0;
          const remaining = total - paid;
          const pStatus = (b as any).paymentStatus || '待付款';
          return (
            <Card key={b.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{b.billNo}</span>
                  <Badge className={b.status === '已生成' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>{b.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">客户</span><span>{customerMap.get(b.customerId) || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">日期</span><span className="text-xs">{b.createdAt?.substring(0, 10) || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">条数</span><span>{billItemCounts.get(b.id) || 0}</span></div>
                <div className="flex justify-between font-bold"><span className="text-muted-foreground">金额</span><span>¥{total.toFixed(2)}</span></div>
                {paid > 0 && <div className="flex justify-between"><span className="text-muted-foreground">已付</span><span className="text-green-600">¥{paid.toFixed(2)}</span></div>}
                {paid > 0 && remaining > 0 && <div className="flex justify-between"><span className="text-muted-foreground">剩余</span><span className="text-orange-600">¥{remaining.toFixed(2)}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">付款</span>
                  <Badge className={pStatus === '已付款' ? 'bg-green-100 text-green-700' : pStatus === '付一部分' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}>{pStatus}</Badge>
                </div>
                <div className="flex gap-2 mt-3">
                  <a href={`/api/bills/export?billId=${b.id}`} className="flex-1"><Button variant="outline" size="sm" className="w-full"><Download className="h-3.5 w-3.5 mr-1" />导出</Button></a>
                  <Link href={`/bills/${b.billNo}`} className="flex-1"><Button variant="ghost" size="sm" className="w-full">详情</Button></Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {allBills.length === 0 && <Card><CardContent className="py-8 text-center text-muted-foreground">暂无账单{q ? `，搜索 "${q}" 无结果` : ''}</CardContent></Card>}
    </div>
  );
}
