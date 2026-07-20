import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { directIncome, customers } from '@/db/schema';
import { desc } from 'drizzle-orm';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NewIncomeDialog } from './NewIncomeDialog';
import { DeleteIncomeButton } from './DeleteIncomeButton';
import { EditIncomeDialog } from './EditIncomeDialog';
import { formatAmount } from '@/lib/format';

export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const month = sp.month || '';

  const allIncomeRaw = await db.select().from(directIncome).orderBy(desc(directIncome.incomeDate)).all();
  const availableMonths = [...new Set(allIncomeRaw.map(i => (i.incomeDate || '').substring(0, 7)))].filter(Boolean).sort().reverse();
  const allIncome = month ? allIncomeRaw.filter(i => (i.incomeDate || '').startsWith(month)) : allIncomeRaw;
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const cnyIncome = allIncome.filter(i => i.currency !== 'THB');
  const thbIncome = allIncome.filter(i => i.currency === 'THB');

  const thbSummary = new Map();
  thbIncome.forEach((i) => {
    const e = thbSummary.get(i.customerId) || { THB: 0, count: 0 };
    e.count++;
    e.THB += i.amount;
    thbSummary.set(i.customerId, e);
  });

  const summary = new Map();
  allIncome.forEach((i) => {
    const e = summary.get(i.customerId) || { CNY: 0, THB: 0, count: 0 };
    e.count++;
    if (i.currency === 'THB') e.THB += i.amount;
    else e.CNY += i.amount;
    summary.set(i.customerId, e);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">收入总表</h1>
        <NewIncomeDialog />
      </div>
      <form method="get" className="flex gap-2 items-end flex-wrap">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">月份</label>
          <select name="month" defaultValue={month} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm w-36">
            <option value="">全部月份</option>
            {availableMonths.map(m => (<option key={m} value={m}>{m}</option>))}
          </select>
        </div>
        <Button type="submit" variant="outline" size="sm">筛选</Button>
        {month && <Link href="/revenue"><Button variant="ghost" size="sm">清除</Button></Link>}
      </form>

      <h2 className="text-lg font-bold">人民币收入</h2>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">明细（{cnyIncome.length} 条）</h2></div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead>币种</TableHead>
                <TableHead>仓库</TableHead>
                <TableHead className="text-right">体积</TableHead>
                <TableHead>日期</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cnyIncome.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{customerMap.get(i.customerId) || '-'}</TableCell>
                  <TableCell className="text-right">{formatAmount(i.amount)}</TableCell>
                  <TableCell>{i.currency}</TableCell>
                  <TableCell className="text-sm">{(i as any).仓库 || '-'}</TableCell>
                  <TableCell className="text-right">{i.volume ? i.volume.toFixed(6) + 'm³' : '-'}</TableCell>
                  <TableCell className="text-sm">{i.incomeDate}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{i.remark || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <EditIncomeDialog income={i} />
                      <DeleteIncomeButton incomeId={i.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {cnyIncome.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">暂无收入记录</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">按客户汇总</h2></div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户</TableHead>
                <TableHead className="text-right">笔数</TableHead>
                <TableHead className="text-right">CNY</TableHead>
                <TableHead className="text-right">THB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from(summary.entries()).map(([cid, v]) => (
                <TableRow key={cid}>
                  <TableCell className="font-medium">{customerMap.get(cid) || '-'}</TableCell>
                  <TableCell className="text-right">{v.count}</TableCell>
                  <TableCell className="text-right">{formatAmount(v.CNY)}</TableCell>
                  <TableCell className="text-right">{formatAmount(v.THB, 'THB')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

              <h2 className="text-lg font-bold mt-4 text-orange-600">泰铢收入</h2>
          <Card>
            <div className="p-4 border-b"><h2 className="font-semibold">明细（{thbIncome.length} 条）</h2></div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>客户</TableHead>
                    <TableHead className="text-right">金额</TableHead>
                    <TableHead>币种</TableHead>
                    <TableHead>仓库</TableHead>
                    <TableHead className="text-right">体积</TableHead>
                    <TableHead>日期</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {thbIncome.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{customerMap.get(i.customerId) || '-'}</TableCell>
                      <TableCell className="text-right">{formatAmount(i.amount, 'THB')}</TableCell>
                      <TableCell>{i.currency}</TableCell>
                      <TableCell className="text-sm">{(i as any).仓库 || '-'}</TableCell>
                      <TableCell className="text-right">{i.volume ? i.volume.toFixed(6) + 'm³' : '-'}</TableCell>
                      <TableCell className="text-sm">{i.incomeDate}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{i.remark || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <EditIncomeDialog income={i} />
                          <DeleteIncomeButton incomeId={i.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      );
}