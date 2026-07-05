'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export function ReviewActions({ batchId, apiPath, listPath }: { batchId: number; apiPath: string; listPath: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<'publish' | 'reject' | null>(null);

  const publish = async () => {
    if (!confirm('确认发布？发布后数据正式生效。')) return;
    setLoading('publish');
    try {
      await fetch(`${apiPath}/${batchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: '已发布' }),
      });
      router.refresh();
    } catch { alert('操作失败'); }
    setLoading(null);
  };

  const reject = async () => {
    if (!confirm('确认退回？将删除该批次及所有关联明细，不可恢复。')) return;
    setLoading('reject');
    try {
      await fetch(`${apiPath}/${batchId}`, { method: 'DELETE' });
      router.push(listPath);
    } catch { alert('操作失败'); }
    setLoading(null);
  };

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={publish} disabled={!!loading} variant="default">
        {loading === 'publish' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
        发布
      </Button>
      <Button size="sm" onClick={reject} disabled={!!loading} variant="destructive">
        {loading === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
        退回
      </Button>
    </div>
  );
}
