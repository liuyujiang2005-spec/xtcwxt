import { formatAmount } from '@/lib/format';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { bills, customers, billItems } from '@/db/schema';
import { eq, desc, like, and, inArray } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReceiptUploader } from './ReceiptUploader';
import { RefreshBillButton } from './RefreshBillButton';
import { Download } from 'lucide-react';
import Link from 'next/link';

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ q?: string; month?: string; tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const q = sp.q || '';
  const month = sp.month || '';
  const tab = sp.tab || 'cny';
  const isThb = tab === 'thb';

  let allBills;
  if (q && month) {
    allBills = await db.select().from(bills)
      .where(and(like(bills.billNo, `%${q}%`), eq(bills.monthTag, month)))
      .orderBy(desc(bills.createdAt)).all();
  } else if (q) {
    allBills = await db.select().from(bills)
      .where(like(bills.billNo, `%${q}%`))
      .orderBy(desc(bills.createdAt)).all();
  } else if (month) {
    allBills = await db.select().from(bills)
      .where(eq(bills.monthTag, month))
      .orderBy(desc(bills.createdAt)).all();
  } else {
    allBills = await db.select().from(bills).orderBy(desc(bills.createdAt)).all();
  }

  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const billIds = allBills.map(b => b.id);
  const billItemCounts = new Map<number, number>();
  if (billIds.length > 0) {
    const allBillItems = await db.select().from(billItems).where(inArray(billItems.billId, billIds)).all();
    for (const bi of allBillItems) {
      billItemCounts.set(bi.billId, (billItemCounts.get(bi.billId) || 0) + 1);
    }
  }

  const filteredBills = allBills.filter(b => isThb ? (b as any).currency === 'THB' : (b as any).currency !== 'THB');
  const availableMonths = [...new Set(allBills.map(b => b.monthTag))].sort().reverse();

  const cnyCount = allBills.filter(b => (b as any).currency !== 'THB').length;
  const thbCount = allBills.filter(b => (b as any).currency === 'THB').length;

  // Group by month
  const byMonth = new Map<string, typeof filteredBills>();
  for (const b of filteredBills) {
    const m = b.monthTag || '';
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(b);
  }
  const sortedMonths = [...byMonth.keys()].sort().reverse();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">账单管理</h1>

      <form method="get" className="flex gap-2 items-end flex-wrap">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">唛头/单号</label>
          <input name="q" defaultValue={q} placeholder="搜索唛头或单号..." className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm w-48" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">月份</label>
          <select name="month" defaultValue={month} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm w-36">
            <option value="">全部月份</option>
            {availableMonths.map(m => (<option key={m} value={m}>{m}</option>))}
          </select>
        </div>
        <Button type="submit" variant="outline" size="sm">搜索</Button>
        {(q || month) && <Link href="/bills"><Button variant="ghost" size="sm">清除</Button></Link>}
        <div className="h-8 w-px bg-border mx-1" />
        <Link href={`/bills?q=${q}&month=${month}&tab=cny`}><Button variant={!isThb ? 'default' : 'outline'} size="sm">人民币{cnyCount > 0 ? ` (${cnyCount})` : ''}</Button></Link>
        <Link href={`/bills?q=${q}&month=${month}&tab=thb`}><Button variant={isThb ? 'default' : 'outline'} size="sm">泰铢{thbCount > 0 ? ` (${thbCount})` : ''}</Button></Link>
      </form>

      {sortedMonths.map(m => {
        const monthBills = byMonth.get(m)!;
        return (
          <div key={m}>
            <h2 className="text-lg font-bold mb-2">{m} ({monthBills.length} 张)</h2>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>单号</TableHead>
                      <TableHead>客户</TableHead>
                      <TableHead>币种</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                      <TableHead className="text-right">已付</TableHead>
                      <TableHead className="text-right">剩余</TableHead>
                      <TableHead className="text-right">明细</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthBills.map(b => {
                      const paid = (b as any).paidAmount || 0;
                      const total = b.totalAmount || 0;
                      const remaining = total - paid;
                      const pStatus = (b as any).paymentStatus || '待付款';
                      const custName = customerMap.get(b.customerId) || '-';
                      const cur = (b as any).currency || 'CNY';
                      const isThbCur = cur === 'THB';
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-mono text-xs">{b.billNo}</TableCell>
                          <TableCell className="text-sm">{custName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={isThbCur ? 'text-orange-600 text-xs' : 'text-xs'}>{cur}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm font-bold">
                            {isThbCur ? formatAmount(total, 'THB') : formatAmount(total)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-green-600">
                            {paid > 0 ? (isThbCur ? formatAmount(paid, 'THB') : formatAmount(paid)) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-sm text-orange-600">
                            {remaining > 0 ? (isThbCur ? formatAmount(remaining, 'THB') : formatAmount(remaining)) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-sm">{billItemCounts.get(b.id) || 0}</TableCell>
                          <TableCell>
                            <Badge className={pStatus === '已付款' ? 'bg-green-100 text-green-700 text-xs' : pStatus === '付一部分' ? 'bg-orange-100 text-orange-700 text-xs' : 'bg-red-100 text-red-700 text-xs'}>{pStatus}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <a href={`/api/bills/export?billId=${b.id}`}><Button variant="ghost" size="sm"><Download className="h-3.5 w-3.5" /></Button></a>
                              <ReceiptUploader apiPath="/api/bills" entityId={b.id} currentUrl={(b as any).receiptUrl} updateField="receiptUrl" />
                              <RefreshBillButton billId={b.id} />
                              <Link href={`/bills/${b.billNo}`}><Button variant="ghost" size="sm">详情</Button></Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        );
      })}

      {filteredBills.length === 0 && <Card><CardContent className="py-8 text-center text-muted-foreground">暂无账单{q || month ? '，无匹配结果' : ''}</CardContent></Card>}
    </div>
  );
}
