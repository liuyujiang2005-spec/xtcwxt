'use client';
import { formatAmount } from '@/lib/format';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Loader2, Download, ChevronDown, ChevronRight } from 'lucide-react';

interface ClassifyButtonProps {
  batchId: number;
  type?: string;
  items?: any[];
  markMap?: Record<number, string>;
}

export function ClassifyButton({ batchId, type = 'shared-container', items = [], markMap = {} }: ClassifyButtonProps) {
  const [loading, setLoading] = useState(false);
  const [bills, setBills] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<number[]>([batchId]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Load all batches for multi-select
  useEffect(() => { fetch('/api/shared-containers').then(r => r.json()).then(d => setBatches(Array.isArray(d) ? d : [])).catch(() => {}); }, []);

  const toggleBatch = (bid: number) => {
    setSelectedBatches(prev => prev.includes(bid) ? prev.filter(b => b !== bid) : [...prev, bid]);
  };

  const toggleExpand = (markId: number) => {
    const next = new Set(expanded);
    next.has(markId) ? next.delete(markId) : next.add(markId);
    setExpanded(next);
  };

  const classify = async () => {
    if (bills) { setBills(null); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai/classify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchIds: selectedBatches, type }),
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
      const res = await fetch(`/api/bills/export?billId=${billId}`, { credentials: 'include' });
      if (!res.ok) { alert('导出失败'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `账单_${markNo}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch { alert('下载失败'); }
  };

  // Group items by markId, then by 运单号 within each mark
  const markItems = new Map<number, any[]>();
  for (const item of items) {
    if (!markItems.has(item.markId)) markItems.set(item.markId, []);
    markItems.get(item.markId)!.push(item);
  }

  // For a single mark, group its items by 运单号
  const getGroups = (mkItems: any[]) => {
    const groups: { key: string; rows: any[] }[] = [];
    let lastKey = '';
    for (const item of mkItems) {
      const key = item.运单号 || `_${item.id}`;
      if (key !== lastKey) { groups.push({ key, rows: [] }); lastKey = key; }
      groups[groups.length - 1].rows.push(item);
    }
    return groups;
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {batches.map((b: any) => (
            <label key={b.id} className="flex items-center gap-1 text-xs cursor-pointer">
              <input type="checkbox" checked={selectedBatches.includes(b.id)} onChange={() => toggleBatch(b.id)} className="h-3 w-3" />
              {b.batchNo}
            </label>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={classify} disabled={loading}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : bills ? <Download className="h-3.5 w-3.5 mr-1" /> : <BarChart3 className="h-3.5 w-3.5 mr-1" />}
        {bills ? '收起' : '生成账单'}
      </Button>
      </div>
      {error && <span className="text-xs text-red-500 ml-2">{error}</span>}

      {bills && (
        <div className="mt-4 space-y-3">
          {bills.map((b: any) => {
            const mkItems = markItems.get(b.markId) || [];
            const isExpanded = expanded.has(b.markId);
            const groups = getGroups(mkItems);
            return (
              <Card key={b.billId}>
                <CardHeader className="py-2 px-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => mkItems.length > 0 && toggleExpand(b.markId)}>
                      {mkItems.length > 0 && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                      <CardTitle className="text-sm">{b.markNo} ({b.customerName})</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{b.itemCount}条 | {b.totalVolume?.toFixed(6)}m³ | ¥{b.totalCost?.toFixed(6)}</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6" onClick={() => exportBill(b.billId, b.markNo)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && mkItems.length > 0 && (
                  <CardContent className="p-0 pb-2">
                    <div className="border-t">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">运单号</TableHead>
                            <TableHead className="text-xs">运输</TableHead>
                            <TableHead className="text-xs">国内单号</TableHead>
                            <TableHead className="text-xs">品名</TableHead>
                            <TableHead className="text-xs">货型</TableHead>
                            <TableHead className="text-xs text-right">件数</TableHead>
                            <TableHead className="text-xs text-right">总体积</TableHead>
                            <TableHead className="text-xs text-right">成本</TableHead>
                            <TableHead className="text-xs">结算</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groups.map(g => g.rows.map((item: any, ri: number) => (
                            <TableRow key={item.id || ri}>
                              {ri === 0 ? <TableCell className="text-xs font-mono" rowSpan={g.rows.length}>{item.运单号 || '-'}</TableCell> : null}
                              {ri === 0 ? <TableCell className="text-xs" rowSpan={g.rows.length}>{item.运输方式 || '-'}</TableCell> : null}
                              <TableCell className="text-xs">{item.国内单号 || '-'}</TableCell>
                              <TableCell className="text-xs max-w-[100px] truncate" title={item.品名 || ''}>{item.品名 || '-'}</TableCell>
                              <TableCell className="text-xs">{item.货型 || '-'}</TableCell>
                              <TableCell className="text-xs text-right">{item.箱数 || '-'}</TableCell>
                              {ri === 0 ? <TableCell className="text-xs text-right" rowSpan={g.rows.length}>{(item.总体积 ?? 0).toFixed(6)}</TableCell> : null}
                              <TableCell className="text-xs text-right">¥{(item.需支付总价 || 0).toFixed(6)}</TableCell>
                              {ri === 0 ? <TableCell className="text-xs" rowSpan={g.rows.length}>
                                <Badge className="text-[10px]">{item.cost_status || item.payment_status || '-'}</Badge>
                              </TableCell> : null}
                            </TableRow>
                          )))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
          {bills.length === 0 && <p className="text-sm text-muted-foreground">无分类数据</p>}
        </div>
      )}
    </div>
  );
}
