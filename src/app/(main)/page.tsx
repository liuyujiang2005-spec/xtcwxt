import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { shipments, shipmentCosts, paymentsReceived, customerMetrics, customers, paymentsMade } from '@/db/schema';
import { sql, eq, gte, desc } from 'drizzle-orm';
import { formatCents } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, Clock, HandCoins } from 'lucide-react';
import DashboardCharts from './dashboard-charts';

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getLast6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const currentMonth = getCurrentMonth();

  const monthShipments = await db.select().from(shipments).where(eq(shipments.monthTag, currentMonth)).all();
  const shipmentIds = monthShipments.map((s) => s.id);
  const allCosts = await db.select().from(shipmentCosts).all();
  const monthCosts = allCosts.filter((c) => shipmentIds.includes(c.shipmentId!));

  const monthRevenueCNY = monthShipments.filter((s) => s.currency !== 'THB').reduce((sum, s) => sum + s.totalReceivableCents, 0);
  const monthRevenueTHB = monthShipments.filter((s) => s.currency === 'THB').reduce((sum, s) => sum + s.totalReceivableCents, 0);
  const monthCostsCNY = monthCosts.filter((c) => c.currency !== 'THB').reduce((sum, c) => sum + c.amountCents, 0);
  const monthCostsTHB = monthCosts.filter((c) => c.currency === 'THB').reduce((sum, c) => sum + c.amountCents, 0);
  const monthProfitCNY = monthRevenueCNY - monthCostsCNY;
  const monthProfitTHB = monthRevenueTHB - monthCostsTHB;

  const allShipments = await db.select().from(shipments).all();
  const allPayments = await db.select().from(paymentsReceived).all();
  const allPaymentsMade = await db.select().from(paymentsMade).all();

  const receivableCNY = allShipments.filter((s) => s.status !== '已结算' && s.currency !== 'THB').reduce((sum, s) => sum + s.totalReceivableCents, 0);
  const receivableTHB = allShipments.filter((s) => s.status !== '已结算' && s.currency === 'THB').reduce((sum, s) => sum + s.totalReceivableCents, 0);
  const receivedCNY = allPayments.filter((p) => p.currency !== 'THB').reduce((sum, p) => sum + p.amountCents, 0);
  const receivedTHB = allPayments.filter((p) => p.currency === 'THB').reduce((sum, p) => sum + p.amountCents, 0);

  const payableCNY = allCosts.filter((c) => c.currency !== 'THB').reduce((sum, c) => sum + c.amountCents, 0);
  const payableTHB = allCosts.filter((c) => c.currency === 'THB').reduce((sum, c) => sum + c.amountCents, 0);
  const paidCNY = allPaymentsMade.filter((p) => p.currency !== 'THB').reduce((sum, p) => sum + p.amountCents, 0);
  const paidTHB = allPaymentsMade.filter((p) => p.currency === 'THB').reduce((sum, p) => sum + p.amountCents, 0);

  const recentPayments = await db
    .select()
    .from(paymentsReceived)
    .orderBy(desc(paymentsReceived.receivedDate))
    .limit(5)
    .all();

  const last6Months = getLast6Months();
  const monthlyData = last6Months.map((month) => {
    const monthShips = allShipments.filter((s) => s.monthTag === month);
    const monthRevCNY = monthShips.filter((s) => s.currency !== 'THB').reduce((sum, s) => sum + s.totalReceivableCents, 0);
    const monthRevTHB = monthShips.filter((s) => s.currency === 'THB').reduce((sum, s) => sum + s.totalReceivableCents, 0);
    const sIds = monthShips.map((s) => s.id);
    const monthCosts = allCosts.filter((c) => sIds.includes(c.shipmentId!));
    const monthCostCNY = monthCosts.filter((c) => c.currency !== 'THB').reduce((sum, c) => sum + c.amountCents, 0);
    const monthCostTHB = monthCosts.filter((c) => c.currency === 'THB').reduce((sum, c) => sum + c.amountCents, 0);
    return {
      month: month.substring(5) + '月',
      revenueCNY: monthRevCNY / 100,
      revenueTHB: monthRevTHB / 100,
      profitCNY: (monthRevCNY - monthCostCNY) / 100,
      profitTHB: (monthRevTHB - monthCostTHB) / 100,
    };
  });

  const topCustomers = await db
    .select()
    .from(customerMetrics)
    .orderBy(desc(customerMetrics.monthlyVolume))
    .limit(5)
    .all();

  const customerMap = new Map(
    (await db.select().from(customers).all()).map((c) => [c.id, c.name])
  );

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
            {monthRevenueTHB > 0 && (
              <div className="text-xs text-muted-foreground mt-1">THB {formatCents(monthRevenueTHB, 'THB')}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">本月支出</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCents(monthCostsCNY)}</div>
            {monthCostsTHB > 0 && (
              <div className="text-xs text-muted-foreground mt-1">THB {formatCents(monthCostsTHB, 'THB')}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">本月利润</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${monthProfitCNY >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCents(monthProfitCNY)}
            </div>
            {monthProfitTHB !== 0 && (
              <div className={`text-xs mt-1 ${monthProfitTHB >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                THB {formatCents(monthProfitTHB, 'THB')}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">待收总额</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCents(Math.max(0, receivableCNY - receivedCNY))}
            </div>
            {receivableTHB > 0 && (
              <div className="text-xs text-orange-600 mt-1">
                THB {formatCents(Math.max(0, receivableTHB - receivedTHB), 'THB')}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">待付总额</CardTitle>
            <HandCoins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCents(Math.max(0, payableCNY - paidCNY))}
            </div>
            {payableTHB > 0 && (
              <div className="text-xs text-orange-600 mt-1">
                THB {formatCents(Math.max(0, payableTHB - paidTHB), 'THB')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>近6个月营收/利润趋势</CardTitle>
          </CardHeader>
          <CardContent>
            <DashboardCharts data={monthlyData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>客户优质度 Top 5</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topCustomers.map((m) => (
                <div key={m.customerId} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{customerMap.get(m.customerId!) || '未知'}</p>
                    <p className="text-xs text-muted-foreground">
                      月均 {m.monthlyVolume?.toFixed(2) || '0'}m³
                    </p>
                  </div>
                  <span className={`text-sm font-bold px-2 py-1 rounded ${
                    m.overallRating === 'A' ? 'bg-green-100 text-green-700' :
                    m.overallRating === 'B' ? 'bg-blue-100 text-blue-700' :
                    m.overallRating === 'C' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {m.overallRating || '-'}
                  </span>
                </div>
              ))}
              {topCustomers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">暂无数据</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>近期回款记录</CardTitle>
        </CardHeader>
        <CardContent>
          {recentPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">暂无回款记录</p>
          ) : (
            <div className="space-y-2">
              {recentPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{customerMap.get(p.customerId!) || '未知'}</p>
                    <p className="text-xs text-muted-foreground">{p.receivedDate}</p>
                  </div>
                  <span className="text-sm font-medium text-green-600">{formatCents(p.amountCents, p.currency || undefined)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
