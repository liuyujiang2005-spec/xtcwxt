'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
}

const WAREHOUSES = ['义乌仓', '广州仓', '东莞仓', '深圳仓'];

const EMPTY_PRICES = {
  sea_regular: 0,
  sea_inspection: 0,
  sea_sensitive: 0,
  land_regular: 0,
  land_inspection: 0,
  land_sensitive: 0,
};

const DEFAULT_PRICE_MATRIX: Record<string, Record<string, number>> = {};
for (const wh of WAREHOUSES) {
  DEFAULT_PRICE_MATRIX[wh] = { ...EMPTY_PRICES };
}

const PRICE_LABELS: Record<string, string> = {
  sea_regular: '海运 - 普货',
  sea_inspection: '海运 - 商检货',
  sea_sensitive: '海运 - 敏感货',
  land_regular: '陆运 - 普货',
  land_inspection: '陆运 - 商检货',
  land_sensitive: '陆运 - 敏感货',
};

export default function CustomerDialog({ mode, customer }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(customer?.name || '');
  const [contact, setContact] = useState(customer?.contact || '');
  const [defaultCurrency, setDefaultCurrency] = useState(customer?.defaultCurrency || 'CNY');
  const [remark, setRemark] = useState(customer?.remark || '');
  const [enableMin, setEnableMin] = useState(customer?.enableMinVolume !== 0);
  const [loading, setLoading] = useState(false);

  const initThbPrices = (): Record<string, Record<string, number>> => {
    try {
      if (customer?.priceMatrixThb) {
        const parsed = JSON.parse(customer.priceMatrixThb);
        if (parsed[WAREHOUSES[0]] && typeof parsed[WAREHOUSES[0]] === 'object') {
          const result: Record<string, Record<string, number>> = {};
          for (const wh of WAREHOUSES) {
            result[wh] = {};
            for (const k of Object.keys(EMPTY_PRICES)) {
              result[wh][k] = parsed[wh]?.[k] ?? 0;
            }
          }
          return result;
        }
      }
      return JSON.parse(JSON.stringify(DEFAULT_PRICE_MATRIX));
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_PRICE_MATRIX));
    }
  };

  const initPrices = (): Record<string, Record<string, number>> => {
    try {
      if (customer?.priceMatrix) {
        const parsed = JSON.parse(customer.priceMatrix);
        // 检查是否已经是新格式（有仓库 key）
        if (parsed[WAREHOUSES[0]] && typeof parsed[WAREHOUSES[0]] === 'object') {
          // 确保每个仓库都有完整的 6 个 key
          const result: Record<string, Record<string, number>> = {};
          for (const wh of WAREHOUSES) {
            result[wh] = {};
            for (const k of Object.keys(EMPTY_PRICES)) {
              result[wh][k] = parsed[wh]?.[k] ?? 0;
            }
          }
          return result;
        }
      }
      // 默认新格式
      return JSON.parse(JSON.stringify(DEFAULT_PRICE_MATRIX));
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_PRICE_MATRIX));
    }
  };
  const [prices, setPrices] = useState<Record<string, Record<string, number>>>(initPrices);
  const [thbPrices, setThbPrices] = useState<Record<string, Record<string, number>>>(initThbPrices);
  const [activeWarehouse, setActiveWarehouse] = useState(WAREHOUSES[0]);
  const [activeTab, setActiveTab] = useState<'cny' | 'thb'>('cny');

  const updatePrice = (key: string, value: string) => {
    const current = activeTab === 'cny' ? prices : thbPrices;
    const setter = activeTab === 'cny' ? setPrices : setThbPrices;
    const newPrices = { ...current };
    newPrices[activeWarehouse] = { ...newPrices[activeWarehouse], [key]: parseFloat(value) || 0 };
    setter(newPrices);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const body = {
        id: customer?.id,
        name,
        contact,
        priceMatrix: JSON.stringify(prices),
        priceMatrixThb: JSON.stringify(thbPrices),
        enableMinVolume: enableMin ? 1 : 0,
        defaultCurrency,
        remark,
      };

      const url = '/api/customers';
      const method = mode === 'edit' ? 'PUT' : 'POST';

      if (mode === 'delete') {
        const res = await fetch(url, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: customer?.id }),
        });
        if (res.ok) { setOpen(false); router.refresh(); } else { alert('删除失败'); }
        return;
      }

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { setOpen(false); router.refresh(); } else { alert('操作失败'); }
    } catch { alert('网络错误'); } finally { setLoading(false); }
  };

  const title = mode === 'create' ? '新建客户' : mode === 'delete' ? '删除客户' : '编辑客户';

  if (mode === 'create') {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger><Button><Plus className="h-4 w-4 mr-2" />新建客户</Button></DialogTrigger>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          <CustomerForm name={name} setName={setName} contact={contact} setContact={setContact}
            currency={defaultCurrency} setCurrency={setDefaultCurrency} remark={remark} setRemark={setRemark}
            prices={prices} thbPrices={thbPrices} updatePrice={updatePrice} activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse} activeTab={activeTab} setActiveTab={setActiveTab}
          enableMin={enableMin} setEnableMin={setEnableMin} />
          <Button onClick={handleSubmit} disabled={loading || !name} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}创建
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  if (mode === 'delete') {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger><Button variant="destructive" size="sm"><Trash2 className="h-4 w-4" /></Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          <p className="py-4">确定要删除客户 "{customer?.name}" 吗？此操作不可撤销。</p>
          <Button onClick={handleSubmit} disabled={loading} variant="destructive" className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}确认删除
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger><Button variant="outline" size="sm"><Pencil className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <CustomerForm name={name} setName={setName} contact={contact} setContact={setContact}
          currency={defaultCurrency} setCurrency={setDefaultCurrency} remark={remark} setRemark={setRemark}
          prices={prices} thbPrices={thbPrices} updatePrice={updatePrice} activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse} activeTab={activeTab} setActiveTab={setActiveTab}
          enableMin={enableMin} setEnableMin={setEnableMin} />
        <Button onClick={handleSubmit} disabled={loading || !name} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}保存
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({
  name, setName, contact, setContact, currency, setCurrency, remark, setRemark,
  prices, thbPrices, updatePrice, activeWarehouse, setActiveWarehouse, activeTab, setActiveTab, enableMin, setEnableMin,
}: {
  name: string; setName: (v: string) => void;
  contact: string; setContact: (v: string) => void;
  currency: string; setCurrency: (v: string) => void;
  remark: string; setRemark: (v: string) => void;
  prices: Record<string, Record<string, number>>;
  thbPrices: Record<string, Record<string, number>>;
  updatePrice: (k: string, v: string) => void;
  activeWarehouse: string; setActiveWarehouse: (v: string) => void;
  activeTab: string; setActiveTab: (v: any) => void;
  enableMin: boolean; setEnableMin: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>客户名称 *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>联系人</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>默认币种</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v || '')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CNY">CNY</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>价格矩阵 (元/m³)</Label>
        <div className="flex gap-1 mb-2">
            <Button type="button" variant={activeTab === 'cny' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('cny')}>人民币</Button>
            <Button type="button" variant={activeTab === 'thb' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('thb')}>泰铢</Button>
          </div>
          <div className="flex gap-1 mb-2">
          {WAREHOUSES.map(w => (
            <Button key={w} type="button" variant={activeWarehouse === w ? 'default' : 'outline'} size="sm" onClick={() => setActiveWarehouse(w)}>
              {w}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries((activeTab === 'cny' ? prices : thbPrices)[activeWarehouse] || {}).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{PRICE_LABELS[key]}</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={String(value)}
                onChange={(e) => updatePrice(key, e.target.value)}
                className="h-8 text-xs"
              />
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
}
