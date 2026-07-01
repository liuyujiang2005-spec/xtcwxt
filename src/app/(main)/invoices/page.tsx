import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { invoices, customers, invoiceItems, shipments } from '@/db/schema';
import { formatCents, generateInvoiceNo } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { desc } from 'drizzle-orm';
import CreateInvoiceDialog from './create-dialog';

const INVOICE_STATUS_COLORS: Record<string, string> = {
  '待开': 'bg-yellow-100 text-yellow-700',
  '已开': 'bg-blue-100 text-blue-700',
  '已寄出': 'bg-purple-100 text-purple-700',
  '已收款': 'bg-green-100 text-green-700',
  '已作废': 'bg-gray-100 text-gray-700',
};

export default async function InvoicesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allInvoices = await db.select().from(invoices).orderBy(desc(invoices.id)).all();
  const allCustomers = await db.select().from(customers).all();
  const allShipments = await db.select().from(shipments).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const isViewer = user.role === 'viewer';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">发票管理</h1>
        {!isViewer && <CreateInvoiceDialog customers={allCustomers as any} shipments={allShipments as any} />}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>发票号</TableHead>
                <TableHead>客户</TableHead>
                <TableHead>类型</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>开票日期</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allInvoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.invoiceNo}</TableCell>
                  <TableCell>{customerMap.get(inv.customerId!) || '-'}</TableCell>
                  <TableCell>{inv.type || '-'}</TableCell>
                  <TableCell className="text-right">{formatCents(inv.totalAmountCents, inv.currency || undefined)}</TableCell>
                  <TableCell>
                    <Badge className={INVOICE_STATUS_COLORS[inv.status!] || ''}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell>{inv.issueDate || '-'}</TableCell>
                </TableRow>
              ))}
              {allInvoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">暂无发票</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
