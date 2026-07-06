'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit3, X } from 'lucide-react';

const PRICE_KEYS = ['sea_regular', 'sea_sensitive', 'sea_inspection', 'land_regular', 'land_sensitive', 'land_inspection'];
const PRICE_LABELS: Record<string, string> = {
  sea_regular: '海运-普货', sea_sensitive: '海运-敏感', sea_inspection: '海运-商检',
  land_regular: '陆运-普货', land_sensitive: '陆运-敏感', land_inspection: '陆运-商检',
};

export function BatchPriceEdit({ customerIds }: { customerIds: number[] }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [enableMin, setEnableMin] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const matrix: Record<string, number> = {};
    for (const k of PRICE_KEYS) { if (prices[k]) matrix[k] = parseInt(prices[k]); }
    if (Object.keys(matrix).length === 0 && enableMin === undefined) return;

    const body: any = { ids: customerIds, prices: Object.keys(matrix).length > 0 ? matrix : undefined };
    if (enableMin !== undefined) body.enableMinVolume = enableMin ? 1 : 0;

    try {
      for (const id of customerIds) {
        const upd: any = {};
        if (matrix) upd.priceMatrix = JSON.stringify({ ...matrix });
        if (enableMin !== undefined) upd.enableMinVolume = enableMin ? 1 : 0;
        await fetch('/api/customers', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...upd }),
        });
      }
      router.refresh();
      setShow(false);
    } catch { alert('操作失败'); }
    setSaving(false);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setShow(true)}>
        <Edit3 className="h-3.5 w-3.5 mr-1" />批量修改价格
      </Button>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShow(false)}>
          <div className="bg-white rounded-xl p-6 w-96 space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="font-medium">批量修改价格 ({customerIds.length} 个客户)</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShow(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PRICE_KEYS.map(k => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{PRICE_LABELS[k]}</Label>
                  <Input type="number" className="h-7 text-xs" placeholder="留空不变" value={prices[k] || ''} onChange={e => setPrices({ ...prices, [k]: e.target.value })} />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="bmin" checked={enableMin} onCheckedChange={v => setEnableMin(!!v)} />
              <Label htmlFor="bmin" className="text-sm">启用低消</Label>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full" size="sm">应用到 {customerIds.length} 个客户</Button>
          </div>
        </div>
      )}
    </>
  );
}
