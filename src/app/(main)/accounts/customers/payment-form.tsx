'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Customer {
  id: number;
  name: string;
  defaultCurrency: string | null;
}

interface Shipment {
  id: number;
  shipmentNo: string;
  customerId: number;
  totalReceivableCents: number;
  status: string;
  createdAt: string | null;
}

interface Allocation {
  id: number;
  paymentReceivedId: number;
  shipmentId: number;
  amountCents: number;
}

interface Props {
  customers: Customer[];
  shipments: Shipment[];
  allocations: Allocation[];
}

export default function PaymentForm({ customers, shipments, allocations }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [amountCents, setAmountCents] = useState('');
  const [amountYuan, setAmountYuan] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().substring(0, 10));
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedCustomerId = customerId ? parseInt(customerId) : 0;
  const unpaidShipments = shipments
    .filter((s) => s.customerId === selectedCustomerId && s.status !== '已结算')
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

  const handleAmountYuanChange = (value: string) => {
    setAmountYuan(value);
    const yuan = parseFloat(value) || 0;
    setAmountCents(String(Math.round(yuan * 100)));
  };

  // Preview FIFO allocation
  const previewAllocation = () => {
    if (!amountCents || unpaidShipments.length === 0) return [];
    let remaining = parseInt(amountCents);
    const preview: { shipmentNo: string; amount: number; unpaid: number }[] = [];

    for (const s of unpaidShipments) {
      if (remaining <= 0) break;
      const alreadyAllocated = allocations
        .filter((a) => a.shipmentId === s.id)
        .reduce((sum, a) => sum + a.amountCents, 0);
      const unpaid = s.totalReceivableCents - alreadyAllocated;
      if (unpaid > 0) {
        const alloc = Math.min(remaining, unpaid);
        preview.push({ shipmentNo: s.shipmentNo, amount: alloc, unpaid });
        remaining -= alloc;
      }
    }
    return preview;
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/payments/received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          amountCents: parseInt(amountCents),
          currency,
          receivedDate,
          remark,
        }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || '录入失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const preview = previewAllocation();
  const currencySymbol = currency === 'THB' ? '฿' : '¥';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          录入回款
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>录入客户回款</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>客户 *</Label>
              <Select value={customerId} onValueChange={(v) => setCustomerId(v || '')}>
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
              <Label>币种</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v || '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNY">CNY</SelectItem>
                  <SelectItem value="THB">THB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>金额 (元) *</Label>
              <Input type="number" step="0.01" value={amountYuan} onChange={(e) => handleAmountYuanChange(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>金额 (分)</Label>
              <Input value={amountCents} disabled />
            </div>
            <div className="space-y-2">
              <Label>回款日期 *</Label>
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>

          {preview.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">FIFO 分摊预览</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {preview.map((p, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{p.shipmentNo} (未收 {currencySymbol}{(p.unpaid / 100).toFixed(2)})</span>
                      <span className="font-medium">→ {currencySymbol}{(p.amount / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Button onClick={handleSubmit} disabled={loading || !customerId || !amountCents} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            确认录入
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
