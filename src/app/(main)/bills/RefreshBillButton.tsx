'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

export function RefreshBillButton({ billId }: { billId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    const r = await fetch('/api/bills', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: billId, recalculate: true }),
    });
    if (r.ok) {
      router.refresh();
    } else {
      const e = await r.json().catch(() => ({ error: '刷新失败' }));
      alert(e.error || '刷新失败');
    }
    setLoading(false);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
    </Button>
  );
}
