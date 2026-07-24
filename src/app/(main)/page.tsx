import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { directIncome, expenses, paymentsReceived, paymentsMade, customerMetrics, customers, sharedContainerItems, loadingItems, marks, sharedContainerBatches, loadingBatches, bills, billItems, fullContainerBatches, fullContainerItems } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { formatAmount } from '@/lib/format';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Clock, HandCoins, Wallet } from 'lucide-react';

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const currentMonth = sp.month || getCurrentMonth(); // 选定月份，默认当月

  const allIncome = await db.select().from(directIncome).all();
  const allExpenses = await db.select().from(expenses).all();
  const allReceived = await db.select().from(paymentsReceived).all();
  const allPaid = await db.select().from(paymentsMade).all();
  const allScItems = await db.select().from(sharedContainerItems).all();
  const allLdItems = await db.select().from(loadingItems).all();
  const allCustomers = await db.select().from(customers).all();
  const custCurrencyMap = new Map(allCustomers.map(c => [c.id, c.defaultCurrency || 'CNY']));

  // 整柜(FCL)：应收/已收/剩余进收入口径，货款进支出，与拼柜/装柜对称。归月按柜 month_tag，币种按柜 currency，全部柜都算(无待审核流程)
  const allFcBatches = await db.select().from(fullContainerBatches).all();
  const allFcItems = await db.select().from(fullContainerItems).all();
  const fcBatchMonth = new Map(allFcBatches.map(b => [b.id, b.monthTag]));
  const fcIsTHB = (b: typeof allFcBatches[number]) => (b.currency || 'CNY') === 'THB';

  // 营收/成本按"业务月份"(唛头 monthTag)归月，且只统计已确认(非待审核)的批次
  const allMarks = await db.select().from(marks).all();
  const markMonthMap = new Map(allMarks.map(m => [m.id, m.monthTag]));
  const availableMonths = [...new Set([
    ...allMarks.map(m => m.monthTag),
    ...allIncome.map(i => (i.incomeDate || '').substring(0, 7)),
    ...allExpenses.map(e => (e.createdAt || '').substring(0, 7)),
    ...allFcBatches.map(b => b.monthTag || ''),
  ])].filter(Boolean).sort().reverse();
  const allScBatches = await db.select().from(sharedContainerBatches).all();
  const allLdBatches = await db.select().from(loadingBatches).all();
  const scBatchOk = new Map(allScBatches.map(b => [b.id, b.status !== '待审核']));
  const ldBatchOk = new Map(allLdBatches.map(b => [b.id, b.status !== '待审核']));
  const scConfirmed = allScItems.filter(i => scBatchOk.get(i.batchId) === true); // 已确认拼柜明细
  const ldConfirmed = allLdItems.filter(i => ldBatchOk.get(i.batchId) === true); // 已确认装柜明细
  const isCNY = (cid: number) => custCurrencyMap.get(cid) !== 'THB';
  const inMonth = (markId: number) => markMonthMap.get(markId) === currentMonth; // 按业务月份

  // 账单覆盖：已生成账单的唛头，应收用账单值(可能被手动调整过)；未生成账单的用系统算的
  const allBills = await db.select().from(bills).all();
  const billById = new Map(allBills.map(b => [b.id, b]));
  const allBillItems = await db.select().from(billItems).all();
  const billByMark = new Map<number, { amount: number; isCNY: boolean; monthTag: string }>();
  for (const bi of allBillItems) {
    const b = billById.get(bi.billId);
    if (!b) continue;
    const prev = billByMark.get(bi.markId);
    if (prev) prev.amount += Number(bi.amount) || 0;
    else billByMark.set(bi.markId, { amount: Number(bi.amount) || 0, isCNY: (b.currency || 'CNY') !== 'THB', monthTag: b.monthTag });
  }
  const isBilled = (mid: number) => billByMark.has(mid);
  // 账单应收合计(billed marks)：cny=是否人民币, month=null 表示全部月份
  const billedRecv = (cny: boolean, month: string | null) =>
    [...billByMark.values()].filter(v => v.isCNY === cny && (month ? v.monthTag === month : true)).reduce((s, v) => s + v.amount, 0);

  const monthRevenueCNY = allIncome
    .filter((i) => i.incomeDate?.startsWith(currentMonth) && i.currency !== 'THB')
    .reduce((s, i) => s + i.amount, 0)
    + scConfirmed.filter((i) => inMonth(i.markId) && isCNY(i.customerId) && !isBilled(i.markId)).reduce((s, i) => s + (Number(i.客户应收) || 0), 0)
    + ldConfirmed.filter((i) => inMonth(i.markId) && isCNY(i.customerId) && !isBilled(i.markId)).reduce((s, i) => s + (Number(i.客户应收) || 0), 0)
    + allFcBatches.filter((b) => b.monthTag === currentMonth && !fcIsTHB(b)).reduce((s, b) => s + (Number(b.整柜应收) || 0), 0)
    + billedRecv(true, currentMonth);
  const monthRevenueTHB = allIncome
    .filter((i) => i.incomeDate?.startsWith(currentMonth) && i.currency === 'THB')
    .reduce((s, i) => s + i.amount, 0)
    + scConfirmed.filter((i) => inMonth(i.markId) && !isCNY(i.customerId) && !isBilled(i.markId)).reduce((s, i) => s + (Number(i.客户应收) || 0), 0)
    + ldConfirmed.filter((i) => inMonth(i.markId) && !isCNY(i.customerId) && !isBilled(i.markId)).reduce((s, i) => s + (Number(i.客户应收) || 0), 0)
    + allFcBatches.filter((b) => b.monthTag === currentMonth && fcIsTHB(b)).reduce((s, b) => s + (Number(b.整柜应收) || 0), 0)
    + billedRecv(false, currentMonth);

  const monthCostCNY = allExpenses.filter((e) => e.currency !== 'THB' && e.createdAt?.startsWith(currentMonth)).reduce((s, e) => s + e.amount, 0)
    + scConfirmed.filter((i) => inMonth(i.markId)).reduce((s, i) => s + (i.需支付总价 || 0), 0)
    + ldConfirmed.filter((i) => inMonth(i.markId)).reduce((s, i) => s + (i.需支付总价 || 0), 0)
    + allFcItems.filter((i) => fcBatchMonth.get(i.batchId) === currentMonth).reduce((s, i) => s + (Number(i.需支付总价) || 0), 0);
  const monthCostTHB = allExpenses.filter((e) => e.currency === 'THB' && e.createdAt?.startsWith(currentMonth)).reduce((s, e) => s + e.amount, 0);

  const pendingExpenses = allExpenses.filter((e) => e.status === '待支付');
  const pendingPayableCNY = pendingExpenses.filter((e) => e.currency !== 'THB').reduce((s, e) => s + e.amount, 0);
  const pendingPayableTHB = pendingExpenses.filter((e) => e.currency === 'THB').reduce((s, e) => s + e.amount, 0);

  const paidCNY = allPaid.filter((p) => p.currency !== 'THB').reduce((s, p) => s + p.amount, 0);
  const paidTHB = allPaid.filter((p) => p.currency === 'THB').reduce((s, p) => s + p.amount, 0);

  // 待收基于全部已确认应收(不分月)，待审核批次不计入；已生成账单的唛头用账单值
  const totalRevenueCNY = allIncome.filter(i => i.currency !== 'THB').reduce((s, i) => s + i.amount, 0)
    + scConfirmed.filter(i => isCNY(i.customerId) && !isBilled(i.markId)).reduce((s, i) => s + (Number(i.客户应收) || 0), 0)
    + ldConfirmed.filter(i => isCNY(i.customerId) && !isBilled(i.markId)).reduce((s, i) => s + (Number(i.客户应收) || 0), 0)
    + allFcBatches.filter(b => !fcIsTHB(b)).reduce((s, b) => s + (Number(b.整柜应收) || 0), 0)
    + billedRecv(true, null);
  const totalReceivedCNY = allReceived.filter(p => p.currency !== 'THB').reduce((s, p) => s + p.amount, 0)
    + allFcBatches.filter(b => !fcIsTHB(b)).reduce((s, b) => s + (Number(b.已付) || 0), 0);
  const totalRevenueTHB = allIncome.filter(i => i.currency === 'THB').reduce((s, i) => s + i.amount, 0)
    + scConfirmed.filter(i => !isCNY(i.customerId) && !isBilled(i.markId)).reduce((s, i) => s + (Number(i.客户应收) || 0), 0)
    + ldConfirmed.filter(i => !isCNY(i.customerId) && !isBilled(i.markId)).reduce((s, i) => s + (Number(i.客户应收) || 0), 0)
    + allFcBatches.filter(b => fcIsTHB(b)).reduce((s, b) => s + (Number(b.整柜应收) || 0), 0)
    + billedRecv(false, null);
  const totalReceivedTHB = allReceived.filter(p => p.currency === 'THB').reduce((s, p) => s + p.amount, 0)
    + allFcBatches.filter(b => fcIsTHB(b)).reduce((s, b) => s + (Number(b.已付) || 0), 0);

  const topCustomers = await db.select().from(customerMetrics).orderBy(desc(customerMetrics.monthlyVolume)).limit(5).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const pendingReceivableCNY = Math.max(0, totalRevenueCNY - totalReceivedCNY);
  const pendingReceivableTHB = Math.max(0, totalRevenueTHB - totalReceivedTHB);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <form method="get" className="flex gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">月份</label>
            <select name="month" defaultValue={currentMonth} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm w-36">
              {availableMonths.map(m => (<option key={m} value={m}>{m}</option>))}
            </select>
          </div>
          <Button type="submit" variant="outline" size="sm">查看</Button>
        </form>
      </div>

      {/* 累计总额(不分月) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">累计总营收（人民币）</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatAmount(totalRevenueCNY)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-orange-600">累计总营收（泰铢）</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-orange-600">{formatAmount(totalRevenueTHB, 'THB')}</div></CardContent>
        </Card>
      </div>

      {/* 人民币区块 */}
      <div className="border rounded-lg p-4 space-y-4">
        <p className="text-sm font-bold">人民币</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Link href={`/bills?month=${currentMonth}&tab=cny`} className="block">
            <Card className="h-full hover:border-primary transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">本月营收</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatAmount(monthRevenueCNY)}</div>
                <p className="text-xs text-muted-foreground mt-1">查看账单明细 ›</p>
              </CardContent>
            </Card>
          </Link>
          <Link href={`/expenses?month=${currentMonth}`} className="block">
            <Card className="h-full hover:border-primary transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">本月支出</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatAmount(monthCostCNY)}</div>
                <p className="text-xs text-muted-foreground mt-1">查看支出明细 ›</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/accounts/customers" className="block">
            <Card className="h-full hover:border-primary transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">待收</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatAmount(pendingReceivableCNY)}</div>
                <p className="text-xs text-muted-foreground mt-1">谁欠钱/谁付了 ›</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/expenses" className="block">
            <Card className="h-full hover:border-primary transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">待付</CardTitle>
                <HandCoins className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatAmount(pendingPayableCNY)}</div>
                <p className="text-xs text-muted-foreground mt-1">要付的钱明细 ›</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* 泰铢区块 */}
      <div className="border rounded-lg p-4 space-y-4">
        <p className="text-sm font-bold text-orange-600">泰铢</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Link href={`/bills?month=${currentMonth}&tab=thb`} className="block">
            <Card className="h-full hover:border-primary transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-orange-600">本月营收</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{formatAmount(monthRevenueTHB, 'THB')}</div>
                <p className="text-xs text-muted-foreground mt-1">查看账单明细 ›</p>
              </CardContent>
            </Card>
          </Link>
          <Link href={`/expenses?month=${currentMonth}`} className="block">
            <Card className="h-full hover:border-primary transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-orange-600">本月支出</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{formatAmount(monthCostTHB, 'THB')}</div>
                <p className="text-xs text-muted-foreground mt-1">查看支出明细 ›</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/accounts/customers" className="block">
            <Card className="h-full hover:border-primary transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-orange-600">待收</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{formatAmount(pendingReceivableTHB, 'THB')}</div>
                <p className="text-xs text-muted-foreground mt-1">谁欠钱/谁付了 ›</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/expenses" className="block">
            <Card className="h-full hover:border-primary transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-orange-600">待付</CardTitle>
                <HandCoins className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{formatAmount(pendingPayableTHB, 'THB')}</div>
                <p className="text-xs text-muted-foreground mt-1">要付的钱明细 ›</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>客户优质度 Top 5</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topCustomers.map((m) => (
              <div key={m.customerId} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{customerMap.get(m.customerId!) || '未知'}</p>
                  <p className="text-xs text-muted-foreground">月均 {m.monthlyVolume?.toFixed(6) || '0'}m³</p>
                </div>
                <span className={`text-sm font-bold px-2 py-1 rounded ${
                  m.overallRating === 'A' ? 'bg-green-100 text-green-700' :
                  m.overallRating === 'B' ? 'bg-blue-100 text-blue-700' :
                  m.overallRating === 'C' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>{m.overallRating || '-'}</span>
              </div>
            ))}
            {topCustomers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">暂无数据</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
