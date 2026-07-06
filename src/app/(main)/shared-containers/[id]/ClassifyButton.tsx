'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Loader2, Download } from 'lucide-react';

export function ClassifyButton({ batchId, type = 'shared-container' }: { batchId: number; type?: string }) {
  const [loading, setLoading] = useState(false);
  const [bills, setBills] = useState<any[] | null>(null);
  const [error, setError] = useState('');

  const classify = async () => {
    if (bills) { setBills(null); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai/classify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, type }),
      });
      const data = await res.json();
      if (res.ok) {
        setBills(data.bills || []);
      } else {
        setError(data.error || '分类失败');
      }
    } catch { setError('网络错误'); }
    setLoading(false);
  };

  const exportBill = async (billId: number, markNo: string) => {
    try {
      const res = await fetch(`/api/bills/export?billId=${billId}`);
      if (!res.ok) { alert('导出失败'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `账单_${markNo}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch { alert('下载失败'); }
  };

  return (
    <div>
      <Button size="sm" variant="outline" onClick={classify} disabled={loading}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : bills ? <Download className="h-3.5 w-3.5 mr-1" /> : <BarChart3 className="h-3.5 w-3.5 mr-1" />}
        {bills ? '收起' : '生成账单'}
      </Button>
      {error && <span className="text-xs text-red-500 ml-2">{error}</span>}

      {bills && (
        <div className="mt-4 space-y-3">
          {bills.map((b: any) => (
            <Card key={b.billId}>
              <CardHeader className="py-2 px-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">{b.markNo} ({b.customerName})</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{b.itemCount}条 | {b.totalVolume?.toFixed(6)}m³ | ¥{b.totalCost?.toFixed(2)}</span>
                  <Button size="sm" variant="ghost" className="h-6 w-6" onClick={() => exportBill(b.billId, b.markNo)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
          {bills.length === 0 && <p className="text-sm text-muted-foreground">无分类数据</p>}
        </div>
      )}
    </div>
  );
}
