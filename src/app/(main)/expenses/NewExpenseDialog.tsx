'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus } from 'lucide-react';

const EXPENSE_TYPES = ['人工卸货费', '义乌成本', '运费', '清关费', '尾端派送费'];

export function NewExpenseDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expenseType, setExpenseType] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [warehouse, setWarehouse] = useState('');
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!expenseType || !amount) return;
    setLoading(true);
    try {
      const r = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseType, amount: parseFloat(amount), currency, warehouse, remark }),
      });
      if (r.ok) { setOpen(false); router.refresh(); } else { alert('创建失败'); }
    } catch { alert('网络错误，请重试'); }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setExpenseType(''); setAmount(''); setWarehouse(''); setRemark(''); } }}>
      <DialogTrigger>
        <Button><Plus className="h-4 w-4 mr-2" />新建费用</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>新建费用</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>费用类型 *</Label>
            <Select value={expenseType} onValueChange={v => setExpenseType(v || '')}>
              <SelectTrigger><SelectValue placeholder="选择费用类型" /></SelectTrigger>
              <SelectContent>
                {EXPENSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>金额 *</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
            <div className="space-y-2"><Label>币种</Label><Select value={currency} onValueChange={v => setCurrency(v || 'CNY')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CNY">CNY</SelectItem><SelectItem value="THB">THB</SelectItem></SelectContent></Select></div>
          </div>
          <div className="space-y-2">
            <Label>仓库</Label>
            <Select value={warehouse} onValueChange={v => setWarehouse(v || '')}>
              <SelectTrigger><SelectValue placeholder="选择仓库" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="义乌仓">义乌仓</SelectItem>
                <SelectItem value="广州仓">广州仓</SelectItem>
                <SelectItem value="东莞仓">东莞仓</SelectItem>
                <SelectItem value="深圳仓">深圳仓</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>备注</Label><Input value={remark} onChange={e => setRemark(e.target.value)} /></div>
          <Button onClick={handleSubmit} disabled={loading || !expenseType || !amount} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}创建
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
