'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, Loader2 } from 'lucide-react';

const EXPENSE_TYPES = ['报关费', '拖车费', '文件费', '操作费', 'THC', '订舱费', '装柜费', '国内段全包价', '泰国端全包价', '其他'];

export function LoadingExpenseManager({
  batchId,
  initialExpenses,
}: {
  batchId: number;
  initialExpenses: { id: number; expenseType: string; amount: number; currency: string; status: string }[];
}) {
  const router = useRouter();
  const expenseMap = new Map(initialExpenses.map((e) => [e.expenseType, e]));
  const [saving, setSaving] = useState(false);
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

  const handleSaveAll = async () => {
    setSaving(true);
    const updatedMap = new Map(expenseMap);
    try {
      for (const type of EXPENSE_TYPES) {
        const entry = entries[type];
        const amount = parseFloat(entry.amount || '0');
        const existing = updatedMap.get(type);

        if (existing) {
          const res = await fetch(`/api/expenses/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, currency: entry.currency }),
          });
          if (!res.ok) throw new Error('保存失败');
        } else if (amount > 0) {
          const res = await fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loadingBatchId: batchId, expenseType: type, amount, currency: entry.currency }),
          });
          if (!res.ok) throw new Error('保存失败');
          const data = await res.json();
          updatedMap.set(type, { id: data.id, expenseType: type, amount, currency: entry.currency, status: '待支付' });
        }
      }
      router.refresh();
    } catch {
      alert('保存失败，请重试');
    }
    setSaving(false);
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
              </div>
            );
          })}
        </div>
        <Button className="w-full mt-4" onClick={handleSaveAll} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          保存全部费用
        </Button>
      </CardContent>
    </Card>
  );
}