'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PenSquare, X } from 'lucide-react';
import { ScItemEditDialog } from './ScItemEditDialog';
import { formatCents } from '@/lib/format';

interface ScItem {
  id: number;
  品名: string | null;
  总体积: number;
  货型: string | null;
  运输方式: string | null;
  需支付总价_cents: number | null;
  客户应收_cents: number | null;
  成本单价_cents: number | null;
}

export function ScItemsTable({ items }: { items: ScItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [unitPrice, setUnitPrice] = useState('');
  const [receivablePrice, setReceivablePrice] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === items.length) { setSelected(new Set()); return; }
    setSelected(new Set(items.map(i => i.id)));
  };

  const handleBatchSave = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const unit = parseFloat(unitPrice || '');
    const rec = parseFloat(receivablePrice || '');
    try {
      for (const id of selected) {
        const body: any = {};
        if (!isNaN(unit)) body.成本单价_cents = Math.round(unit * 100);
        if (!isNaN(rec)) body.客户应收_cents = Math.round(rec * 100);
        if (Object.keys(body).length === 0) continue;
        await fetch(`/api/shared-container-items/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      router.refresh();
      setShowModal(false);
      setSelected(new Set());
    } catch {
      alert('批量保存失败');
    }
    setSaving(false);
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Button variant="outline" size="sm" onClick={selectAll}>
          {selected.size === items.length ? '取消全选' : '全选'}
        </Button>
        {selected.size > 0 && (
          <Button variant="default" size="sm" onClick={() => setShowModal(true)}>
            <PenSquare className="h-3.5 w-3.5 mr-1" /> 批量编辑 ({selected.size})
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>品名</TableHead><TableHead className="text-right">体积</TableHead>
            <TableHead>货型</TableHead><TableHead>运输</TableHead>
            <TableHead className="text-right">成本</TableHead><TableHead className="text-right">应收</TableHead>
            <TableHead className="text-center">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="rounded" />
              </TableCell>
              <TableCell>{item.品名 || '-'}</TableCell>
              <TableCell className="text-right">{item.总体积.toFixed(2)}</TableCell>
              <TableCell>{item.货型 || '-'}</TableCell>
              <TableCell>{item.运输方式 || '-'}</TableCell>
              <TableCell className="text-right text-red-600">{formatCents(item.需支付总价_cents || 0)}</TableCell>
              <TableCell className="text-right text-green-600">{formatCents(item.客户应收_cents || 0)}</TableCell>
              <TableCell className="text-center">
                <ScItemEditDialog
                  itemId={item.id}
                  volume={item.总体积}
                  成本单价_cents={item.成本单价_cents || 0}
                  客户应收_cents={item.客户应收_cents || 0}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-80 space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-medium">批量修改 ({selected.size} 条)</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowModal(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-2">
              <Label>成本单价 (元/m³，留空不修改)</Label>
              <Input type="number" step="0.01" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="留空则不变" />
            </div>
            <div className="space-y-2">
              <Label>应收单价 (元/m³，留空不修改)</Label>
              <Input type="number" step="0.01" value={receivablePrice} onChange={e => setReceivablePrice(e.target.value)} placeholder="留空则不变" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowModal(false)}>取消</Button>
              <Button size="sm" className="flex-1" onClick={handleBatchSave} disabled={saving || (!unitPrice && !receivablePrice)}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
