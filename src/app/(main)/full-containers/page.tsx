import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { fullContainerBatches, customers } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import { DeleteBatchButton } from '../shared-containers/DeleteBatchButton';
import { formatAmount } from '@/lib/format';

// 由 4 日期推风控状态：泰国到货空=在途；到货且剩余>0=未结算；剩余≤0=已结算
export function riskStatus(b: any): { label: string; cls: string } {
  const arrived = !!(b.泰国到货日期 && String(b.泰国到货日期).trim());
  const remaining = Number(b.剩余 ?? b.整柜应收 ?? 0);
  if (!arrived) return { label: '在途', cls: 'bg-blue-100 text-blue-700' };
  if (remaining > 0.01) return { label: '未结算', cls: 'bg-orange-100 text-orange-700' };
  return { label: '已结算', cls: 'bg-green-100 text-green-700' };
}

export default async function FullContainersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const batches = await db.select().from(fullContainerBatches).orderBy(desc(fullContainerBatches.createdAt)).all();
  const custList = await db.select().from(customers).all();
  const custMap = new Map(custList.map(c => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">整柜批次</h1>
        <Link href="/full-containers/upload">
          <Button><Upload className="h-4 w-4 mr-2" />上传整柜</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>批次号</TableHead>
                <TableHead>客户</TableHead>
                <TableHead>柜型</TableHead>
                <TableHead>月份</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">应收</TableHead>
                <TableHead className="text-right">剩余</TableHead>
                <TableHead className="text-right">货值</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => {
                const s = riskStatus(b);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.batchNo}</TableCell>
                    <TableCell className="text-sm">{custMap.get(b.customerId as number) || '-'}</TableCell>
                    <TableCell className="text-sm">{b.柜型 || '-'}</TableCell>
                    <TableCell className="text-sm">{b.monthTag || '-'}</TableCell>
                    <TableCell><Badge className={s.cls}>{s.label}</Badge></TableCell>
                    <TableCell className="text-right">{b.整柜应收 != null ? formatAmount(Number(b.整柜应收), b.currency || 'CNY') : '-'}</TableCell>
                    <TableCell className="text-right text-orange-600">{b.剩余 != null ? formatAmount(Number(b.剩余), b.currency || 'CNY') : '-'}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{b.货物申报价值 != null ? formatAmount(Number(b.货物申报价值), b.currency || 'CNY') : '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/full-containers/${b.id}`}><Button variant="ghost" size="sm">详情</Button></Link>
                        <DeleteBatchButton batchId={b.id} apiPath="/api/full-containers" />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {batches.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">暂无整柜数据</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
