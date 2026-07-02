'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

const EXPENSE_TYPES = ['人工卸货费', '义乌成本', '装柜费', '报关费', '运费', '清关费', '尾端派送费'];

export default function NewCostPage() {
  const router = useRouter();
  const [expenseType, setExpenseType] = useState('');
  const [amountYuan, setAmountYuan] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [supplierId, setSupplierId] = useState('');
  const [remark, setRemark] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/suppliers').then((r) => r.json()).then(setSuppliers);
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseType,
          amountCents: Math.round(parseFloat(amountYuan || '0') * 100),
          currency,
          supplierId: supplierId ? parseInt(supplierId) : null,
          remark,
        }),
      });
      if (res.ok) {
        router.push('/costs');
        router.refresh();
      } else {
        alert('创建失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">新建费用</h1>
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
            <Label>供应商</Label>
            <Select value={supplierId} onValueChange={(v) => setSupplierId(v || '')}>
              <SelectTrigger><SelectValue placeholder="选择供应商" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
          <Button onClick={handleSubmit} disabled={loading || !expenseType || !amountYuan} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            创建费用
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
