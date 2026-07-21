'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pencil, Check, X } from 'lucide-react';
import { formatAmount } from '@/lib/format';

type Item = any;

export function BillItemsTable({
  billNo, currency, groups, editable,
}: {
  billNo: string;
  currency: string;
  groups: { markNo: string; custName: string; mode: string; items: Item[] }[];
  editable: boolean;
}) {
  const router = useRouter();
  const isThb = currency === 'THB';
  const [saving, setSaving] = useState(false);
  // 正在编辑尺寸的行: `${sourceType}:${sourceItemId}`
  const [editDim, setEditDim] = useState<string | null>(null);
  const [dim, setDim] = useState<{ l: string; w: string; h: string }>({ l: '', w: '', h: '' });
  // 正在编辑应收的运单: `${sourceType}:${sourceItemId}`(运单首条)
  const [editRecv, setEditRecv] = useState<string | null>(null);
  const [recvVal, setRecvVal] = useState('');

  const call = async (payload: any) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/bills/${encodeURIComponent(billNo)}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || '保存失败'); return; }
      setEditDim(null); setEditRecv(null);
      router.refresh();
    } catch { alert('保存失败'); } finally { setSaving(false); }
  };

  const startDim = (it: Item) => {
    setEditDim(`${it._sourceType}:${it._sourceItemId}`);
    setDim({ l: String(it.尺寸_长 ?? ''), w: String(it.尺寸_宽 ?? ''), h: String(it.尺寸_高 ?? '') });
  };
  const saveDim = (it: Item) => call({
    type: 'dims', sourceType: it._sourceType, sourceItemId: it._sourceItemId,
    尺寸_长: parseFloat(dim.l) || 0, 尺寸_宽: parseFloat(dim.w) || 0, 尺寸_高: parseFloat(dim.h) || 0,
  });
  const startRecv = (it: Item) => {
    setEditRecv(`${it._sourceType}:${it._sourceItemId}`);
    setRecvVal(String(it._orderRecv ?? 0));
  };
  const saveRecv = (it: Item) => call({
    type: 'recv', sourceType: it._sourceType, sourceItemId: it._sourceItemId,
    客户应收: parseFloat(recvVal) || 0,
  });

  return (
    <>
      {groups.map(({ markNo, custName, mode, items }) => {
        // 预计算运单条数
        const orderCounts = new Map<string, number>();
        items.forEach((it) => {
          const k = it.运单号 || `#${it.id}`;
          orderCounts.set(k, (orderCounts.get(k) || 0) + 1);
        });
        let lastOrder = '';
        return (
          <Card key={markNo} className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {markNo}
                {custName && <span className="font-normal text-muted-foreground ml-2">({custName})</span>}
                <span className="font-normal text-muted-foreground ml-2">{mode}</span>
                <span className="font-normal text-muted-foreground ml-2">{items.length} 条</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="border">
                <TableHeader>
                  <TableRow>
                    <TableHead>品名</TableHead>
                    <TableHead>仓库</TableHead>
                    <TableHead>运单号</TableHead>
                    <TableHead>货型</TableHead>
                    <TableHead>运输</TableHead>
                    <TableHead className="text-right">长×宽×高</TableHead>
                    <TableHead className="text-right">总体积</TableHead>
                    <TableHead className="text-right">单项体积</TableHead>
                    <TableHead className="text-right">件数</TableHead>
                    <TableHead>国内单号</TableHead>
                    <TableHead className="text-right">总重量</TableHead>
                    <TableHead className="text-right">成本</TableHead>
                    <TableHead className="text-right">应收</TableHead>
                    <TableHead>类型</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, ri) => {
                    const orderKey = item.运单号 || `#${item.id}`;
                    const isFirstInOrder = orderKey !== lastOrder;
                    const orderRowSpan = orderCounts.get(orderKey) || 1;
                    lastOrder = orderKey;
                    const rowKey = `${item._sourceType}:${item._sourceItemId}`;
                    const dimEditing = editable && editDim === rowKey;
                    const recvEditing = editable && editRecv === rowKey;
                    return (
                      <TableRow key={item.id || ri}>
                        <TableCell className="border max-w-[100px] truncate" title={item.品名 || ''}>{item.品名 || '-'}</TableCell>
                        {isFirstInOrder ? <TableCell className="border" rowSpan={orderRowSpan}>{item.仓库 || '-'}</TableCell> : null}
                        {isFirstInOrder ? <TableCell className="border text-xs font-mono" rowSpan={orderRowSpan}>{item.运单号 || '-'}</TableCell> : null}
                        <TableCell className="border">{item.货型 || '-'}</TableCell>
                        <TableCell className="border">{item.运输方式 || '-'}</TableCell>
                        {/* 长×宽×高 可编辑 */}
                        <TableCell className="border text-right whitespace-nowrap">
                          {dimEditing ? (
                            <span className="inline-flex items-center gap-1">
                              <Input value={dim.l} onChange={e => setDim({ ...dim, l: e.target.value })} className="h-7 w-14 text-right px-1" />×
                              <Input value={dim.w} onChange={e => setDim({ ...dim, w: e.target.value })} className="h-7 w-14 text-right px-1" />×
                              <Input value={dim.h} onChange={e => setDim({ ...dim, h: e.target.value })} className="h-7 w-14 text-right px-1" />
                              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={saving} onClick={() => saveDim(item)}><Check className="h-3.5 w-3.5 text-green-600" /></Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditDim(null)}><X className="h-3.5 w-3.5" /></Button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              {(item.尺寸_长 || item.尺寸_宽 || item.尺寸_高)
                                ? `${item.尺寸_长 ?? 0}×${item.尺寸_宽 ?? 0}×${item.尺寸_高 ?? 0}` : '-'}
                              {editable && <Button size="icon" variant="ghost" className="h-6 w-6" disabled={saving} onClick={() => startDim(item)}><Pencil className="h-3 w-3 text-muted-foreground" /></Button>}
                            </span>
                          )}
                        </TableCell>
                        {isFirstInOrder ? <TableCell className="border text-right font-medium" rowSpan={orderRowSpan}>{(item.总体积 ?? 0).toFixed(6)}</TableCell> : null}
                        <TableCell className="border text-right">{item.单项体积 ?? '-'}</TableCell>
                        <TableCell className="border text-right">{item.箱数 || '-'}</TableCell>
                        <TableCell className="border text-xs">{item.国内单号 || '-'}</TableCell>
                        <TableCell className="border text-right">{item.总重量 || '-'}</TableCell>
                        <TableCell className="border text-right text-red-600">{formatAmount(item.需支付总价 || 0)}</TableCell>
                        {/* 应收 可编辑(运单首条) */}
                        {isFirstInOrder ? (
                          <TableCell className="border text-right" rowSpan={orderRowSpan}>
                            {recvEditing ? (
                              <span className="inline-flex items-center gap-1 justify-end">
                                <Input value={recvVal} onChange={e => setRecvVal(e.target.value)} className="h-7 w-24 text-right px-1" />
                                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={saving} onClick={() => saveRecv(item)}><Check className="h-3.5 w-3.5 text-green-600" /></Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditRecv(null)}><X className="h-3.5 w-3.5" /></Button>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 justify-end">
                                <span className="text-green-600">{isThb ? formatAmount(item._orderRecv || 0, 'THB') : formatAmount(item._orderRecv || 0)}</span>
                                {editable && <Button size="icon" variant="ghost" className="h-6 w-6" disabled={saving} onClick={() => startRecv(item)}><Pencil className="h-3 w-3 text-muted-foreground" /></Button>}
                              </span>
                            )}
                          </TableCell>
                        ) : null}
                        <TableCell className="border"><Badge variant="outline" className="text-xs">{item._type}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
