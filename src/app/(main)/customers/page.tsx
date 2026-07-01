import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { customers } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import CustomerDialog from './customer-dialog';

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
        {canEdit && <CustomerDialog mode="create" />}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户名称</TableHead>
                <TableHead>联系人</TableHead>
                <TableHead>默认币种</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allCustomers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.contact || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.defaultCurrency}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{c.remark || '-'}</TableCell>
                  <TableCell className="text-right">
                    {canEdit && (
                      <div className="flex gap-2 justify-end">
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
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无客户数据</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
