import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { customers } from '@/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import CustomerDialog from './customer-dialog';
import { RefreshMetricsButton } from './RefreshMetricsButton';

function parsePrice(c: any, key: string): string {
  if (!c.priceMatrix) return '-';
  try {
    const m = JSON.parse(c.priceMatrix);
    const v = m[key];
    return v != null ? String(v) : '-';
  } catch { return '-'; }
}

export default async function CustomersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allCustomers = await db.select().from(customers).all();
  const canEdit = user.role === 'admin' || user.role === 'finance';
  const canDelete = user.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">客户管理</h1>
        <div className="flex gap-2">
          {canEdit && <RefreshMetricsButton />}
          {canEdit && <CustomerDialog mode="create" />}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户名称</TableHead>
                <TableHead>联系人</TableHead>
                <TableHead className="text-right">海运普货</TableHead>
                <TableHead className="text-right">海运商检</TableHead>
                <TableHead className="text-right">海运敏感</TableHead>
                <TableHead className="text-right">陆运普货</TableHead>
                <TableHead className="text-right">陆运商检</TableHead>
                <TableHead className="text-right">陆运敏感</TableHead>
                <TableHead>低消</TableHead>
                <TableHead>币种</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allCustomers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-xs">{c.contact || '-'}</TableCell>
                  <TableCell className="text-right text-xs">¥{parsePrice(c, 'sea_regular')}</TableCell>
                  <TableCell className="text-right text-xs">¥{parsePrice(c, 'sea_inspection')}</TableCell>
                  <TableCell className="text-right text-xs">¥{parsePrice(c, 'sea_sensitive')}</TableCell>
                  <TableCell className="text-right text-xs">¥{parsePrice(c, 'land_regular')}</TableCell>
                  <TableCell className="text-right text-xs">¥{parsePrice(c, 'land_inspection')}</TableCell>
                  <TableCell className="text-right text-xs">¥{parsePrice(c, 'land_sensitive')}</TableCell>
                  <TableCell>
                    {c.enableMinVolume !== 0 ? <Badge className="bg-green-100 text-green-700 text-xs">启用</Badge> : <Badge variant="outline" className="text-xs">关闭</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.defaultCurrency}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canEdit && (
                      <div className="flex gap-1 justify-end">
                        <CustomerDialog mode="edit" customer={c} />
                        {canDelete && (
                          <CustomerDialog mode="delete" customer={c} />
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {allCustomers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">暂无客户数据</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
