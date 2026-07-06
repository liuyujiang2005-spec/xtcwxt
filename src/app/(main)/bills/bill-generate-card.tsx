'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, FilePlus } from 'lucide-react';

export default function BillGenerateCard() {
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
  const [customerId, setCustomerId] = useState<number>(0);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/customers').then(r => r.json()).then(setCustomers).catch(() => {});
    setMonth(new Date().toISOString().substring(0, 7));
  }, []);

  const handleGenerate = async () => {
    if (!customerId || !month) return;
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, monthTag: month }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`账单${data.isUpdate ? '已更新' : '已生成'}！共 ${data.itemCount} 条明细，合计 ${(Number(data.totalCents || 0)).toFixed(2)} CNY`);
      } else {
        setMsg(data.error || '生成失败');
      }
    } catch {
      setMsg('网络错误');
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader><CardTitle>生成账单</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-4">
          <div className="space-y-2">
            <Label>选择客户</Label>
            <select
              className="h-8 w-48 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={customerId}
              onChange={(e) => setCustomerId(Number(e.target.value))}
            >
              <option value={0}>-- 请选择 --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>月份</Label>
            <input
              type="month"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <Button onClick={handleGenerate} disabled={loading || !customerId || !month}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FilePlus className="h-4 w-4 mr-2" />}
            {loading ? '生成中...' : '生成账单'}
          </Button>
        </div>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </CardContent>
    </Card>
  );
}
