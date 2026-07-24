'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

// 编辑某客户的整柜风控倍数(每1在途柜允许几个未结算柜)
export function RatioInput({ customerId, value }: { customerId: number; value: number }) {
  const router = useRouter();
  const [v, setV] = useState(String(value));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 0) { alert('倍数必须是非负整数'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/customers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: customerId, 整柜风控倍数: n }) });
      if (!r.ok) { alert('保存失败'); return; }
      router.refresh();
    } catch { alert('网络错误'); } finally { setSaving(false); }
  };

  return (
    <span className="inline-flex items-center gap-1">
      1 :
      <Input value={v} onChange={e => setV(e.target.value)} className="h-7 w-14 text-center px-1" />
      <Button size="icon" variant="ghost" className="h-6 w-6" disabled={saving} onClick={save}>{saving ? <Loader2 className="h-3 w-3 animate-spin" /> : '✓'}</Button>
    </span>
  );
}
