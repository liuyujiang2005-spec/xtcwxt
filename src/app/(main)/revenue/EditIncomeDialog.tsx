'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Pencil } from 'lucide-react';

export function EditIncomeDialog({ income }: { income: any }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(income.amount ?? ''));
  const [currency, setCurrency] = useState(income.currency || 'CNY');
  const [volume, setVolume] = useState(String(income.volume || ''));
  const [incomeDate, setIncomeDate] = useState(income.incomeDate);
  const [remark, setRemark] = useState(income.remark || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { alert('请填写有效金额'); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/direct-income/' + income.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: income.customerId, amount: parseFloat(amount), currency, volume: volume ? parseFloat(volume) : null, incomeDate, remark }),
      });
      if (r.ok) { setOpen(false); router.refresh(); } else { alert('保存失败'); }
    } catch { alert('网络错误，请重试'); }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>编辑收入</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>金额</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div className="space-y-2"><Label>币种</Label><Select value={currency} onValueChange={v => setCurrency(v || 'CNY')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CNY">CNY</SelectItem><SelectItem value="THB">THB</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>体积</Label><Input type="number" step="0.000001" value={volume} onChange={e => setVolume(e.target.value)} /></div>
          <div className="space-y-2"><Label>日期</Label><Input type="date" value={incomeDate} onChange={e => setIncomeDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>备注</Label><Input value={remark} onChange={e => setRemark(e.target.value)} /></div>
          <Button onClick={handleSave} disabled={loading} className="w-full">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
