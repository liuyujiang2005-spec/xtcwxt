'use client';
import { formatAmount } from '@/lib/format';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PenSquare, X } from 'lucide-react';
import { ScItemEditDialog } from './ScItemEditDialog';

export function ScItemsTable({ items, isThb }: { items: any[]; isThb?: boolean }) {
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
    const updates: any = {};
    if (!isNaN(unit)) updates.成本单价 = unit;
    if (!isNaN(rec)) updates.客户应收 = rec;
    if (Object.keys(updates).length === 0) return;

    try {
      const res = await fetch('/api/shared-container-items/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), updates }),
      });
      if (res.ok) {
        router.refresh();
        setShowModal(false);
        setSelected(new Set());
      } else {
        const err = await res.json().catch(() => ({ error: '失败' }));
        alert(err.error || '批量保存失败');
      }
    } catch {
      alert('网络错误');
    }
    setSaving(false);
  };

  // Group by 运单号 for rowSpan merge
  const groups: { key: string; rows: any[] }[] = [];
  let lastKey = '';
  for (const item of items) {
    const key = item.运单号 || `_${item.id}`;
    if (key !== lastKey) { groups.push({ key, rows: [] }); lastKey = key; }
    groups[groups.length - 1].rows.push(item);
  }

  const dims = (item: any) =>
    [item.尺寸_长, item.尺寸_宽, item.尺寸_高].filter((d: any) => d != null && d > 0).join('×') || '-';

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
            <TableHead>运单号</TableHead>
            <TableHead>运输方式</TableHead>
            <TableHead>品名</TableHead>
            <TableHead>尺寸</TableHead>
            <TableHead className="text-right">件数</TableHead>
            <TableHead>货型</TableHead>
            <TableHead className="text-right">总体积</TableHead>
            <TableHead className="text-right">总重量</TableHead>
            <TableHead className="text-right">成本</TableHead>
            <TableHead className="text-right">应收</TableHead>
            <TableHead>结算</TableHead>
            <TableHead className="text-center">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map(g => g.rows.map((item: any, ri: number) => (
            <TableRow key={item.id}>
              <TableCell>
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="rounded" />
              </TableCell>
              {ri === 0 ? <TableCell rowSpan={g.rows.length} className="text-xs font-mono">{item.运单号 || '-'}</TableCell> : null}
              {ri === 0 ? <TableCell rowSpan={g.rows.length}>{item.运输方式 || '-'}</TableCell> : null}
              <TableCell className="max-w-[120px] truncate" title={item.品名 || ''}>{item.品名 || '-'}</TableCell>
              <TableCell className="text-xs">{dims(item)}</TableCell>
              <TableCell className="text-right">{item.箱数 || '-'}</TableCell>
              <TableCell>{item.货型 || '-'}</TableCell>
              {ri === 0 ? <TableCell className="text-right" rowSpan={g.rows.length}>{(item.总体积 ?? 0).toFixed(6)}</TableCell> : null}
              {ri === 0 ? <TableCell className="text-right" rowSpan={g.rows.length}>{item.总重量 || '-'}</TableCell> : null}
              <TableCell className="text-right text-red-600">{formatAmount((item.需支付总价 || 0))}</TableCell>
              {ri === 0 ? <TableCell className="text-right text-green-600" rowSpan={g.rows.length}>{formatAmount((item.客户应收 ?? 0), isThb ? 'THB' : 'CNY')}</TableCell> : null}
              {ri === 0 ? <TableCell rowSpan={g.rows.length}>{item.cost_status || item.payment_status || '-'}</TableCell> : null}
              <TableCell className="text-center">
                <ScItemEditDialog
                  itemId={item.id}
                  volume={item.总体积}
                  成本单价={item.成本单价 || 0}
                  客户应收={item.客户应收 || 0}
                  isThb={isThb}
                />
              </TableCell>
            </TableRow>
          )))}
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
