'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Download } from 'lucide-react';

export default function BillDownloadCard() {
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
  const [customerId, setCustomerId] = useState<number>(0);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/customers').then(r => r.json()).then(setCustomers);
    setMonth(new Date().toISOString().substring(0, 7));
  }, []);

  const handleDownload = async () => {
    if (!customerId || !month) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bills/download?customerId=${customerId}&month=${month}`);
      if (!res.ok) { alert('生成失败'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `账单_${customers.find(c => c.id === customerId)?.name || ''}_${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('下载失败');
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader><CardTitle>生成账单</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-4">
          <div className="space-y-2">
            <Label>选择客户</Label>
            <select
              className="h-8 w-48 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={customerId}
              onChange={(e) => setCustomerId(Number(e.target.value))}
            >
              <option value={0}>-- 请选择 --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>月份</Label>
            <input
              type="month"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>

          <Button onClick={handleDownload} disabled={loading || !customerId || !month}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            {loading ? '生成中...' : '下载账单'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
