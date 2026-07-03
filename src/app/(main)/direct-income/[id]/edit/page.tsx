'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';

export default function EditDirectIncomePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const id = parseInt(String(params?.id || ''));
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
  const [customerId, setCustomerId] = useState<number>(0);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'CNY' | 'THB'>('CNY');
  const [volume, setVolume] = useState('');
  const [incomeDate, setIncomeDate] = useState('');
  const [remark, setRemark] = useState('');

  useEffect(() => {
    fetch('/api/customers').then(r => r.json()).then(setCustomers);
    fetch(`/api/direct-income/${id}`).then(r => {
      if (!r.ok) throw new Error('加载失败');
      return r.json();
    }).then((data) => {
      setCustomerId(data.customerId);
      setAmount(String(data.amountCents / 100));
      setCurrency(data.currency || 'CNY');
      setVolume(data.volume ? String(data.volume) : '');
      setIncomeDate(data.incomeDate || '');
      setRemark(data.remark || '');
    }).catch(() => alert('加载失败'));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/direct-income/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          amountCents: Math.round(parseFloat(amount || '0') * 100),
          currency,
          volume: parseFloat(volume || '0') || null,
          incomeDate,
          remark,
        }),
      });
      if (res.ok) router.push('/direct-income');
      else alert('更新失败');
    } catch {
      alert('网络错误');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">编辑直接收入</h1>
      <Card>
        <CardHeader><CardTitle>收入信息</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>客户</Label>
              <select className="h-8 w-full rounded-lg border px-2.5" value={customerId} onChange={(e) => setCustomerId(Number(e.target.value))}>
                {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>金额</Label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>币种</Label>
                <select className="h-8 w-full rounded-lg border px-2.5" value={currency} onChange={(e) => setCurrency(e.target.value as 'CNY' | 'THB')}>
                  <option value="CNY">CNY</option>
                  <option value="THB">THB</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>体积(m³)</Label>
                <Input value={volume} onChange={(e) => setVolume(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>日期</Label>
              <Input type="date" value={incomeDate} onChange={(e) => setIncomeDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Input value={remark} onChange={(e) => setRemark(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              保存修改
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
