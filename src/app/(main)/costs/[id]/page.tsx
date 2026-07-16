'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, AlertTriangle, RefreshCw } from 'lucide-react';
import Link from 'next/link';

const EXPENSE_TYPES = ['人工卸货费', '义乌成本', '装柜费', '报关费', '运费', '清关费', '尾端派送费'];

export default function EditCostPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [expenseType, setExpenseType] = useState('');
  const [amountYuan, setAmountYuan] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [id, setId] = useState('');

  useEffect(() => {
    params.then(p => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetch(`/api/expenses/${id}`)
      .then(r => { if (!r.ok) throw new Error('加载失败'); return r.json(); })
      .then(data => {
        setExpenseType(data.expenseType || '');
        setAmountYuan(String(data.amount || ''));
        setCurrency(data.currency || 'CNY');
        setRemark(data.remark || '');
      })
      .catch(() => setFetchError(true))
      .finally(() => setFetching(false));
    return () => controller.abort();
  }, [id, retryCount]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseType,
          amount: parseFloat(amountYuan || '0'),
          currency,
          remark,
        }),
      });
      if (res.ok) {
        router.push('/costs');
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({ error: '保存失败' }));
        alert(err.error || '保存失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (fetchError) {
    const retry = () => { setFetchError(false); setFetching(true); setRetryCount(c => c + 1); };
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <AlertTriangle className="h-10 w-10 text-yellow-500" />
        <p className="text-muted-foreground">加载失败，请重试</p>
        <Button variant="outline" onClick={retry}>
          <RefreshCw className="h-4 w-4 mr-2" />重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/costs"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <h1 className="text-2xl font-bold">编辑费用</h1>
      </div>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label>费用类型 *</Label>
            <Select value={expenseType} onValueChange={(v) => setExpenseType(v || '')}>
              <SelectTrigger><SelectValue placeholder="选择费用类型" /></SelectTrigger>
              <SelectContent>
                {EXPENSE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            <Label>备注</Label>
            <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
          <Button onClick={handleSubmit} disabled={loading || !expenseType || !amountYuan} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            保存修改
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
