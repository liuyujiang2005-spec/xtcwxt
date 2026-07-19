import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { expenses, sharedContainerItems, loadingItems, marks } from '@/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ReceiptUploader } from '../bills/ReceiptUploader';
import { DeleteExpenseButton } from './DeleteExpenseButton';
import { NewExpenseDialog } from './NewExpenseDialog';
import { PayExpenseButton, PayScItemButton, PayLdItemButton, BatchPayScButton, BatchPayLdButton } from './PayButtons';
import { MarkCollapsibleCard } from '@/components/MarkCollapsibleCard';
import { formatAmount } from '@/lib/format';

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const q = sp.q || '';

  const allExpenses = await db.select().from(expenses).all();
  const allScItems = await db.select().from(sharedContainerItems).all();
  const allLdItems = await db.select().from(loadingItems).all();
  const allMarks = await db.select().from(marks).all();
  const markMap = new Map(allMarks.map(m => [m.id, m.markNo]));

  // Filter by mark
  let scItems = allScItems;
  let ldItems = allLdItems;
  if (q) {
    const matchingMarks = allMarks.filter(m => (m.markNo || '').includes(q)).map(m => m.id);
    scItems = allScItems.filter(i => matchingMarks.includes(i.markId));
    ldItems = allLdItems.filter(i => matchingMarks.includes(i.markId));
  }

  const scPending = scItems.filter((i) => i.cost_status === '待支出').reduce((s, i) => s + (i.需支付总价 || 0), 0);
  const ldPending = ldItems.filter((i) => i.payment_status === '待支付').reduce((s, i) => s + (i.需支付总价 || 0), 0);
  const scPaid = scItems.filter((i) => i.cost_status !== '待支出').reduce((s, i) => s + (i.需支付总价 || 0), 0);
  const ldPaid = ldItems.filter((i) => i.payment_status === '已支付').reduce((s, i) => s + (i.需支付总价 || 0), 0);

  // Group SC by mark
  const scByMark = new Map<number, any[]>();
  scItems.forEach(i => {
    if (!scByMark.has(i.markId)) scByMark.set(i.markId, []);
    scByMark.get(i.markId)!.push(i);
  });

  // Group LD by mark
  const ldByMark = new Map<number, any[]>();
  ldItems.forEach(i => {
    if (!ldByMark.has(i.markId)) ldByMark.set(i.markId, []);
    ldByMark.get(i.markId)!.push(i);
  });

  const byType = new Map<string, { count: number; CNY: number; THB: number }>();
  allExpenses.forEach((e) => {
    const entry = byType.get(e.expenseType) || { count: 0, CNY: 0, THB: 0 };
    entry.count++;
    if (e.currency === 'THB') entry.THB += e.amount;
    else entry.CNY += e.amount;
    byType.set(e.expenseType, entry);
  });

  const cnyExpenses = allExpenses.filter(e => e.currency !== 'THB');
  const thbExpenses = allExpenses.filter(e => e.currency === 'THB');

  const sortedExpenses = [...allExpenses].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const sortedCny = [...cnyExpenses].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const sortedThb = [...thbExpenses].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">支出总表</h1>
      <div className="flex justify-end">
        <NewExpenseDialog />
      </div>

      <h2 className="text-lg font-bold">人民币支出</h2>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">按费用类型（CNY）</h2></div>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>费用类型</TableHead><TableHead className="text-right">笔数</TableHead><TableHead className="text-right">CNY</TableHead><TableHead className="text-right">THB</TableHead></TableRow></TableHeader>
            <TableBody>
              {Array.from(byType.entries()).map(([type, v]) => (
                <TableRow key={type}><TableCell className="font-medium">{type}</TableCell><TableCell className="text-right">{v.count}</TableCell><TableCell className="text-right">{formatAmount(v.CNY)}</TableCell><TableCell className="text-right">{formatAmount(v.THB, 'THB')}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">自建费用明细 · CNY（{cnyExpenses.length} 条）</h2></div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>费用类型</TableHead><TableHead className="text-right">金额</TableHead><TableHead>币种</TableHead>
                <TableHead>仓库</TableHead><TableHead>供应商</TableHead><TableHead>状态</TableHead><TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCny.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.expenseType}</TableCell>
                  <TableCell className="text-right">{formatAmount(e.amount)}</TableCell>
                  <TableCell>{e.currency}</TableCell>
                  <TableCell className="text-sm">{(e as any).仓库 || '-'}</TableCell>
                  <TableCell className="text-sm">-</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded ${e.status === '已支付' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{e.status}</span>
                  </TableCell>
                  <TableCell className="text-xs">{e.createdAt?.substring(0, 10) || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {e.status !== '已支付' && <PayExpenseButton expenseId={e.id} />}
                      <Link href={`/costs/${e.id}`}><Button variant="ghost" size="sm">编辑</Button></Link>
                      <DeleteExpenseButton expenseId={e.id} />
                        <ReceiptUploader apiPath={`/api/expenses/${e.id}`} entityId={e.id} currentUrl={(e as any).receiptUrl} updateField="receiptUrl" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 拼柜成本按唛头 */}
      {scByMark.size > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">拼柜成本 · 按唛头</h2>
            <form method="get" className="flex gap-2 items-end">
              <input name="q" defaultValue={q} placeholder="搜索唛头..." className="h-8 rounded-lg border px-2.5 text-sm w-40" />
              <Button type="submit" variant="outline" size="sm">筛选</Button>
              {q && <Link href="/costs"><Button variant="ghost" size="sm">清除</Button></Link>}
            </form>
          </div>
          {Array.from(scByMark.entries()).map(([markId, items]) => {
            const pendingTotal = items.filter(i => i.cost_status === '待支出').reduce((s, i) => s + (i.需支付总价 || 0), 0);
            const hasPending = items.some(i => i.cost_status === '待支出');
            const groups: { key: string; rows: any[] }[] = [];
            let lastKey = '';
            for (const item of items) {
              const k = item.运单号 || `_${item.id}`;
              if (k !== lastKey) { groups.push({ key: k, rows: [] }); lastKey = k; }
              groups[groups.length - 1].rows.push(item);
            }
            return (
              <MarkCollapsibleCard key={markId} header={
                <>
                  <span className="font-bold">{markMap.get(markId) || `#${markId}`}</span>
                  <span className="text-sm text-muted-foreground ml-3">{items.length} 条</span>
                  {pendingTotal > 0 && <span className="text-sm text-orange-600 ml-3 font-bold">待付 {formatAmount(pendingTotal)}</span>}
                  {hasPending && <span className="ml-3"><BatchPayScButton markId={markId} /></span>}
                </>
              }>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>运单号</TableHead><TableHead>总体积</TableHead>
                      <TableHead>品名</TableHead><TableHead>仓库</TableHead><TableHead>运输</TableHead><TableHead>货型</TableHead><TableHead>国内单号</TableHead><TableHead>件数</TableHead><TableHead className="text-right">金额</TableHead><TableHead>备注</TableHead>
                      <TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map(g => g.rows.map((item: any, ri: number) => (
                      <TableRow key={item.id}>
                        {ri === 0 ? <TableCell className="text-xs font-mono" rowSpan={g.rows.length}>{item.运单号 || '-'}</TableCell> : null}
                        {ri === 0 ? <TableCell className="text-right" rowSpan={g.rows.length}>{(item.总体积 ?? 0).toFixed(6)}</TableCell> : null}
                        <TableCell className="border max-w-[100px] truncate" title={item.品名 || ''}>{item.品名 || '-'}</TableCell>
                          <TableCell className="border">{(item as any).仓库 || '-'}</TableCell>
                        <TableCell className="text-xs">{item.运输方式 || '-'}</TableCell>
                        <TableCell className="text-xs">{item.货型 || '-'}</TableCell>
                        <TableCell className="text-xs max-w-[100px] truncate">{item.国内单号 || '-'}</TableCell>
                        <TableCell>{item.箱数 || '-'}</TableCell>
                        <TableCell className="text-right">{formatAmount((item.需支付总价 || 0))}</TableCell>
                        <TableCell className="text-xs max-w-[80px] truncate">{item.备注 || '-'}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded ${item.cost_status !== '待支出' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{item.cost_status || '-'}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          {item.cost_status === '待支出' && <PayScItemButton itemId={item.id} />}
                        </TableCell>
                      </TableRow>
                    )))}
                  </TableBody>
                </Table>
              </MarkCollapsibleCard>
            );
          })}
        </div>
      )}

      {/* 装柜成本按唛头 */}
      {ldByMark.size > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">装柜成本 · 按唛头</h2>
          {Array.from(ldByMark.entries()).map(([markId, items]) => {
            const pendingTotal = items.filter(i => i.payment_status === '待支付').reduce((s, i) => s + (i.需支付总价 || 0), 0);
            const hasPending = items.some(i => i.payment_status === '待支付');
            return (
              <MarkCollapsibleCard key={markId} header={
                <>
                  <span className="font-bold">{markMap.get(markId) || `#${markId}`}</span>
                  <span className="text-sm text-muted-foreground ml-3">{items.length} 条</span>
                  {pendingTotal > 0 && <span className="text-sm text-orange-600 ml-3 font-bold">待付 {formatAmount(pendingTotal)}</span>}
                  {hasPending && <span className="ml-3"><BatchPayLdButton markId={markId} /></span>}
                </>
              }>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>品名</TableHead><TableHead>仓库</TableHead><TableHead>运输</TableHead><TableHead>货型</TableHead><TableHead>国内单号</TableHead><TableHead className="text-right">金额</TableHead><TableHead>备注</TableHead>
                      <TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="max-w-[100px] truncate">{item.品名 || '-'}</TableCell>
                        <TableCell className="text-xs">{(item as any).仓库 || '-'}</TableCell>
                        <TableCell className="text-xs">{item.运输方式 || '-'}</TableCell>
                        <TableCell className="text-xs">{item.货型 || '-'}</TableCell>
                        <TableCell className="text-xs">{item.国内单号 || '-'}</TableCell>
                        <TableCell className="text-right">{formatAmount((item.需支付总价 || 0))}</TableCell>
                        <TableCell className="text-xs max-w-[80px] truncate">{item.备注 || '-'}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded ${item.payment_status === '已支付' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{item.payment_status || '-'}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          {item.payment_status !== '已支付' && <PayLdItemButton itemId={item.id} />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </MarkCollapsibleCard>
            );
          })}
        </div>
      )}

      {thbExpenses.length > 0 && (
        <>
          <h2 className="text-lg font-bold mt-4 text-orange-600">泰铢支出</h2>
          <Card>
            <div className="p-4 border-b"><h2 className="font-semibold">自建费用明细 · THB（{thbExpenses.length} 条）</h2></div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>费用类型</TableHead><TableHead className="text-right">金额</TableHead><TableHead>币种</TableHead>
                    <TableHead>仓库</TableHead><TableHead>供应商</TableHead><TableHead>状态</TableHead><TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedThb.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.expenseType}</TableCell>
                      <TableCell className="text-right">{formatAmount(e.amount, 'THB')}</TableCell>
                      <TableCell>{e.currency}</TableCell>
                      <TableCell className="text-sm">{(e as any).仓库 || '-'}</TableCell>
                      <TableCell className="text-sm">-</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded ${e.status === '已支付' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{e.status}</span>
                      </TableCell>
                      <TableCell className="text-xs">{e.createdAt?.substring(0, 10) || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {e.status !== '已支付' && <PayExpenseButton expenseId={e.id} />}
                          <Link href={`/costs/${e.id}`}><Button variant="ghost" size="sm">编辑</Button></Link>
                          <DeleteExpenseButton expenseId={e.id} />
                          <ReceiptUploader apiPath={`/api/expenses/${e.id}`} entityId={e.id} currentUrl={(e as any).receiptUrl} updateField="receiptUrl" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
