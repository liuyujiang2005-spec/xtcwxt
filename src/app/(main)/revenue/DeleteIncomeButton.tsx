'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';

export function DeleteIncomeButton({ incomeId }: { incomeId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const handleDelete = async () => {
    if (!confirm('确认删除？')) return;
    setLoading(true);
    try {
      const r = await fetch('/api/direct-income/' + incomeId, { method: 'DELETE' });
      if (r.ok) router.refresh(); else alert('删除失败');
    } catch { alert('网络错误，请重试'); }
    setLoading(false);
  };
  return <Button variant="ghost" size="sm" onClick={handleDelete} disabled={loading}>{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-red-500" />}</Button>;
}
