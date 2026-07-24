import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { fullContainerBatches, customers, customerMetrics } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle } from 'lucide-react';
import { formatAmount } from '@/lib/format';
import { RatioInput } from './RatioInput';

export default async function RiskBoardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'operator') return <Card><CardContent className="py-8 text-center text-muted-foreground">无权限</CardContent></Card>;

  const batches = await db.select().from(fullContainerBatches).all();
  const custList = await db.select().from(customers).all();
  const custMap = new Map(custList.map(c => [c.id, c]));
  const metrics = await db.select().from(customerMetrics).all();
  const metricMap = new Map(metrics.map(m => [m.customerId, m]));

  // 按客户聚合(只整柜)
  type Agg = { custId: number; 在途柜: number; 在途货值: number; 未结柜: number; 未结运费: number };
  const byCust = new Map<number, Agg>();
  for (const b of batches) {
    const cid = b.customerId as number;
    if (!cid) continue;
    const a = byCust.get(cid) || { custId: cid, 在途柜: 0, 在途货值: 0, 未结柜: 0, 未结运费: 0 };
    const arrived = !!(b.泰国到货日期 && String(b.泰国到货日期).trim());
    const remaining = Number(b.剩余 ?? b.整柜应收 ?? 0);
    if (!arrived) { a.在途柜 += 1; a.在途货值 += Number(b.货物申报价值) || 0; }
    else if (remaining > 0.01) { a.未结柜 += 1; a.未结运费 += remaining; }
    byCust.set(cid, a);
  }

  const rows = [...byCust.values()]
    .map(a => {
      const c = custMap.get(a.custId);
      const 倍数 = Number(c?.整柜风控倍数 ?? 1);
      // 红线:未结柜数 ≤ 在途柜数 × 倍数;在途=0且未结>0直接超限
      const 上限 = a.在途柜 * 倍数;
      const 超限 = a.未结柜 > 0 && (a.在途柜 === 0 || a.未结柜 > 上限);
      const m = metricMap.get(a.custId);
      return { ...a, name: c?.name || String(a.custId), 倍数, 超限, rating: m?.overallRating || '-' };
    })
    .sort((x, y) => (y.超限 ? 1 : 0) - (x.超限 ? 1 : 0) || y.未结运费 - x.未结运费);

  const alarmCount = rows.filter(r => r.超限).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">整柜风控看板</h1>
        {alarmCount > 0
          ? <Badge className="bg-red-100 text-red-700 text-sm"><AlertTriangle className="h-4 w-4 mr-1" />{alarmCount} 个客户超风控线</Badge>
          : <Badge className="bg-green-100 text-green-700 text-sm">全部在安全线内</Badge>}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">红线 = 未结算柜数 ≤ 在途柜数 × 允许倍数（在途0柜却有未结 = 无筹码，直接超限）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>客户</TableHead><TableHead>评分</TableHead>
              <TableHead className="text-right">在途柜数</TableHead><TableHead className="text-right">在途货值</TableHead>
              <TableHead className="text-right">未结算柜数</TableHead><TableHead className="text-right">未结算运费</TableHead>
              <TableHead>允许比例(在途:未结)</TableHead><TableHead>当前</TableHead><TableHead>风控</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.custId} className={r.超限 ? 'bg-red-50' : ''}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.rating}</TableCell>
                  <TableCell className="text-right">{r.在途柜}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatAmount(r.在途货值)}</TableCell>
                  <TableCell className="text-right">{r.未结柜}</TableCell>
                  <TableCell className="text-right text-orange-600">{formatAmount(r.未结运费)}</TableCell>
                  <TableCell><RatioInput customerId={r.custId} value={r.倍数} /></TableCell>
                  <TableCell className="text-sm">{r.在途柜} : {r.未结柜}</TableCell>
                  <TableCell>{r.超限 ? <Badge className="bg-red-100 text-red-700"><AlertTriangle className="h-3.5 w-3.5 mr-1" />超限</Badge> : <Badge className="bg-green-100 text-green-700">正常</Badge>}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">暂无整柜数据</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
