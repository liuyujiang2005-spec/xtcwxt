'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export function PaymentForm({ billId, currentPaid, currentStatus }: { billId: number; currentPaid: number; currentStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [paidAmount, setPaidAmount] = useState(String(currentPaid || ''));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/bills/pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId, paymentStatus: status, paidAmount: parseFloat(paidAmount) || 0 }),
      });
      router.refresh();
    } catch { alert('保存失败'); }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">付款状态</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-end gap-4">
          <div className="space-y-2">
            <Label>状态</Label>
            <select className="h-8 rounded-lg border px-2.5 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="待付款">待付款</option>
              <option value="付一部分">付一部分</option>
              <option value="已付款">已付款</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>已付金额</Label>
            <Input type="number" step="0.01" className="h-8 w-32" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
          </div>
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}保存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
