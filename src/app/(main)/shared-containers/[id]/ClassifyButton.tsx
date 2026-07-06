'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { BarChart3, Loader2 } from 'lucide-react';

export function ClassifyButton({ batchId, type = 'shared-container' }: { batchId: number; type?: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const classify = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai/classify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, type }),
      });
      const data = await res.json();
      if (res.ok) {
        const lines = [
          `共 ${data.summary?.totalItems || 0} 条，${(data.summary?.totalVolume || 0).toFixed(2)} m³`,
          ...(data.byCustomer || []).map((c: any) => `${c.customer}: ${c.count}条 ${c.volume?.toFixed(2) || 0}m³ ¥${c.total}`),
        ];
        setResult(lines.join('\n'));
      } else {
        setResult(data.error || '分类失败');
      }
    } catch { setResult('网络错误'); }
    setLoading(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={classify} disabled={loading}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <BarChart3 className="h-3.5 w-3.5 mr-1" />}
        分类统计
      </Button>
      {result && <pre className="text-xs bg-muted p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">{result}</pre>}
    </div>
  );
}
