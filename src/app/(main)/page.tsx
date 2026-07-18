import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { directIncome, expenses, paymentsReceived, paymentsMade, customerMetrics, customers, sharedContainerItems, loadingItems } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { formatAmount } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Clock, HandCoins } from 'lucide-react';

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const currentMonth = getCurrentMonth();

  const allIncome = await db.select().from(directIncome).all();
  const allExpenses = await db.select().from(expenses).all();
  const allReceived = await db.select().from(paymentsReceived).all();
  const allPaid = await db.select().from(paymentsMade).all();
  const allScItems = await db.select().from(sharedContainerItems).all();
  const allLdItems = await db.select().from(loadingItems).all();
  const allCustomers = await db.select().from(customers).all();
  const custCurrencyMap = new Map(allCustomers.map(c => [c.id, c.defaultCurrency || 'CNY']));

  const monthRevenueCNY = allIncome
    .filter((i) => i.incomeDate?.startsWith(currentMonth) && i.currency !== 'THB')
    .reduce((s, i) => s + i.amount, 0)
    + allScItems.filter((i) => i.createdAt?.startsWith(currentMonth) && custCurrencyMap.get(i.customerId) !== 'THB').reduce((s, i) => s + (i.客户应收 || 0), 0)
    + allLdItems.filter((i) => i.createdAt?.startsWith(currentMonth) && custCurrencyMap.get(i.customerId) !== 'THB').reduce((s, i) => s + (i.客户应收 || 0), 0);
  const monthRevenueTHB = allIncome
    .filter((i) => i.incomeDate?.startsWith(currentMonth) && i.currency === 'THB')
    .reduce((s, i) => s + i.amount, 0)
    + allScItems.filter((i) => i.createdAt?.startsWith(currentMonth) && custCurrencyMap.get(i.customerId) === 'THB').reduce((s, i) => s + (i.客户应收 || 0), 0)
    + allLdItems.filter((i) => i.createdAt?.startsWith(currentMonth) && custCurrencyMap.get(i.customerId) === 'THB').reduce((s, i) => s + (i.客户应收 || 0), 0);

  const monthCostCNY = allExpenses.filter((e) => e.currency !== 'THB' && e.createdAt?.startsWith(currentMonth)).reduce((s, e) => s + e.amount, 0)
    + allScItems.filter((i) => i.createdAt?.startsWith(currentMonth)).reduce((s, i) => s + (i.需支付总价 || 0), 0)
    + allLdItems.filter((i) => i.createdAt?.startsWith(currentMonth)).reduce((s, i) => s + (i.需支付总价 || 0), 0);
  const monthCostTHB = allExpenses.filter((e) => e.currency === 'THB' && e.createdAt?.startsWith(currentMonth)).reduce((s, e) => s + e.amount, 0);

  const pendingExpenses = allExpenses.filter((e) => e.status === '待支付');
  const pendingPayableCNY = pendingExpenses.filter((e) => e.currency !== 'THB').reduce((s, e) => s + e.amount, 0);
  const pendingPayableTHB = pendingExpenses.filter((e) => e.currency === 'THB').reduce((s, e) => s + e.amount, 0);

  const paidCNY = allPaid.filter((p) => p.currency !== 'THB').reduce((s, p) => s + p.amount, 0);
  const paidTHB = allPaid.filter((p) => p.currency === 'THB').reduce((s, p) => s + p.amount, 0);

  const totalRevenue = allIncome.reduce((s, i) => s + i.amount, 0);
  const totalReceived = allReceived.reduce((s, p) => s + p.amount, 0);
  const totalRevenueTHB = allIncome.filter(i => i.currency === 'THB').reduce((s, i) => s + i.amount, 0);
  const totalReceivedTHB = allReceived.filter(p => p.currency === 'THB').reduce((s, p) => s + p.amount, 0);
  const totalRevenueCNY = allIncome.filter(i => i.currency !== 'THB').reduce((s, i) => s + i.amount, 0);
  const totalReceivedCNY = allReceived.filter(p => p.currency !== 'THB').reduce((s, p) => s + p.amount, 0);

  const topCustomers = await db.select().from(customerMetrics).orderBy(desc(customerMetrics.monthlyVolume)).limit(5).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const pendingReceivableCNY = Math.max(0, totalRevenueCNY - totalReceivedCNY);
  const pendingReceivableTHB = Math.max(0, totalRevenueTHB - totalReceivedTHB);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">仪表盘</h1>

      {/* 人民币区块 */}
      <div className="border rounded-lg p-4 space-y-4">
        <p className="text-sm font-bold">人民币</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">本月营收</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatAmount(monthRevenueCNY)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">本月支出</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatAmount(monthCostCNY)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">待收</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatAmount(pendingReceivableCNY)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">待付</CardTitle>
              <HandCoins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatAmount(pendingPayableCNY)}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 泰铢区块 */}
      <div className="border rounded-lg p-4 space-y-4">
        <p className="text-sm font-bold text-orange-600">泰铢</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-orange-600">本月营收</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{formatAmount(monthRevenueTHB, 'THB')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-orange-600">本月支出</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{formatAmount(monthCostTHB, 'THB')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-orange-600">待收</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{formatAmount(pendingReceivableTHB, 'THB')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-orange-600">待付</CardTitle>
              <HandCoins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{formatAmount(pendingPayableTHB, 'THB')}</div>
            </CardContent>
          </Card>
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
