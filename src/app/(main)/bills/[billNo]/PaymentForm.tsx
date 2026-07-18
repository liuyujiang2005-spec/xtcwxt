'use client';
import { formatAmount } from '@/lib/format';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export function PaymentForm({ billId, totalAmount, currentPaid, currentStatus, currency }: {
  billId: number;
  totalAmount: number;
  currentPaid: number;
  currentStatus: string;
  currency?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [paidAmount, setPaidAmount] = useState(String(currentPaid || ''));
  const [saving, setSaving] = useState(false);

  const paidNum = parseFloat(paidAmount) || 0;
  const remaining = Math.max(0, totalAmount - paidNum);

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    if (newStatus === '已付款') {
      setPaidAmount(String(totalAmount));
    }
  };

  const save = async () => {
    if (status === '付一部分' && (paidNum <= 0 || paidNum >= totalAmount)) {
      alert('付一部分时，已付金额必须大于0且小于总金额');
      return;
    }
    if (status === '已付款' && paidNum < totalAmount) {
      alert('已付款时，已付金额不能小于总金额');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/bills/pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId, paymentStatus: status, paidAmount: paidNum }),
      });
      if (r.ok) { router.refresh(); } else { const e = await r.json().catch(()=>({error:'保存失败'})); alert(e.error); }
    } catch { alert('保存失败'); }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">付款状态</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-end gap-4 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">状态</Label>
            <select className="h-8 rounded-lg border px-2.5 text-sm" value={status} onChange={e => handleStatusChange(e.target.value)}>
              <option value="待付款">待付款</option>
              <option value="付一部分">付一部分</option>
              <option value="已付款">已付款</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">已付金额</Label>
            <Input
              type="number" step="0.01" min="0" max={totalAmount}
              className="h-8 w-36"
              value={paidAmount}
              onChange={e => setPaidAmount(e.target.value)}
              disabled={status === '已付款'}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">剩余金额</Label>
            <div className="h-8 flex items-center text-sm font-bold text-orange-600">{formatAmount(remaining, currency === 'THB' ? 'THB' : 'CNY')}</div>
          </div>
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}保存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
