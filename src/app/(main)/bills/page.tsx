import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { bills, customers, billItems } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import BillDownloadCard from './bill-download-card';
import BillGenerateCard from './bill-generate-card';
import Link from 'next/link';

export default async function BillsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allBills = await db.select().from(bills).orderBy(desc(bills.createdAt)).all();
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const billItemCounts = new Map<number, number>();
  for (const b of allBills) {
    const items = await db.select().from(billItems).where(eq(billItems.billId, b.id)).all();
    billItemCounts.set(b.id, items.length);
  }

  const exportBill = (billId: number) => `/api/bills/export?billId=${billId}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">账单管理</h1>
      <BillDownloadCard />
      <BillGenerateCard />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allBills.map((b) => (
          <Card key={b.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{b.billNo}</span>
                <Badge className={b.status === '已生成' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>{b.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">客户</span>
                <span>{customerMap.get(b.customerId) || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">日期</span>
                <span className="text-xs">{b.createdAt?.substring(0, 10) || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">条数</span>
                <span>{billItemCounts.get(b.id) || 0}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-muted-foreground">金额</span>
                <span>¥{(b.totalAmountCents || 0).toFixed(2)}</span>
              </div>
              <div className="flex gap-2 mt-3">
                <a href={exportBill(b.id)} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full"><Download className="h-3.5 w-3.5 mr-1" />导出</Button>
                </a>
                <Link href={`/marks/${b.id}`} className="flex-1">
                  <Button variant="ghost" size="sm" className="w-full">详情</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {allBills.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无账单</CardContent></Card>
      )}
    </div>
  );
}
