import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { shipments, customers, shipmentCosts } from '@/db/schema';
import { eq, like, desc } from 'drizzle-orm';
import { formatCents } from '@/lib/format';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Eye } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  '运输中': 'bg-blue-100 text-blue-700',
  '已到仓': 'bg-yellow-100 text-yellow-700',
  '已签收': 'bg-green-100 text-green-700',
  '已结算': 'bg-gray-100 text-gray-700',
  '部分已收': 'bg-orange-100 text-orange-700',
};

interface SearchParams {
  month?: string;
  customerId?: string;
  status?: string;
  type?: string;
}

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const params = await searchParams;

  const allShipments = await db.select().from(shipments).orderBy(desc(shipments.createdAt)).all();
  const allCustomers = await db.select().from(customers).all();
  const allCosts = await db.select().from(shipmentCosts).all();

  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  let filtered = allShipments;
  if (params.month) filtered = filtered.filter((s) => s.monthTag === params.month);
  if (params.customerId) filtered = filtered.filter((s) => s.customerId === parseInt(params.customerId!));
  if (params.status) filtered = filtered.filter((s) => s.status === params.status);
  if (params.type) filtered = filtered.filter((s) => s.shipmentType === params.type);

  const months = [...new Set(allShipments.map((s) => s.monthTag))].sort().reverse();

  const isViewer = user.role === 'viewer';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">票货管理</h1>
        {!isViewer && (
          <Link href="/shipments/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              新建票货
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">筛选条件</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-3">
            <Select name="month" defaultValue={params.month || ''}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="选择月份" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部月份</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select name="customerId" defaultValue={params.customerId || ''}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="选择客户" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部客户</SelectItem>
                {allCustomers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select name="status" defaultValue={params.status || ''}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部状态</SelectItem>
                <SelectItem value="运输中">运输中</SelectItem>
                <SelectItem value="已到仓">已到仓</SelectItem>
                <SelectItem value="已签收">已签收</SelectItem>
                <SelectItem value="已结算">已结算</SelectItem>
                <SelectItem value="部分已收">部分已收</SelectItem>
              </SelectContent>
            </Select>

            <Select name="type" defaultValue={params.type || ''}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="运输方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部</SelectItem>
                <SelectItem value="sea">海运</SelectItem>
                <SelectItem value="land">陆运</SelectItem>
              </SelectContent>
            </Select>

            <Button type="submit" variant="secondary">筛选</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>票号</TableHead>
                <TableHead>客户</TableHead>
                <TableHead>运输</TableHead>
                <TableHead>体积(m³)</TableHead>
                <TableHead className="text-right">应收</TableHead>
                <TableHead className="text-right">成本</TableHead>
                <TableHead className="text-right">利润</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const costs = allCosts
                  .filter((c) => c.shipmentId === s.id)
                  .reduce((sum, c) => sum + c.amountCents, 0);
                const profit = s.totalReceivableCents - costs;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.shipmentNo}</TableCell>
                    <TableCell>{customerMap.get(s.customerId!) || '-'}</TableCell>
                    <TableCell>{s.shipmentType! === 'sea' ? '海运' : '陆运'}</TableCell>
                    <TableCell>{s.volume}</TableCell>
                    <TableCell className="text-right">{formatCents(s.totalReceivableCents)}</TableCell>
                    <TableCell className="text-right">{formatCents(costs)}</TableCell>
                    <TableCell className={`text-right ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCents(profit)}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[s.status!] || ''}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/shipments/${s.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    暂无票货数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
