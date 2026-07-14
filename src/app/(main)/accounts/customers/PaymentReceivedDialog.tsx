'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus } from 'lucide-react';

export function PaymentReceivedDialog({ customerId, customerName, marks }: {
  customerId: number;
  customerName: string;
  marks: { id: number; markNo: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().substring(0, 10));
  const [markId, setMarkId] = useState('');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // 🔵修复：parseFloat('abc') 返回 NaN，用 Number() + isNaN 更严格
    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) { alert('请输入有效金额'); return; }
    if (!receivedDate) { alert('请选择日期'); return; }

    setSaving(true);
    try {
      const r = await fetch('/api/payments/received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          markId: markId ? parseInt(markId) : null,
          amount: amountNum,
          currency,
          receivedDate,
          remark: remark || null,
        }),
      });
      if (r.ok) {
        setOpen(false);
        setAmount(''); setRemark(''); setMarkId('');
        router.refresh();
      } else {
        const e = await r.json().catch(() => ({ error: '保存失败' }));
        alert(e.error);
      }
    } catch { alert('保存失败'); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1" />录入回款</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>录入回款 - {customerName}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>回款金额</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="flex-1"
              />
              <select className="h-9 rounded-lg border px-2 text-sm" value={currency} onChange={e => setCurrency(e.target.value)}>
                <option value="CNY">CNY</option>
                <option value="THB">THB</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>回款日期</Label>
            <Input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
          </div>
          {marks.length > 0 && (
            <div className="space-y-2">
              <Label>关联唛头（可选）</Label>
              <select className="h-9 w-full rounded-lg border px-2 text-sm" value={markId} onChange={e => setMarkId(e.target.value)}>
                <option value="">不关联</option>
                {marks.map(m => <option key={m.id} value={m.id}>{m.markNo}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label>备注</Label>
            <Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="可选" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            确认录入
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
