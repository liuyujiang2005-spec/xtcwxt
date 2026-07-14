import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { loadingBatches } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { DeleteBatchButton } from '../shared-containers/DeleteBatchButton';
import { ExportButton } from '../shared-containers/ExportButton';

export default async function LoadingListsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q || '';

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allBatches = await db.select().from(loadingBatches).orderBy(desc(loadingBatches.createdAt)).all();
  const batches = q ? allBatches.filter(b => b.batchNo?.includes(q)) : allBatches;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">装柜批次</h1>
        <Link href="/loading-lists/upload"><Button><Upload className="h-4 w-4 mr-2" />上传装柜</Button></Link>
        <ExportButton apiPath="/api/loading-batches/export" label="装柜批次" />
      </div>

      <form method="get" className="flex gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">批次号</label>
          <input name="q" defaultValue={q} placeholder="搜索批次号..." className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm w-48" />
        </div>
        <Button type="submit" variant="outline" size="sm">搜索</Button>
        {q && <Link href="/loading-lists"><Button variant="ghost" size="sm">清除</Button></Link>}
      </form>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>批次号</TableHead>
                <TableHead>上传文件</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.batchNo}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.originalFilename || '-'}</TableCell>
                  <TableCell className="text-sm">{b.createdAt?.substring(0, 10) || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/loading-lists/${b.id}`}><Button variant="ghost" size="sm">详情</Button></Link>
                      <a href={`/api/loading-batches/export?batchId=${b.id}`}><Button variant="ghost" size="sm">导出</Button></a>
                      <Link href={`/loading-lists/${b.id}/manual`}><Button variant="ghost" size="sm">录入</Button></Link>
                      <DeleteBatchButton batchId={b.id} apiPath="/api/loading-batches" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {batches.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">暂无装柜数据</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
