'use client';

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BatchPriceEdit } from './BatchPriceEdit';

export function CustomersTable({ customers }: { customers: any[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (id: number) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {selected.size > 0 && <BatchPriceEdit customerIds={Array.from(selected)} />}
        <span className="text-sm text-muted-foreground">{selected.size > 0 ? `${selected.size} 个已选` : ''}</span>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead className="w-8"><input type="checkbox" onChange={() => selected.size === customers.length ? setSelected(new Set()) : setSelected(new Set(customers.map(c => c.id)))} checked={selected.size === customers.length} /></TableHead>
          <TableHead>客户名称</TableHead><TableHead>联系人</TableHead><TableHead className="text-right">总体积(m³)</TableHead><TableHead>币种</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {customers.map(c => (
            <TableRow key={c.id}>
              <TableCell><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></TableCell>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell>{c.contact || '-'}</TableCell>
              <TableCell className="text-right">{c._volume?.toFixed(2) || '-'}</TableCell>
              <TableCell>{c.defaultCurrency || 'CNY'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
