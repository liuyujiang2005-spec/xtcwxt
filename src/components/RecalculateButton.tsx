'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

export function RecalculateButton({ batchId, apiPath }: { batchId: number; apiPath: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const recalculate = async () => {
    if (!confirm('确认重算？将按当前客户价格矩阵和低消设置重新计算所有应收。')) return;
    setLoading(true);
    try {
      const r = await fetch(`${apiPath}/${batchId}/recalculate`, { method: 'POST' });
      if (r.ok) {
        const d = await r.json();
        alert(d.message || '重算完成');
        router.refresh();
      } else {
        const e = await r.json().catch(() => ({ error: '操作失败' }));
        alert(e.error);
      }
    } catch {
      alert('操作失败');
    }
    setLoading(false);
  };

  return (
    <Button size="sm" variant="outline" onClick={recalculate} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
      重算应收
    </Button>
  );
}
