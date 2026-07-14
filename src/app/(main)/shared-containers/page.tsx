import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { sharedContainerBatches, sharedContainerItems, marks } from '@/db/schema';
import { desc, like, inArray, eq } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import { DeleteBatchButton } from './DeleteBatchButton';
import { ExportButton } from './ExportButton';

const STATUS_COLORS: Record<string, string> = {
  '待验证': 'bg-gray-100 text-gray-700',
  '待审核': 'bg-yellow-100 text-yellow-700',
  '已发布': 'bg-green-100 text-green-700',
};

export default async function SharedContainersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const q = sp.q || '';

  const batches = await db.select().from(sharedContainerBatches).orderBy(desc(sharedContainerBatches.createdAt)).all();
  let searchedMarks: any[] | null = null;

  if (q) {
    const found = await db.select().from(marks).where(like(marks.markNo, `%${q}%`)).all();
    if (found.length > 0) {
      const markIds = found.map(m => m.id);
      const items = await db.select().from(sharedContainerItems).where(inArray(sharedContainerItems.markId, markIds)).all();
      const batchIds = [...new Set(items.map(i => i.batchId))];
      searchedMarks = found.map(m => {
        const mkItems = items.filter(i => i.markId === m.id);
        const batchId = mkItems[0]?.batchId;
        const batch = batches.find(b => b.id === batchId);
        return { ...m, itemCount: mkItems.length, batchId, batchNo: batch?.batchNo };
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">拼柜批次</h1>
        <Link href="/shared-containers/upload">
          <Button><Upload className="h-4 w-4 mr-2" />上传拼柜</Button>
        </Link>
        <ExportButton apiPath="/api/shared-containers/export" label="拼柜批次" />
      </div>

      <form method="get" className="flex gap-2 items-end">
        <input name="q" defaultValue={q} placeholder="搜索唛头..." className="h-8 rounded-lg border px-2.5 text-sm w-48" />
        <Button type="submit" variant="outline" size="sm">搜索</Button>
        {q && <Link href="/shared-containers"><Button variant="ghost" size="sm">清除</Button></Link>}
      </form>

      {searchedMarks && searchedMarks.length > 0 && (
        <Card>
          <div className="p-4 border-b"><h2 className="font-semibold">搜索结果：{searchedMarks.length} 个唛头</h2></div>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>唛头</TableHead><TableHead>客户</TableHead><TableHead className="text-right">明细数</TableHead>
                  <TableHead>批次号</TableHead><TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchedMarks.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.markNo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.mode} · {m.monthTag}</TableCell>
                    <TableCell className="text-right">{m.itemCount} 条</TableCell>
                    <TableCell className="font-mono text-xs">{m.batchNo || '-'}</TableCell>
                    <TableCell className="text-right">
                      {m.batchId && <Link href={`/shared-containers/${m.batchId}`}><Button variant="ghost" size="sm">查看批次</Button></Link>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!q && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>批次号</TableHead>
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
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无拼柜数据</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
