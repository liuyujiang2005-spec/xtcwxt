import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { sharedContainerBatches } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import { DeleteBatchButton } from './DeleteBatchButton';

const STATUS_COLORS: Record<string, string> = {
  '待验证': 'bg-yellow-100 text-yellow-700',
  '已验证': 'bg-green-100 text-green-700',
  '已导入': 'bg-blue-100 text-blue-700',
};

export default async function SharedContainersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const batches = await db.select().from(sharedContainerBatches).orderBy(desc(sharedContainerBatches.createdAt)).all();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">拼柜批次</h1>
        <Link href="/shared-containers/upload">
          <Button><Upload className="h-4 w-4 mr-2" />上传拼柜</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>批次号</TableHead>
                <TableHead className="text-right">声明的总立方</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>上传文件</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.batchNo}</TableCell>
                  <TableCell className="text-right">{b.totalVolumeUploaded.toFixed(2)} m³</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[b.status!] || ''}>{b.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.originalFilename || '-'}</TableCell>
                  <TableCell className="text-sm">{b.createdAt?.substring(0, 10) || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/shared-containers/${b.id}`}><Button variant="ghost" size="sm">详情</Button></Link>
                      <DeleteBatchButton batchId={b.id} apiPath="/api/shared-containers" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">暂无拼柜数据</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
