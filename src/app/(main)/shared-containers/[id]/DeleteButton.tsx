'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';

export function DeleteItemButton({ itemId, apiPath }: { itemId: number; apiPath: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('确认删除这条明细？')) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiPath}/${itemId}`, { method: 'DELETE' });
      if (!res.ok) { alert('删除失败'); setDeleting(false); return; }
      router.refresh();
      setDeleting(false);
    } catch { alert('删除失败'); setDeleting(false); }
  };

  return (
    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDelete} disabled={deleting}>
      {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-red-500" />}
    </Button>
  );
}
