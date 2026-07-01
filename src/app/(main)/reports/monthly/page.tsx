import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { shipments, shipmentCosts, paymentShipmentAllocations, customers } from '@/db/schema';
import { formatCents } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download } from 'lucide-react';
import MonthlyReportClient from './client';

export default async function MonthlyReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (user.role === 'operator' || user.role === 'viewer') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">月度报表</h1>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            您没有权限查看报表，请联系管理员
          </CardContent>
        </Card>
      </div>
    );
  }

  const allShipments = await db.select().from(shipments).all();
  const allCustomers = await db.select().from(customers).all();
  const allCosts = await db.select().from(shipmentCosts).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const months = [...new Set(allShipments.map((s) => s.monthTag))].sort().reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">月度报表</h1>
      </div>

      <MonthlyReportClient
        months={months}
        allShipments={allShipments as any}
        allCosts={allCosts as any}
        customerMap={Object.fromEntries(customerMap) as any}
      />
    </div>
  );
}
