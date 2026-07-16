'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

interface Customer {
  id: number;
  name: string;
  contact: string | null;
  priceMatrix: string | null;
  priceMatrixThb: string | null;
  defaultCurrency: string | null;
  remark: string | null;
  enableMinVolume: number | null;
}

interface Props {
  mode: 'create' | 'edit' | 'delete';
  customer?: Customer;
  tab?: string;
}

const WAREHOUSES = ['义乌仓', '广州仓', '东莞仓', '深圳仓'];
const EMPTY_PRICES = {
  sea_regular: 0, sea_inspection: 0, sea_sensitive: 0,
  land_regular: 0, land_inspection: 0, land_sensitive: 0,
};
const DEFAULT_PRICE_MATRIX: Record<string, Record<string, number>> = {};
for (const wh of WAREHOUSES) DEFAULT_PRICE_MATRIX[wh] = { ...EMPTY_PRICES };
const PRICE_LABELS: Record<string, string> = {
  sea_regular: '海运 - 普货', sea_inspection: '海运 - 商检货', sea_sensitive: '海运 - 敏感货',
  land_regular: '陆运 - 普货', land_inspection: '陆运 - 商检货', land_sensitive: '陆运 - 敏感货',
};

export default function CustomerDialog({ mode, customer, tab }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(customer?.name || '');
  const [contact, setContact] = useState(customer?.contact || '');
  const [remark, setRemark] = useState(customer?.remark || '');
  const [enableMin, setEnableMin] = useState(customer?.enableMinVolume !== 0);
  const [loading, setLoading] = useState(false);
  const isThb = tab === 'thb';

  const initPrices = (): Record<string, Record<string, number>> => {
    try {
      const key = isThb ? 'priceMatrixThb' : 'priceMatrix';
      const raw = customer?.[key];
      if (raw) {
        const parsed = JSON.parse(raw);
        // 检查是否按仓库格式存储：存在任意一个仓库键且值为对象
        const hasWarehouse = WAREHOUSES.some(wh => parsed[wh] && typeof parsed[wh] === 'object');
        if (hasWarehouse) {
          const result: Record<string, Record<string, number>> = {};
          for (const wh of WAREHOUSES) {
            result[wh] = {};
            for (const k of Object.keys(EMPTY_PRICES)) result[wh][k] = parsed[wh]?.[k] ?? 0;
          }
          return result;
        }
      }
      return JSON.parse(JSON.stringify(DEFAULT_PRICE_MATRIX));
    } catch { return JSON.parse(JSON.stringify(DEFAULT_PRICE_MATRIX)); }
  };

  const [prices, setPrices] = useState<Record<string, Record<string, number>>>(initPrices);
  const [activeWarehouse, setActiveWarehouse] = useState(WAREHOUSES[0]);

  const updatePrice = (key: string, value: string) => {
    const newPrices = { ...prices };
    newPrices[activeWarehouse] = { ...newPrices[activeWarehouse], [key]: parseFloat(value) || 0 };
    setPrices(newPrices);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const body: any = {
        id: customer?.id,
        name, contact, remark,
        enableMinVolume: enableMin ? 1 : 0,
        defaultCurrency: isThb ? 'THB' : 'CNY',
      };
      if (isThb) body.priceMatrixThb = JSON.stringify(prices);
      else body.priceMatrix = JSON.stringify(prices);

      const url = '/api/customers';
      if (mode === 'delete') {
        const res = await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: customer?.id }) });
        if (res.ok) { setOpen(false); router.refresh(); } else { alert('删除失败'); }
        return;
      }
      const method = mode === 'edit' ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { setOpen(false); router.refresh(); } else { alert('操作失败'); }
    } catch { alert('网络错误'); } finally { setLoading(false); }
  };

  const title = mode === 'create' ? '新建客户' : mode === 'delete' ? '删除客户' : '编辑客户';

  const form = (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>客户名称 *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>联系人</Label>
        <Input value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{isThb ? '泰铢价格 (THB/m³)' : '价格矩阵 (元/m³)'}</Label>
        <div className="flex gap-1 mb-2">
          {WAREHOUSES.map(w => (
            <Button key={w} type="button" variant={activeWarehouse === w ? 'default' : 'outline'} size="sm" onClick={() => setActiveWarehouse(w)}>{w}</Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(prices[activeWarehouse] || {}).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{PRICE_LABELS[key]}</Label>
              <Input type="text" inputMode="decimal" value={String(value)} onChange={(e) => updatePrice(key, e.target.value)} className="h-8 text-xs" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="enableMin" checked={enableMin} onCheckedChange={(v) => setEnableMin(!!v)} />
        <Label htmlFor="enableMin" className="text-sm">启用低消（海运 0.5 方 / 陆运 0.3 方）</Label>
      </div>
      <div className="space-y-2">
        <Label>备注</Label>
        <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} />
      </div>
    </div>
  );

  if (mode === 'create') {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button><Plus className="h-4 w-4 mr-2" />新建客户</Button>} />
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          {form}
          <Button onClick={handleSubmit} disabled={loading || !name} className="w-full">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}创建</Button>
        </DialogContent>
      </Dialog>
    );
  }

  if (mode === 'delete') {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="destructive" size="sm"><Trash2 className="h-4 w-4" /></Button>} />
        <DialogContent>
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          <p className="py-4">确定要删除客户 "{customer?.name}" 吗？此操作不可撤销。</p>
          <Button onClick={handleSubmit} disabled={loading} variant="destructive" className="w-full">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}确认删除</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm"><Pencil className="h-4 w-4" /></Button>} />
      <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {form}
        <Button onClick={handleSubmit} disabled={loading || !name} className="w-full">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}保存</Button>
      </DialogContent>
    </Dialog>
  );
}
