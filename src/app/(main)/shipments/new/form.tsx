'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Loader2 } from 'lucide-react';

interface Customer {
  id: number;
  name: string;
  priceMatrix: string | null;
  defaultCurrency: string | null;
}

interface Supplier {
  id: number;
  name: string;
  type: string | null;
}

interface CostItem {
  costType: string;
  amountYuan: string;
  amountCents: string;
  currency: string;
  supplierId: string;
  remark: string;
}

const COST_TYPES = [
  '国内拖车费', '装柜费', '报关费', '海运费', '清关费', 'THC', '文件费', '仓储费', '派送费', '杂费',
];

const PRICE_KEYS: Record<string, string> = {
  'sea-regular': 'sea_regular',
  'sea-inspection': 'sea_inspection',
  'sea-sensitive': 'sea_sensitive',
  'land-regular': 'land_regular',
  'land-inspection': 'land_inspection',
  'land-sensitive': 'land_sensitive',
};

export default function NewShipmentForm({ customers, suppliers }: { customers: Customer[]; suppliers: Supplier[] }) {
  const router = useRouter();

  const [customerId, setCustomerId] = useState('');
  const [shipmentType, setShipmentType] = useState('sea');
  const [goodsType, setGoodsType] = useState('regular');
  const [volume, setVolume] = useState('');
  const [unitPriceYuan, setUnitPriceYuan] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [blNo, setBlNo] = useState('');
  const [containerNo, setContainerNo] = useState('');
  const [etd, setEtd] = useState('');
  const [etaBkk, setEtaBkk] = useState('');
  const [status, setStatus] = useState('运输中');
  const [remark, setRemark] = useState('');
  const [costs, setCosts] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(false);

  const selectedCustomer = customers.find((c) => c.id === parseInt(customerId));
  const totalReceivable = (parseFloat(volume) || 0) * (parseFloat(unitPriceYuan) || 0) * 100;

  const handleCustomerChange = (value: string) => {
    setCustomerId(value);
    const cust = customers.find((c) => c.id === parseInt(value));
    if (cust?.defaultCurrency) setCurrency(cust.defaultCurrency);
    updatePrice(value, shipmentType, goodsType);
  };

  const updatePrice = (cid: string, stype: string, gtype: string) => {
    const cust = customers.find((c) => c.id === parseInt(cid));
    if (!cust?.priceMatrix) return;
    try {
      const matrix = JSON.parse(cust.priceMatrix);
      const key = `${stype}-${gtype}`;
      const priceKey = PRICE_KEYS[key];
      if (priceKey && matrix[priceKey] !== undefined) {
        setUnitPriceYuan(String(matrix[priceKey]));
      }
    } catch {}
  };

  const handleTypeOrGoodsChange = (field: string, value: string) => {
    if (field === 'shipmentType') setShipmentType(value);
    if (field === 'goodsType') setGoodsType(value);
    const st = field === 'shipmentType' ? value : shipmentType;
    const gt = field === 'goodsType' ? value : goodsType;
    updatePrice(customerId, st, gt);
  };

  const addCost = () => {
    setCosts([...costs, { costType: '', amountYuan: '', amountCents: '', currency: 'CNY', supplierId: '', remark: '' }]);
  };

  const removeCost = (index: number) => {
    setCosts(costs.filter((_, i) => i !== index));
  };

  const updateCost = (index: number, field: keyof CostItem, value: string) => {
    const newCosts = [...costs];
    newCosts[index] = { ...newCosts[index], [field]: value };
    if (field === 'amountYuan') {
      newCosts[index].amountCents = String(Math.round(parseFloat(value || '0') * 100));
    }
    setCosts(newCosts);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const body = {
        customerId: parseInt(customerId),
        shipmentType,
        goodsType,
        volume: parseFloat(volume),
        unitPriceCents: Math.round(parseFloat(unitPriceYuan) * 100),
        totalReceivableCents: Math.round(totalReceivable),
        currency,
        status,
        blNo,
        containerNo,
        etd,
        etaBkk,
        remark,
        costs: costs.map((c) => ({
          costType: c.costType,
          amountCents: parseInt(c.amountCents) || 0,
          currency: c.currency,
          supplierId: c.supplierId ? parseInt(c.supplierId) : null,
          remark: c.remark,
        })),
      };

      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.push('/shipments');
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || '创建失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>客户 *</Label>
              <Select value={customerId} onValueChange={(v) => handleCustomerChange(v || '')} required>
                <SelectTrigger>
                  <SelectValue placeholder="选择客户" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>运输方式 *</Label>
              <Select value={shipmentType} onValueChange={(v) => handleTypeOrGoodsChange('shipmentType', v || '')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sea">海运</SelectItem>
                  <SelectItem value="land">陆运</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>货物类型 *</Label>
              <Select value={goodsType} onValueChange={(v) => handleTypeOrGoodsChange('goodsType', v || '')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">普货</SelectItem>
                  <SelectItem value="inspection">商检货</SelectItem>
                  <SelectItem value="sensitive">敏感货</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>币种</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v || '')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNY">CNY</SelectItem>
                  <SelectItem value="THB">THB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>体积 (m³) *</Label>
              <Input type="number" step="0.01" value={volume} onChange={(e) => setVolume(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>单价 (元/方) *</Label>
              <Input type="number" step="0.01" value={unitPriceYuan} onChange={(e) => setUnitPriceYuan(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>提单号</Label>
              <Input value={blNo} onChange={(e) => setBlNo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>柜号</Label>
              <Input value={containerNo} onChange={(e) => setContainerNo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>ETD (预计离港)</Label>
              <Input type="date" value={etd} onChange={(e) => setEtd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>ETA BKK (预计到曼谷)</Label>
              <Input type="date" value={etaBkk} onChange={(e) => setEtaBkk(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select value={status} onValueChange={(v) => setStatus(v || '')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="运输中">运输中</SelectItem>
                  <SelectItem value="已到仓">已到仓</SelectItem>
                  <SelectItem value="已签收">已签收</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">应收金额:</span>
            <span className="text-xl font-bold">
              ¥{(totalReceivable / 100).toFixed(2)}
            </span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">成本明细</h3>
              <Button type="button" variant="outline" size="sm" onClick={addCost}>
                <Plus className="h-4 w-4 mr-1" /> 添加成本
              </Button>
            </div>
            {costs.map((cost, idx) => (
              <div key={idx} className="grid grid-cols-5 gap-2 items-end p-3 border rounded-lg relative">
                <div className="space-y-1">
                  <Label className="text-xs">费用类型</Label>
                  <Select value={cost.costType} onValueChange={(v) => updateCost(idx, 'costType', v || '')}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="选择" />
                    </SelectTrigger>
                    <SelectContent>
                      {COST_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">金额(元)</Label>
                  <Input type="number" step="0.01" className="h-8 text-xs" value={cost.amountYuan}
                    onChange={(e) => updateCost(idx, 'amountYuan', e.target.value)} />
                  {cost.amountCents && (
                    <p className="text-[10px] text-muted-foreground">{cost.amountCents} 分</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">币种</Label>
                  <Select value={cost.currency} onValueChange={(v) => updateCost(idx, 'currency', v || '')}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CNY">CNY</SelectItem>
                      <SelectItem value="THB">THB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">供应商</Label>
                  <Select value={cost.supplierId} onValueChange={(v) => updateCost(idx, 'supplierId', v || '')}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="选择供应商" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => removeCost(idx)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              创建票货
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>取消</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
