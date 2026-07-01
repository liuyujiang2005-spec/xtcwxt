'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus } from 'lucide-react';

interface Supplier {
  id: number;
  name: string;
}

interface UnpaidCost {
  id: number;
  costType: string;
  amountCents: number;
  currency: string;
  shipmentNo: string;
  shipmentId: number;
  supplierId: number;
}

export default function SupplierPaymentForm({ suppliers, unpaidCosts }: { suppliers: Supplier[]; unpaidCosts: UnpaidCost[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [amountYuan, setAmountYuan] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [paidDate, setPaidDate] = useState(new Date().toISOString().substring(0, 10));
  const [remark, setRemark] = useState('');
  const [selectedCostIds, setSelectedCostIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const supplierCosts = useMemo(() => {
    return unpaidCosts.filter((c) => c.supplierId === parseInt(supplierId));
  }, [unpaidCosts, supplierId]);

  const selectedSum = useMemo(() => {
    return unpaidCosts
      .filter((c) => selectedCostIds.includes(c.id))
      .reduce((sum, c) => sum + c.amountCents, 0);
  }, [unpaidCosts, selectedCostIds]);

  const toggleCost = (id: number) => {
    setSelectedCostIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedCostIds.length === supplierCosts.length) {
      setSelectedCostIds([]);
    } else {
      setSelectedCostIds(supplierCosts.map((c) => c.id));
    }
  };

  const handleSupplierChange = (v: string | null) => {
    setSupplierId(v || '');
    setSelectedCostIds([]);
    setAmountYuan('');
  };

  const amountCents = Math.round(parseFloat(amountYuan || '0') * 100);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const selectedCosts = unpaidCosts.filter((c) => selectedCostIds.includes(c.id));

      if (selectedCosts.length > 0) {
        for (const cost of selectedCosts) {
          await fetch('/api/payments/made', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              supplierId: parseInt(supplierId),
              amountCents: cost.amountCents,
              currency: cost.currency,
              paidDate,
              shipmentId: cost.shipmentId,
              costType: cost.costType,
              remark,
            }),
          });
        }
      } else {
        await fetch('/api/payments/made', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supplierId: parseInt(supplierId),
            amountCents,
            currency,
            paidDate,
            remark,
          }),
        });
      }

      setOpen(false);
      router.refresh();
    } catch {
      alert('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          付款录入
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>对供应商付款录入</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>供应商 *</Label>
            <Select value={supplierId} onValueChange={handleSupplierChange}>
              <SelectTrigger><SelectValue placeholder="选择供应商" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {supplierId && supplierCosts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>关联费用</Label>
                <Button type="button" variant="ghost" size="sm" onClick={handleSelectAll}>
                  {selectedCostIds.length === supplierCosts.length ? '取消全选' : '全选'}
                </Button>
              </div>
              <div className="border rounded-lg max-h-48 overflow-auto">
                {supplierCosts.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 p-2 hover:bg-muted cursor-pointer border-b last:border-0"
                  >
                    <Checkbox
                      checked={selectedCostIds.includes(c.id)}
                      onCheckedChange={() => toggleCost(c.id)}
                    />
                    <span className="text-sm flex-1">
                      {c.shipmentNo} · {c.costType}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {c.currency === 'THB' ? '฿' : '¥'}{(c.amountCents / 100).toFixed(2)}
                    </span>
                  </label>
                ))}
              </div>
              {selectedSum > 0 && (
                <p className="text-xs text-muted-foreground">
                  已选费用合计: {currency === 'THB' ? '฿' : '¥'}{(selectedSum / 100).toFixed(2)}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>金额 (元) *</Label>
              <Input type="number" step="0.01" value={amountYuan} onChange={(e) => setAmountYuan(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>币种</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v || '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNY">CNY</SelectItem>
                  <SelectItem value="THB">THB</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>付款日期 *</Label>
            <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Input value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
          <Button onClick={handleSubmit} disabled={loading || !supplierId || (selectedCostIds.length === 0 && !amountYuan)} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            确认录入
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
