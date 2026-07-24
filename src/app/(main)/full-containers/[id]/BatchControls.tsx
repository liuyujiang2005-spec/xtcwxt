'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { formatAmount } from '@/lib/format';

type Batch = any;

export function BatchControls({ batch }: { batch: Batch }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const cur = batch.currency || 'CNY';

  const [应收, set应收] = useState(batch.整柜应收 != null ? String(batch.整柜应收) : '');
  const [货值, set货值] = useState(batch.货物申报价值 != null ? String(batch.货物申报价值) : '');
  const [柜型, set柜型] = useState(batch.柜型 || '');
  const [国内收货, set国内收货] = useState(batch.国内收货日期 || '');
  const [泰国到货, set泰国到货] = useState(batch.泰国到货日期 || '');
  const [payAmt, setPayAmt] = useState('');

  const put = async (body: any) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/full-containers/${batch.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || '保存失败'); return; }
      router.refresh();
    } catch { alert('网络错误'); } finally { setSaving(false); }
  };

  const 已付 = Number(batch.已付) || 0;
  const 剩余 = Number(batch.剩余 ?? batch.整柜应收 ?? 0);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* 金额 + 柜型 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">整柜金额 / 柜型</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1"><Label className="text-xs">整柜应收（手填一口价）</Label><Input value={应收} onChange={e => set应收(e.target.value)} className="h-8 w-32" placeholder="运费总价" /></div>
            <div className="space-y-1"><Label className="text-xs">货物申报价值（风控筹码）</Label><Input value={货值} onChange={e => set货值(e.target.value)} className="h-8 w-32" placeholder="货值" /></div>
            <div className="space-y-1"><Label className="text-xs">柜型</Label><Input value={柜型} onChange={e => set柜型(e.target.value)} className="h-8 w-24" placeholder="40HQ" /></div>
            <Button size="sm" disabled={saving} onClick={() => put({ 整柜应收: parseFloat(应收) || 0, 货物申报价值: parseFloat(货值) || 0, 柜型 })}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '保存'}</Button>
          </div>
          <div className="text-sm text-muted-foreground flex gap-4">
            <span>已付 <b className="text-green-600">{formatAmount(已付, cur)}</b></span>
            <span>剩余 <b className="text-orange-600">{formatAmount(剩余, cur)}</b></span>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1"><Label className="text-xs">记一笔收款</Label><Input value={payAmt} onChange={e => setPayAmt(e.target.value)} className="h-8 w-32" placeholder="本次收多少" /></div>
            <Button size="sm" variant="outline" disabled={saving || !payAmt} onClick={() => { put({ payAmount: parseFloat(payAmt) || 0 }); setPayAmt(''); }}>记收款</Button>
            <span className="text-xs text-muted-foreground pb-2">付清后自动记实付日期、算已结算</span>
          </div>
        </CardContent>
      </Card>

      {/* 4 日期节点 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">时间节点（风控依据）</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1"><Label className="text-xs">国内收货</Label><Input type="date" value={国内收货} onChange={e => set国内收货(e.target.value)} className="h-8 w-36" /></div>
            <div className="space-y-1"><Label className="text-xs">泰国到货 <span className="text-orange-600">(填=确认到货,在途→未结)</span></Label><Input type="date" value={泰国到货} onChange={e => set泰国到货(e.target.value)} className="h-8 w-36" /></div>
            <Button size="sm" disabled={saving} onClick={() => put({ 国内收货日期: 国内收货 || null, 泰国到货日期: 泰国到货 || null })}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '保存日期'}</Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>出账单日期：{batch.出账单日期 || '（生成请款单时自动记）'}</div>
            <div>实付日期：{batch.实付日期 || '（付清时自动记）'}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
