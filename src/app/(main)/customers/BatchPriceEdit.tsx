'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit3, X } from 'lucide-react';

const WAREHOUSES = ['义乌仓', '广州仓', '东莞仓', '深圳仓'];
const PRICE_KEYS = ['sea_regular', 'sea_sensitive', 'sea_inspection', 'land_regular', 'land_sensitive', 'land_inspection'];
const PRICE_LABELS: Record<string, string> = {
  sea_regular: '海运-普货', sea_sensitive: '海运-敏感', sea_inspection: '海运-商检',
  land_regular: '陆运-普货', land_sensitive: '陆运-敏感', land_inspection: '陆运-商检',
};

export function BatchPriceEdit({ customerIds, tab }: { customerIds: number[]; tab?: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [enableMin, setEnableMin] = useState(true);
  const [enableMinTouched, setEnableMinTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const isThb = tab === 'thb';

  const handleSave = async () => {
    setSaving(true);
    const matrixField = isThb ? 'priceMatrixThb' : 'priceMatrix';

    // 收集本次要改的价格（只取填了值的字段）
    const filledFields: Record<string, number> = {};
    for (const k of PRICE_KEYS) {
      if (prices[k] !== undefined && prices[k] !== '') {
        filledFields[k] = parseFloat(prices[k]) || 0;
      }
    }
    if (Object.keys(filledFields).length === 0 && !enableMinTouched) {
      setSaving(false);
      return;
    }

    try {
      for (const id of customerIds) {
        // 先拉取当前客户数据
        const res = await fetch('/api/customers');
        const list = await res.json();
        const cust = Array.isArray(list) ? list.find((c: any) => c.id === id) : null;
        if (!cust) continue;

        // 解析已有价格矩阵
        let existing: any = {};
        const raw = cust[matrixField];
        if (raw) {
          try { existing = JSON.parse(raw); } catch {}
        }
        // 判断是否仓库格式：任意仓库键存在且为对象
        const hasWarehouse = WAREHOUSES.some((wh: string) => existing[wh] && typeof existing[wh] === 'object');
        if (!hasWarehouse) {
          // 旧平铺格式 → 转为仓库格式
          const flat: Record<string, number> = {};
          for (const k of PRICE_KEYS) if (typeof existing[k] === 'number') flat[k] = existing[k];
          existing = {};
          for (const wh of WAREHOUSES) existing[wh] = { ...flat };
        }

        // 精准合并：只更新选中仓库下填了值的字段
        if (!existing[warehouse]) existing[warehouse] = {};
        for (const k of Object.keys(filledFields)) {
          existing[warehouse][k] = filledFields[k];
        }

        const upd: any = {};
        upd[matrixField] = JSON.stringify(existing);
        if (enableMinTouched) upd.enableMinVolume = enableMin ? 1 : 0;

        await fetch('/api/customers', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...upd }),
        });
      }
      setShow(false);
      router.refresh();
    } catch { alert('操作失败'); }
    setSaving(false);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setShow(true)} disabled={customerIds.length === 0}>
        <Edit3 className="h-3.5 w-3.5 mr-1" />批量修改 ({customerIds.length})
      </Button>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShow(false)}>
          <div className="bg-white rounded-xl p-6 w-96 space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="font-medium">批量修改价格 ({customerIds.length} 个客户)</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShow(false)}><X className="h-4 w-4" /></Button>
            </div>

            {/* 仓库选择 */}
            <div className="space-y-1">
              <Label className="text-xs">选择仓库</Label>
              <div className="flex gap-1">
                {WAREHOUSES.map(w => (
                  <Button key={w} type="button" variant={warehouse === w ? 'default' : 'outline'} size="sm" onClick={() => setWarehouse(w)}>{w}</Button>
                ))}
              </div>
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
              <Checkbox id="bmin" checked={enableMin} onCheckedChange={v => { setEnableMin(!!v); setEnableMinTouched(true); }} />
              <Label htmlFor="bmin" className="text-sm">启用低消</Label>
            </div>
            <p className="text-xs text-muted-foreground">只更新「{warehouse}」下填了值的字段。留空的和其他仓库的价格不动。</p>
            <Button onClick={handleSave} disabled={saving} className="w-full" size="sm">应用到 {customerIds.length} 个客户</Button>
          </div>
        </div>
      )}
    </>
  );
}