import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { directIncome, expenses, paymentsReceived, paymentsMade, customerMetrics, customers } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { formatCents } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, Clock, HandCoins } from 'lucide-react';

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

  const monthRevenueCNY = allIncome
    .filter((i) => i.incomeDate?.startsWith(currentMonth) && i.currency !== 'THB')
    .reduce((s, i) => s + i.amountCents, 0);
  const monthRevenueTHB = allIncome
    .filter((i) => i.incomeDate?.startsWith(currentMonth) && i.currency === 'THB')
    .reduce((s, i) => s + i.amountCents, 0);

  const monthCostCNY = allExpenses.filter((e) => e.currency !== 'THB' && e.paidDate?.startsWith(currentMonth)).reduce((s, e) => s + e.amountCents, 0);
  const monthCostTHB = allExpenses.filter((e) => e.currency === 'THB' && e.paidDate?.startsWith(currentMonth)).reduce((s, e) => s + e.amountCents, 0);

  const profitCNY = monthRevenueCNY - monthCostCNY;
  const profitTHB = monthRevenueTHB - monthCostTHB;

  const pendingExpenses = allExpenses.filter((e) => e.status === '待支付');
  const pendingPayableCNY = pendingExpenses.filter((e) => e.currency !== 'THB').reduce((s, e) => s + e.amountCents, 0);
  const pendingPayableTHB = pendingExpenses.filter((e) => e.currency === 'THB').reduce((s, e) => s + e.amountCents, 0);

  const paidCNY = allPaid.filter((p) => p.currency !== 'THB').reduce((s, p) => s + p.amountCents, 0);
  const paidTHB = allPaid.filter((p) => p.currency === 'THB').reduce((s, p) => s + p.amountCents, 0);

  const totalRevenue = allIncome.reduce((s, i) => s + i.amountCents, 0);
  const totalReceived = allReceived.reduce((s, p) => s + p.amountCents, 0);

  const topCustomers = await db.select().from(customerMetrics).orderBy(desc(customerMetrics.monthlyVolume)).limit(5).all();
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">仪表盘</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">本月营收</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCents(monthRevenueCNY)}</div>
            {monthRevenueTHB > 0 && <div className="text-xs text-muted-foreground mt-1">THB {formatCents(monthRevenueTHB, 'THB')}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">本月支出</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCents(monthCostCNY)}</div>
            {monthCostTHB > 0 && <div className="text-xs text-muted-foreground mt-1">THB {formatCents(monthCostTHB, 'THB')}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">本月利润</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${profitCNY >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCents(profitCNY)}</div>
            {profitTHB !== 0 && <div className={`text-xs mt-1 ${profitTHB >= 0 ? 'text-green-600' : 'text-red-600'}`}>THB {formatCents(profitTHB, 'THB')}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">待收总额</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCents(Math.max(0, totalRevenue - totalReceived))}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">待付总额</CardTitle>
            <HandCoins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCents(pendingPayableCNY)}</div>
            {pendingPayableTHB > 0 && <div className="text-xs text-orange-600 mt-1">THB {formatCents(pendingPayableTHB, 'THB')}</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>客户优质度 Top 5</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topCustomers.map((m) => (
              <div key={m.customerId} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{customerMap.get(m.customerId!) || '未知'}</p>
                  <p className="text-xs text-muted-foreground">月均 {m.monthlyVolume?.toFixed(2) || '0'}m³</p>
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
