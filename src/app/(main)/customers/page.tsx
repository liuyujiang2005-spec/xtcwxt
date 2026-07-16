import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { customers } from '@/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import CustomerDialog from './customer-dialog';
import { RefreshMetricsButton } from './RefreshMetricsButton';
import { BatchPriceEdit } from './BatchPriceEdit';

const WAREHOUSES = ['义乌仓', '广州仓', '东莞仓', '深圳仓'];
const PRICE_KEYS = [
  { key: 'sea_regular', label: '海运普货' },
  { key: 'sea_sensitive', label: '海运敏感' },
  { key: 'sea_inspection', label: '海运商检' },
  { key: 'land_regular', label: '陆运普货' },
  { key: 'land_sensitive', label: '陆运敏感' },
  { key: 'land_inspection', label: '陆运商检' },
];

function getPrice(pm: any, warehouse: string, key: string): string {
  if (!pm || typeof pm !== 'object') return '-';
  if (pm[warehouse] && typeof pm[warehouse] === 'object') {
    const v = pm[warehouse][key];
    return v != null ? String(v) : '-';
  }
  const v = pm[key];
  return v != null ? String(v) : '-';
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const q = sp.q || '';
  const tab = sp.tab || 'cny';
  const isThb = tab === 'thb';

  const allCustomers = await db.select().from(customers).orderBy(customers.name).all();
  const canEdit = user.role === 'admin' || user.role === 'finance';
  const canDelete = user.role === 'admin';

  const filtered = q
    ? allCustomers.filter(c => c.name?.includes(q) || c.contact?.includes(q))
    : allCustomers;

  const renderPrice = (v: string) => {
    if (v === '-') return '-';
    return isThb ? `THB ${v}` : `¥${v}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">客户管理</h1>
        <div className="flex gap-2">
          {canEdit && <RefreshMetricsButton />}
          {canEdit && <><CustomerDialog mode="create" tab={tab} /><BatchPriceEdit customerIds={filtered.map(c => c.id)} /></>}
        </div>
      </div>

      <form method="get" className="flex gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">客户名</label>
          <input name="q" defaultValue={q} placeholder="搜索客户..." className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm w-48" />
        </div>
        <Button type="submit" variant="outline" size="sm">筛选</Button>
        {q && <Link href="/customers"><Button variant="ghost" size="sm">清除</Button></Link>}
        <div className="h-8 w-px bg-border mx-1" />
        <Link href={`/customers?q=${q}&tab=cny`}><Button variant={!isThb ? 'default' : 'outline'} size="sm">人民币</Button></Link>
        <Link href={`/customers?q=${q}&tab=thb`}><Button variant={isThb ? 'default' : 'outline'} size="sm">泰铢</Button></Link>
      </form>

      <div className="space-y-4">
        {filtered.map((c) => {
          let pm: any = {};
          if (isThb) {
            if ((c as any).priceMatrixThb) try { pm = JSON.parse((c as any).priceMatrixThb); } catch {}
          } else {
            if (c.priceMatrix) try { pm = JSON.parse(c.priceMatrix); } catch {}
          }

          return (
            <Card key={c.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold">{c.name}</h3>
                    {c.contact && <span className="text-sm text-muted-foreground">{c.contact}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!!c.enableMinVolume ? (
                      <Badge className="bg-green-100 text-green-700 text-xs">低消</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">无低消</Badge>
                    )}
                    <Badge variant="outline" className={isThb ? 'text-orange-600' : ''}>{isThb ? 'THB' : 'CNY'}</Badge>
                    {canEdit && (
                      <div className="flex gap-1">
                        <CustomerDialog mode="edit" customer={c} tab={tab} />
                        {canDelete && <CustomerDialog mode="delete" customer={c} />}
                      </div>
                    )}
                  </div>
                </div>
                <Table className="border">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="border">仓库</TableHead>
                      {PRICE_KEYS.map((pk) => (
                        <TableHead key={pk.key} className="border text-right">{pk.label}{isThb ? '(THB)' : '(元)'}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {WAREHOUSES.map((wh) => (
                      <TableRow key={wh}>
                        <TableCell className="border font-medium">{wh}</TableCell>
                        {PRICE_KEYS.map((pk) => (
                          <TableCell key={pk.key} className="border text-right text-sm">
                            {renderPrice(getPrice(pm, wh, pk.key))}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">暂无客户数据</CardContent></Card>
        )}
      </div>
    </div>
  );
}
