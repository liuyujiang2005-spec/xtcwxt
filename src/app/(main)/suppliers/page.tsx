import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { suppliers } from '@/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import SupplierDialog from './supplier-dialog';

export default async function SuppliersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allSuppliers = await db.select().from(suppliers).all();
  const canEdit = user.role === 'admin' || user.role === 'finance';
  const canDelete = user.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">供应商管理</h1>
        {canEdit && <SupplierDialog mode="create" />}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>供应商名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>联系人</TableHead>
                <TableHead>默认币种</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allSuppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{s.type || '-'}</Badge>
                  </TableCell>
                  <TableCell>{s.contact || '-'}</TableCell>
                  <TableCell>{s.defaultCurrency}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{s.remark || '-'}</TableCell>
                  <TableCell className="text-right">
                    {canEdit && (
                      <div className="flex gap-2 justify-end">
                        <SupplierDialog mode="edit" supplier={s} />
                        {canDelete && (
                          <SupplierDialog mode="delete" supplier={s} />
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {allSuppliers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">暂无供应商数据</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
