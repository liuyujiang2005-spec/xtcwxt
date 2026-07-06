'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Loader2, X } from 'lucide-react';

interface ScItem {
  id: number; markId: number; customerId: number; 品名: string | null; 总体积: number;
  单箱体积: number | null; 箱数: number | null; 单箱数量: number | null;
  国内单号: string | null; 总重量: number | null; 货型: string | null; 运输方式: string | null;
  成本单价_cents: number | null; 需支付总价_cents: number | null;
  订单总价_cents: number | null; 运单号: string | null; cost_status: string | null;
  customerName?: string; markNo?: string;
}

export function ClassifyButton({ batchId, type = 'shared-container' }: { batchId: number; type?: string }) {
  const [loading, setLoading] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [items, setItems] = useState<ScItem[]>([]);
  const [error, setError] = useState('');

  const classify = async () => {
    if (showPanel) { setShowPanel(false); return; }
    setLoading(true);
    setError('');
    try {
      const apiPath = type === 'shared-container' ? '/api/shared-containers' : '/api/loading-batches';
      const res = await fetch(`${apiPath}/${batchId}`);
      const data = await res.json();
      if (res.ok && data.items) {
        setItems(data.items || []);
        setShowPanel(true);
      } else {
        setError(data.error || '加载失败');
      }
    } catch { setError('网络错误'); }
    setLoading(false);
  };

  // 按唛头分组
  const groups = new Map<number, ScItem[]>();
  for (const item of items) {
    const mid = item.markId;
    if (!groups.has(mid)) groups.set(mid, []);
    groups.get(mid)!.push(item);
  }

  return (
    <div>
      <Button size="sm" variant="outline" onClick={classify} disabled={loading}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : showPanel ? <X className="h-3.5 w-3.5 mr-1" /> : <BarChart3 className="h-3.5 w-3.5 mr-1" />}
        {showPanel ? '收起统计' : '分类统计'}
      </Button>
      {error && <span className="text-xs text-red-500 ml-2">{error}</span>}

      {showPanel && (
        <div className="mt-4 space-y-4">
          {Array.from(groups.entries()).map(([markId, group]) => {
            const totalVol = group.reduce((s, i) => s + (i.单箱体积 || 0), 0);
            const totalCost = group[0]?.订单总价_cents || 0;
            const modes = new Set(group.map(i => i.运输方式).filter(Boolean));
            return (
              <Card key={markId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {group[0]?.markNo || `唛头 #${markId}`}
                    <span className="font-normal text-muted-foreground">
                      {group.length} 条 | {totalVol.toFixed(2)} m³ | ¥{(totalCost / 100).toFixed(2)} | {Array.from(modes).join(', ') || '-'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>品名</TableHead><TableHead>货型</TableHead><TableHead>运输</TableHead>
                      <TableHead className="text-right">单箱体积</TableHead><TableHead className="text-right">箱数</TableHead>
                      <TableHead>国内单号</TableHead><TableHead className="text-right">总重量</TableHead>
                      <TableHead className="text-right">成本</TableHead><TableHead>结算</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {group.map((item, ri) => (
                        <TableRow key={ri}>
                          <TableCell className="max-w-[120px] truncate">{item.品名 || '-'}</TableCell>
                          <TableCell>{item.货型 || '-'}</TableCell><TableCell>{item.运输方式 || '-'}</TableCell>
                          <TableCell className="text-right">{item.单箱体积 || '-'}</TableCell><TableCell className="text-right">{item.箱数 || '-'}</TableCell>
                          <TableCell className="text-xs">{item.国内单号 || '-'}</TableCell>
                          <TableCell className="text-right">{item.总重量 || '-'}</TableCell>
                          <TableCell className="text-right">{((item.需支付总价_cents || 0) / 100).toFixed(2)}</TableCell>
                          <TableCell><Badge className={item.cost_status === '已支出' ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-700'}>{item.cost_status || '-'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
