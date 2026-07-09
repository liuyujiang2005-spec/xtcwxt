'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

export function RefreshMetricsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/customers/refresh-metrics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (r.ok) {
        alert(`已刷新 ${data.refreshed} 个客户的评分`);
        router.refresh();
      } else {
        alert(data.error || '刷新失败');
      }
    } catch { alert('刷新失败'); }
    setLoading(false);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
      刷新评分
    </Button>
  );
}
