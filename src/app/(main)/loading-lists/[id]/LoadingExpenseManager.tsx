'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, Loader2 } from 'lucide-react';

const EXPENSE_TYPES = ['报关费', '拖车费', '文件费', '操作费', 'THC', '订舱费', '其他'];

export function LoadingExpenseManager({
  batchId,
  initialExpenses,
}: {
  batchId: number;
  initialExpenses: { id: number; expenseType: string; amount: number; currency: string; status: string }[];
}) {
  const router = useRouter();
  const expenseMap = new Map(initialExpenses.map((e) => [e.expenseType, e]));
  const [entries, setEntries] = useState<Record<string, { amount: string; currency: string; status: string }>>(() => {
    const map: Record<string, any> = {};
    for (const type of EXPENSE_TYPES) {
      const existing = expenseMap.get(type);
      map[type] = {
        amount: existing ? String(existing.amount) : '',
        currency: existing?.currency || 'CNY',
        status: existing?.status || '待支付',
      };
    }
    return map;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async (expenseType: string) => {
    const entry = entries[expenseType];
    const amount = Math.round(parseFloat(entry.amount || '0'));
    const existing = expenseMap.get(expenseType);

    setSaving(true);
    try {
      if (existing) {
        await fetch(`/api/expenses/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, currency: entry.currency }),
        });
      } else if (amount > 0) {
        await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loadingBatchId: batchId, expenseType, amount, currency: entry.currency }),
        });
      }
    } catch {
      alert('保存失败，请重试');
    }
    setSaving(false);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader><CardTitle>费用管理</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {EXPENSE_TYPES.map((type) => {
            const entry = entries[type];
            return (
              <div key={type} className="flex items-center gap-3">
                <span className="w-16 text-sm font-medium">{type}</span>
                <div className="flex-1 flex items-center gap-2">
                  <Input
                    type="number" step="0.01" placeholder="0.00"
                    className="h-8 w-28"
                    value={entry.amount}
                    onChange={(e) => setEntries({ ...entries, [type]: { ...entry, amount: e.target.value } })}
                  />
                  <select
                    className="h-8 w-16 rounded-lg border border-input bg-transparent px-2 text-sm"
                    value={entry.currency}
                    onChange={(e) => setEntries({ ...entries, [type]: { ...entry, currency: e.target.value } })}
                  >
                    <option value="CNY">CNY</option>
                    <option value="THB">THB</option>
                  </select>
                  <span className={`text-xs px-2 py-1 rounded ${entry.status === '已支付' ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {entry.status}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleSave(type)} disabled={saving}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
