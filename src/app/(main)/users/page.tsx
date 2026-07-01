import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { users } from '@/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import UserDialog from './user-dialog';

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  finance: '财务',
  operator: '操作员',
  viewer: '查看者',
};

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/');

  const allUsers = await db.select().from(users).all();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">用户管理</h1>
        <UserDialog mode="create" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户名</TableHead>
                <TableHead>显示名</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell>{u.displayName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ROLE_LABELS[u.role!] || u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                      {u.active ? '启用' : '禁用'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <UserDialog mode="edit" user={u as any} />
                      {u.id !== user.id && (
                        <UserDialog mode="delete" user={u as any} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {allUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无用户数据</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
