'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowLeft, Plus, Trash2 } from 'lucide-react';

const TRANSPORT_OPTIONS = ['海运', '陆运'];
const CARGO_OPTIONS = ['普货', '商检货', '敏感货'];

interface RowData {
  markNo: string;
  品名: string;
  运输方式: string;
  货型: string;
  件数: string;
  总体积: string;
  总重量: string;
  单价: string;
  运单号: string;
  国内单号: string;
  仓库: string;
  备注: string;
}

function emptyRow(): RowData {
  return { markNo: '', 品名: '', 运输方式: '海运', 货型: '普货', 件数: '', 总体积: '', 总重量: '', 单价: '', 运单号: '', 国内单号: '', 仓库: '', 备注: '' };
}

export default function LoadingManualPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [batchId, setBatchId] = useState<number>(0);
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
  const [rows, setRows] = useState<RowData[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);

  const [custError, setCustError] = useState(false);
  const loadCustomers = () => {
    setCustError(false);
    fetch('/api/customers')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => setCustomers(Array.isArray(d) ? d : []))
      .catch(() => setCustError(true));
  };

  useEffect(() => {
    let cancelled = false;
    params.then(p => { if (!cancelled) setBatchId(parseInt(p.id)); });
    loadCustomers();
    return () => { cancelled = true; };
  }, []);

  const updateRow = (i: number, field: keyof RowData, value: string | null) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: value || '' };
    setRows(next);
  };

  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (i: number) => setRows(prev => { if (prev.length <= 1) return prev; return prev.filter((_, idx) => idx !== i); });

  const handleSubmit = async () => {
    const valid = rows.filter(r => r.markNo.trim() && r.品名.trim());
    if (valid.length === 0) { alert('请至少填写一条完整记录（唛头+品名）'); return; }
    setSaving(true);
    try {
      const items = valid.map(r => ({
        markNo: r.markNo.trim(),
        品名: r.品名.trim(),
        货型: r.货型 || '普货',
        运输方式: r.运输方式 || '海运',
        件数: parseInt(r.件数) || 0,
        总体积: parseFloat(r.总体积) || 0,
        总重量: parseFloat(r.总重量) || 0,
        单价: parseFloat(r.单价) || 0,
        运单号: r.运单号.trim(),
        国内单号: r.国内单号.trim(),
        仓库: r.仓库.trim(),
        备注: r.备注.trim(),
        箱数: parseInt(r.件数) || 0,
        customerId: 0, // Will be resolved by backend from markNo
      }));

      const importRes = await fetch('/api/loading-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, items }),
      });
      if (importRes.ok) {
        alert(`导入成功！共 ${items.length} 条记录`);
        router.push('/loading-lists');
        router.refresh();
      } else {
        const err = await importRes.json().catch(() => ({ error: '导入失败' }));
        alert(err.error || '导入失败');
      }
    } catch { alert('提交失败'); }
    setSaving(false);
  };

  const totalVol = rows.reduce((s, r) => s + (parseFloat(r.总体积) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/loading-lists"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <h1 className="text-2xl font-bold">手动录入明细</h1>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{rows.length} 行 · 总体积 {totalVol.toFixed(6)} m³</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-3.5 w-3.5 mr-1" />加一行</Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}提交导入
          </Button>
        </div>
      </div>

      {custError && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          客户列表加载失败，下拉可能选不到客户。<button type="button" onClick={loadCustomers} className="underline font-medium">点此重试</button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>唛头</TableHead>
                  <TableHead>品名</TableHead>
                  <TableHead>运输</TableHead>
                  <TableHead>货型</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                  <TableHead className="text-right">总体积</TableHead>
                  <TableHead className="text-right">总重量</TableHead>
                  <TableHead className="text-right">单价</TableHead>
                  <TableHead>运单号</TableHead>
                  <TableHead>国内单号</TableHead>
                  <TableHead>仓库</TableHead>
                  <TableHead>备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(i)} disabled={rows.length <= 1}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Select value={r.markNo} onValueChange={v => updateRow(i, 'markNo', v)}>
                        <SelectTrigger className="h-7 w-28 text-xs"><SelectValue placeholder="选客户" /></SelectTrigger>
                        <SelectContent>
                          {customers.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input className="h-7 w-24 text-xs" value={r.品名} onChange={e => updateRow(i, '品名', e.target.value)} placeholder="品名" /></TableCell>
                    <TableCell>
                      <Select value={r.运输方式} onValueChange={v => updateRow(i, '运输方式', v)}>
                        <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{TRANSPORT_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={r.货型} onValueChange={v => updateRow(i, '货型', v)}>
                        <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{CARGO_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input type="number" className="h-7 w-14 text-xs text-right" value={r.件数} onChange={e => updateRow(i, '件数', e.target.value)} /></TableCell>
                    <TableCell><Input type="number" step="0.000001" className="h-7 w-20 text-xs text-right" value={r.总体积} onChange={e => updateRow(i, '总体积', e.target.value)} /></TableCell>
                    <TableCell><Input type="number" step="0.01" className="h-7 w-20 text-xs text-right" value={r.总重量} onChange={e => updateRow(i, '总重量', e.target.value)} /></TableCell>
                    <TableCell><Input type="number" step="0.01" className="h-7 w-16 text-xs text-right" value={r.单价} onChange={e => updateRow(i, '单价', e.target.value)} /></TableCell>
                    <TableCell><Input className="h-7 w-28 text-xs" value={r.运单号} onChange={e => updateRow(i, '运单号', e.target.value)} placeholder="运单号" /></TableCell>
                    <TableCell><Input className="h-7 w-28 text-xs" value={r.国内单号} onChange={e => updateRow(i, '国内单号', e.target.value)} placeholder="国内单号" /></TableCell>
                    <TableCell><Input className="h-7 w-20 text-xs" value={r.仓库} onChange={e => updateRow(i, '仓库', e.target.value)} placeholder="仓库" /></TableCell>
                    <TableCell><Input className="h-7 w-20 text-xs" value={r.备注} onChange={e => updateRow(i, '备注', e.target.value)} placeholder="备注" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
