'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';

export function DeleteBatchButton({ batchId, apiPath }: { batchId: number; apiPath: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('确认删除该批次及所有关联明细？此操作不可撤销。')) return;
    setDeleting(true);
    try {
      const r = await fetch(`${apiPath}/${batchId}`, { method: 'DELETE' });
      if (r.ok) { router.refresh(); } else { const e = await r.json().catch(()=>({error:'删除失败'})); alert(e.error); }
    } catch { alert('删除失败'); setDeleting(false); }
  };

  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDelete} disabled={deleting}>
      {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-red-500" />}
    </Button>
  );
}
