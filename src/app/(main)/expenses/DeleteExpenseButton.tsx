'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';

export function DeleteExpenseButton({ expenseId }: { expenseId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm('确定要删除这条费用记录吗？')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/expenses/${expenseId}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({ error: '删除失败' }));
        alert(err.error || '删除失败');
      }
    } catch {
      alert('网络错误');
    }
    setLoading(false);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-red-500" />}
    </Button>
  );
}
