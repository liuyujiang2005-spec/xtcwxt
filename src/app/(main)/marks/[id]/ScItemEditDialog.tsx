'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil } from 'lucide-react';

export function ScItemEditDialog({
  itemId, volume, 成本单价_cents, 客户应收_cents,
}: {
  itemId: number;
  volume: number;
  成本单价_cents: number;
  客户应收_cents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState(String((成本单价_cents ?? 0) / 100));
  const [receivable, setReceivable] = useState(String((客户应收_cents ?? 0) / 100));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const costCents = parseFloat(cost || '0');
    const receivableCents = parseFloat(receivable || '0');

    try {
      const r = await fetch(`/api/shared-container-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 成本单价_cents: costCents, 客户应收_cents: receivableCents, 总体积: volume }),
      });
      if (r.ok) { router.refresh(); setOpen(false); } else { const e = await r.json().catch(()=>({error:'保存失败'})); alert(e.error); }
    } catch (e) {
      alert('保存失败，请重试');
    }

    setSaving(false);
    router.refresh();
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl p-6 w-80 space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-medium text-sm">编辑费用（体积: {volume.toFixed(6)}m³）</h3>
        <div className="space-y-2">
          <Label>成本单价 (元/m³)</Label>
          <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>应收单价 (元/m³)</Label>
          <Input type="number" step="0.01" value={receivable} onChange={(e) => setReceivable(e.target.value)} />
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>成本合计: ¥{(parseFloat(cost || '0') * volume).toFixed(6)}</p>
          <p>应收合计: ¥{(parseFloat(receivable || '0') * volume).toFixed(6)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => setOpen(false)}>取消</Button>
          <Button size="sm" className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}
