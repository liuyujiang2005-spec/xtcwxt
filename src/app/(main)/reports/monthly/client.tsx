'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download } from 'lucide-react';

interface Shipment {
  id: number;
  customerId: number;
  monthTag: string;
  totalReceivableCents: number;
  currency: string;
  shipmentNo: string;
  volume: number;
}

interface Cost {
  shipmentId: number;
  costType: string;
  amountCents: number;
  currency: string;
}

interface Props {
  months: string[];
  allShipments: Shipment[];
  allCosts: Cost[];
  customerMap: Record<number, string>;
}

export default function MonthlyReportClient({ months, allShipments, allCosts, customerMap }: Props) {
  const [selectedMonth, setSelectedMonth] = useState(months[0] || '');

  const data = useMemo(() => {
    if (!selectedMonth) return null;

    const monthShipments = allShipments.filter((s) => s.monthTag === selectedMonth);
    const sIds = monthShipments.map((s) => s.id);
    const monthCosts = allCosts.filter((c) => sIds.includes(c.shipmentId));

    const totalRevenue = monthShipments.reduce((sum, s) => sum + s.totalReceivableCents, 0);
    const totalCost = monthCosts.reduce((sum, c) => sum + c.amountCents, 0);
    const totalProfit = totalRevenue - totalCost;

    const byCustomer = new Map<number, { cny: number; thb: number; volume: number; count: number }>();
    monthShipments.forEach((s) => {
      const entry = byCustomer.get(s.customerId) || { cny: 0, thb: 0, volume: 0, count: 0 };
      entry.count++;
      entry.volume += s.volume;
      if (s.currency === 'THB') entry.thb += s.totalReceivableCents;
      else entry.cny += s.totalReceivableCents;
      byCustomer.set(s.customerId, entry);
    });

    const byCostType = new Map<string, { cny: number; thb: number; count: number }>();
    monthCosts.forEach((c) => {
      const entry = byCostType.get(c.costType) || { cny: 0, thb: 0, count: 0 };
      entry.count++;
      if (c.currency === 'THB') entry.thb += c.amountCents;
      else entry.cny += c.amountCents;
      byCostType.set(c.costType, entry);
    });

    return { totalRevenue, totalCost, totalProfit, byCustomer, byCostType };
  }, [selectedMonth, allShipments, allCosts]);

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push('类型,客户/费用,CNY(分),THB(分),笔数,体积');

    data.byCustomer.forEach((v, id) => {
      lines.push(`收入,${customerMap[id] || '未知'},${v.cny},${v.thb},${v.count},${v.volume.toFixed(2)}`);
    });
    data.byCostType.forEach((v, type) => {
      lines.push(`支出,${type},${v.cny},${v.thb},${v.count},`);
    });

    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `月度报表_${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatAmount = (cents: number, currency: string = 'CNY') => {
    const symbol = currency === 'THB' ? '฿' : '¥';
    return `${symbol}${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <Select value={selectedMonth} onValueChange={(v) => setSelectedMonth(v || '')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="选择月份" />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data && (
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            导出 CSV
          </Button>
        )}
      </div>

      {data && (() => {
        const revenueCNY = Array.from(data.byCustomer.values()).reduce((sum, v) => sum + v.cny, 0);
        const revenueTHB = Array.from(data.byCustomer.values()).reduce((sum, v) => sum + v.thb, 0);
        const costCNY = Array.from(data.byCostType.values()).reduce((sum, v) => sum + v.cny, 0);
        const costTHB = Array.from(data.byCostType.values()).reduce((sum, v) => sum + v.thb, 0);
        const profitCNY = revenueCNY - costCNY;
        const profitTHB = revenueTHB - costTHB;

        return (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">营收</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="text-lg font-bold">{formatAmount(revenueCNY)}</div>
                  {revenueTHB > 0 && (
                    <div className="text-lg font-bold">{formatAmount(revenueTHB, 'THB')}</div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">支出</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="text-lg font-bold text-red-600">{formatAmount(costCNY)}</div>
                  {costTHB > 0 && (
                    <div className="text-lg font-bold text-red-600">{formatAmount(costTHB, 'THB')}</div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">利润</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className={`text-lg font-bold ${profitCNY >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatAmount(profitCNY)}
                  </div>
                  {profitTHB !== 0 && (
                    <div className={`text-lg font-bold ${profitTHB >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatAmount(profitTHB, 'THB')}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>营收明细 (按客户)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>客户</TableHead>
                    <TableHead className="text-right">笔数</TableHead>
                    <TableHead className="text-right">体积(m³)</TableHead>
                    <TableHead className="text-right">CNY</TableHead>
                    <TableHead className="text-right">THB</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from(data.byCustomer.entries()).map(([id, v]) => (
                    <TableRow key={id}>
                      <TableCell className="font-medium">{customerMap[id] || '未知'}</TableCell>
                      <TableCell className="text-right">{v.count}</TableCell>
                      <TableCell className="text-right">{v.volume.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{formatAmount(v.cny)}</TableCell>
                      <TableCell className="text-right">{formatAmount(v.thb, 'THB')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>支出明细 (按费用类型)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>费用类型</TableHead>
                    <TableHead className="text-right">笔数</TableHead>
                    <TableHead className="text-right">CNY</TableHead>
                    <TableHead className="text-right">THB</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from(data.byCostType.entries()).map(([type, v]) => (
                    <TableRow key={type}>
                      <TableCell className="font-medium">{type}</TableCell>
                      <TableCell className="text-right">{v.count}</TableCell>
                      <TableCell className="text-right">{formatAmount(v.cny)}</TableCell>
                      <TableCell className="text-right">{formatAmount(v.thb, 'THB')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      );
})()}
    </div>
  );
}
