'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus } from 'lucide-react';

interface Customer {
  id: number;
  name: string;
}

const WAREHOUSES = ['义乌仓', '广州仓', '东莞仓', '深圳仓'];

export function NewIncomeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [volume, setVolume] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().substring(0, 10));
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && customers.length === 0) {
      fetch('/api/customers')
        .then(r => r.json())
        .then(data => setCustomers(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!customerId || !amount) return;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { alert('请填写有效金额'); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/direct-income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: parseInt(customerId),
          amount: parseFloat(amount),
          currency,
          warehouse,
          volume: volume ? parseFloat(volume) : null,
          incomeDate,
          remark,
        }),
      });
      if (r.ok) {
        setOpen(false);
        setCustomerId('');
        setAmount('');
        setVolume('');
        setWarehouse('');
        setRemark('');
        router.refresh();
      } else {
        const err = await r.json().catch(() => ({ error: '创建失败' }));
        alert(err.error || '创建失败');
      }
    } catch {
      alert('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button><Plus className="h-4 w-4 mr-2" />新建收入</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>新建收入</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>客户 *</Label>
            <Select value={customerId} onValueChange={v => setCustomerId(v || '')}>
              <SelectTrigger><SelectValue placeholder="请选择客户" /></SelectTrigger>
              <SelectContent>
                {customers.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>金额 *</Label>
              <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>币种</Label>
              <Select value={currency} onValueChange={v => setCurrency(v || 'CNY')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNY">CNY</SelectItem>
                  <SelectItem value="THB">THB</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>体积 (m³)</Label>
            <Input type="number" step="0.000001" value={volume} onChange={e => setVolume(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>仓库</Label>
            <Select value={warehouse} onValueChange={v => setWarehouse(v || '')}>
              <SelectTrigger><SelectValue placeholder="选择仓库" /></SelectTrigger>
              <SelectContent>
                {WAREHOUSES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>日期</Label>
            <Input type="date" value={incomeDate} onChange={e => setIncomeDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Input value={remark} onChange={e => setRemark(e.target.value)} />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={loading || !customerId || !amount}
            className="w-full"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            创建
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
