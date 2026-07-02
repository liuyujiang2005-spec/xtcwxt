import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { marks, customers } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';

const MODE_COLORS: Record<string, string> = {
  '拼柜': 'bg-blue-100 text-blue-700',
  '装柜': 'bg-purple-100 text-purple-700',
};

export default async function MarksPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allMarks = await db.select().from(marks).orderBy(desc(marks.createdAt)).all();
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">唛头管理</h1>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>唛头号</TableHead>
                <TableHead>客户</TableHead>
                <TableHead>模式</TableHead>
                <TableHead>月份</TableHead>
                <TableHead>备注</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allMarks.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.markNo}</TableCell>
                  <TableCell className="font-medium">{customerMap.get(m.customerId) || '-'}</TableCell>
                  <TableCell>
                    <Badge className={MODE_COLORS[m.mode] || ''}>{m.mode}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{m.monthTag}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{m.remark || '-'}</TableCell>
                  <TableCell className="text-sm">{m.createdAt?.substring(0, 10) || '-'}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/marks/${m.id}`}>
                      <Button variant="ghost" size="sm">详情</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {allMarks.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">暂无唛头数据</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
