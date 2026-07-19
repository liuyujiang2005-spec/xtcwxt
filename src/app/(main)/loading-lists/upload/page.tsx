'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Loader2, Upload, Brain, ArrowLeft } from 'lucide-react';

interface ScItem {
  rowIndex: number; 日期: string; 唛头: string; 仓库: string; 运输方式: string;
  运单号: string; 货型: string; 品名: string; 尺寸: string; 件数: number;
  国内单号: string; 单项体积: number; 单项重量: number; 总体积: number;
  总重量: number; 计费体积: number; 总计费体积: number; 单价: number;
  单项价格: number; 订单总价: number; 备注: string; 结算状态: string; 柜号: string;
  尺寸_长: number; 尺寸_宽: number; 尺寸_高: number;
  verdict: string; reason: string;
}

interface ScSummary { totalItems: number; abnormalCount: number; }

export default function UploadLoadingListPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploadMonth, setUploadMonth] = useState(new Date().toISOString().substring(0, 7));
  const [phase, setPhase] = useState<'idle' | 'parsing' | 'preview' | 'importing'>('idle');
  const [preview, setPreview] = useState<ScItem[]>([]);
  const [summary, setSummary] = useState<ScSummary>({ totalItems: 0, abnormalCount: 0 });
  const [result, setResult] = useState<{ passed: boolean; msg: string } | null>(null);
  const [customerId, setCustomerId] = useState<number>(0);
  const [aiVerifying, setAiVerifying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

  const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleExtract = async () => {
    if (!file || processingRef.current) return;
    processingRef.current = true;
    setPhase('parsing'); setResult(null); setPreview([]);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const base64 = await toBase64(file);
      const res = await fetch('/api/ai/extract-loading', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, fileData: base64 }), signal: controller.signal });
      if (!res.ok) { const err = await res.json().catch(() => ({})); setResult({ passed: false, msg: err.error || 'AI 解析失败' }); setPhase('idle'); processingRef.current = false; return; }
      const data = await res.json();
      const items: ScItem[] = (data.items || []).map((i: any, idx: number) => ({ ...i, rowIndex: idx + 1 }));
      const custName = items.find(i => i.唛头?.trim())?.唛头;
      if (custName) { try { const r = await fetch('/api/customers', { signal: controller.signal }); const l = await r.json(); const m = (Array.isArray(l) ? l : []).find((c: any) => c.name === custName.trim()); if (m) setCustomerId(m.id); } catch {} }
      setPreview(items);
      setSummary({ totalItems: items.length, abnormalCount: items.filter(i => i.verdict === '异常').length });
      setPhase('preview');

      setAiVerifying(true);
      fetch('/api/ai/verify-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ 品名: i.品名, 总体积: i.总体积, 货型: i.货型, 运输方式: i.运输方式, 运单号: i.运单号, 单价: i.单价, 应收: i.应收 })),
          type: 'loading',
        }),
        signal: controller.signal,
      }).then(async (verifyRes) => {
        if (!verifyRes.ok) return;
        const vData = await verifyRes.json();
        const abnormalMap = new Map<number, string>();
        (vData.details || []).forEach((d: any) => abnormalMap.set(d.itemId, d.reason));
        setPreview(prev => {
          const updated = prev.map((item, idx) => {
            const reason = abnormalMap.get(idx);
            return reason ? { ...item, verdict: '异常', reason } : { ...item, verdict: '通过', reason: '' };
          });
          setSummary({ totalItems: updated.length, abnormalCount: vData.abnormalCount || 0 });
          return updated;
        });
      }).catch(err => { if (err?.name !== 'AbortError') { console.error('AI 验价失败:', err); setResult({ passed: false, msg: 'AI验价请求失败，请重试' }); } })
        .finally(() => setAiVerifying(false));
    } catch (err: any) { if (err?.name !== 'AbortError') { setResult({ passed: false, msg: '解析失败' }); setPhase('idle'); } }
    processingRef.current = false;
  };

  const handleReset = () => { setFile(null); setPreview([]); setSummary({ totalItems: 0, abnormalCount: 0 }); setResult(null); setCustomerId(0); if (fileInputRef.current) fileInputRef.current.value = ''; setPhase('idle'); };

  const handleConfirmImport = async () => {
    if (!file || preview.length === 0 || processingRef.current) return;
    processingRef.current = true; setPhase('importing');
    abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller;
    try {
      const batchNo = `LD-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
      const items = preview.map(item => ({
        monthTag: uploadMonth,
        markNo: item.唛头 || item.运单号,
        customerId,
        品名: item.品名,
        货型: item.货型 || '',
        运输方式: item.运输方式 || '',
        尺寸_长: item.尺寸_长 || 0,
        尺寸_宽: item.尺寸_宽 || 0,
        尺寸_高: item.尺寸_高 || 0,
        单箱体积: item.单项体积 || 0,
        总体积: item.总体积 || item.单项体积 || 0,
        国内单号: item.国内单号 || '',
        单箱数量: item.件数 || 0,
        总重量: item.总重量 || 0,
        箱数: item.件数 || 0,
        pcs数量: 0,
        单价: item.单价 || 0,
        需支付总价: item.单项价格 || 0,
         运单号: item.运单号 || '',
         仓库: item.仓库 || '',
         ai_verified: item.verdict === '通过' ? 1 : 0,
        ai_verify_msg: item.reason || '',
      }));
      const totalVol = items.reduce((s: number, i: any) => s + (i.总体积 || i.单项体积 || 0), 0);
      const batchRes = await fetch('/api/loading-batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchNo, totalVolumeUploaded: totalVol, originalFilename: file.name }), signal: controller.signal });
      const batchData = await batchRes.json().catch(() => ({}));
      if (!batchData.id) throw new Error('批次创建失败');
      const importRes = await fetch('/api/loading-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: batchData.id, items }), signal: controller.signal });
      if (importRes.ok) { setResult({ passed: true, msg: `导入成功！共 ${items.length} 条记录` }); setPhase('idle'); setTimeout(() => router.push('/loading-lists'), 2000); }
      else { const err = await importRes.json(); setResult({ passed: false, msg: err.error || '导入失败' }); setPhase('preview'); }
    } catch (err: any) { if (err?.name !== 'AbortError') { setResult({ passed: false, msg: '导入失败' }); setPhase('preview'); } }
    processingRef.current = false;
  };

  const abnormalItems = preview.filter(i => i.verdict === '异常');

  // 按运单号分组用于合并展示
  const grouped: { key: string; items: ScItem[] }[] = [];
  let lastKey = '';
  for (const item of preview) {
    const key = item.运单号 || item.rowIndex.toString();
    if (key !== lastKey) { grouped.push({ key, items: [] }); lastKey = key; }
    grouped[grouped.length - 1].items.push(item);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><Link href="/loading-lists"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-5 w-5" /></Button></Link><h1 className="text-2xl font-bold">上传装柜表格</h1></div>
      {phase === 'preview' || phase === 'importing' ? (
        <Card><CardHeader><CardTitle>预览数据 <span className="ml-2 text-sm font-normal text-muted-foreground">共 {summary.totalItems} 条{summary.abnormalCount > 0 ? `，${summary.abnormalCount} 条异常` : '，全部通过'}</span></CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {summary.abnormalCount > 0 && <div className="p-3 rounded-lg bg-yellow-50 text-yellow-700 text-sm max-h-32 overflow-auto">{abnormalItems.map((item, i) => (<div key={i}><span>第{item.rowIndex}行 [{item.运单号 || '-'}] {item.唛头 || '-'}：{item.reason}</span></div>))}</div>}
            <div className="border rounded-lg overflow-auto max-h-80"><Table>
              <TableHeader><TableRow>
                <TableHead className="w-10 sticky top-0 bg-muted">#</TableHead>
                <TableHead className="sticky top-0 bg-muted">日期</TableHead><TableHead className="sticky top-0 bg-muted">唛头</TableHead><TableHead className="sticky top-0 bg-muted">仓库</TableHead>
                <TableHead className="sticky top-0 bg-muted">运输</TableHead><TableHead className="sticky top-0 bg-muted">运单号</TableHead><TableHead className="sticky top-0 bg-muted">货型</TableHead>
                <TableHead className="sticky top-0 bg-muted">品名</TableHead><TableHead className="sticky top-0 bg-muted">尺寸</TableHead><TableHead className="sticky top-0 bg-muted text-right">件数</TableHead>
                <TableHead className="sticky top-0 bg-muted">国内单号</TableHead><TableHead className="sticky top-0 bg-muted text-right">单项体积</TableHead><TableHead className="sticky top-0 bg-muted text-right">单项重量</TableHead>
                <TableHead className="sticky top-0 bg-muted text-right">总体积</TableHead><TableHead className="sticky top-0 bg-muted text-right">总重量</TableHead><TableHead className="sticky top-0 bg-muted text-right">计费体积</TableHead><TableHead className="sticky top-0 bg-muted text-right">总计费体积</TableHead>
                <TableHead className="sticky top-0 bg-muted text-right">单价</TableHead><TableHead className="sticky top-0 bg-muted text-right">单项价格</TableHead><TableHead className="sticky top-0 bg-muted text-right">订单总价</TableHead>
                <TableHead className="sticky top-0 bg-muted">备注</TableHead><TableHead className="sticky top-0 bg-muted">结算</TableHead><TableHead className="sticky top-0 bg-muted">柜号</TableHead><TableHead className="sticky top-0 bg-muted">状态</TableHead>
              </TableRow></TableHeader>
              <TableBody>{grouped.map(g => g.items.map((item, ri) => (
                <TableRow key={`${g.key}_${ri}`}>
                  <TableCell className="text-xs text-muted-foreground">{item.rowIndex}</TableCell>
                  {ri === 0 ? <TableCell className="text-xs" rowSpan={g.items.length}>{item.日期 || '-'}</TableCell> : null}
                  {ri === 0 ? <TableCell rowSpan={g.items.length}>{item.唛头 || '-'}</TableCell> : null}
                  {ri === 0 ? <TableCell rowSpan={g.items.length}>{item.仓库 || '-'}</TableCell> : null}
                  {ri === 0 ? <TableCell rowSpan={g.items.length}>{item.运输方式 || '-'}</TableCell> : null}
                  {ri === 0 ? <TableCell rowSpan={g.items.length}>{item.运单号 || '-'}</TableCell> : null}
                  <TableCell>{item.货型 || '-'}</TableCell>
                  <TableCell>{item.品名 || '-'}</TableCell>
                  <TableCell>{item.尺寸 || '-'}</TableCell>
                  <TableCell className="text-right">{item.件数 || '-'}</TableCell>
                  <TableCell className="text-xs max-w-[120px] truncate">{item.国内单号 || '-'}</TableCell>
                  <TableCell className="text-right">{item.单项体积 || '-'}</TableCell><TableCell className="text-right">{item.单项重量 || '-'}</TableCell>
                  {ri === 0 ? <TableCell className="text-right" rowSpan={g.items.length}>{item.总体积 || '-'}</TableCell> : null}
                  {ri === 0 ? <TableCell className="text-right" rowSpan={g.items.length}>{item.总重量 || '-'}</TableCell> : null}
                  <TableCell className="text-right">{item.计费体积 || '-'}</TableCell>
                  {ri === 0 ? <TableCell className="text-right" rowSpan={g.items.length}>{item.总计费体积 || '-'}</TableCell> : null}
                  <TableCell className="text-right">{item.单价 || '-'}</TableCell><TableCell className="text-right">{item.单项价格 || '-'}</TableCell>
                  {ri === 0 ? <TableCell className="text-right" rowSpan={g.items.length}>{item.订单总价 || '-'}</TableCell> : null}
                  <TableCell className="text-xs max-w-[80px] truncate">{item.备注 || '-'}</TableCell>
                  <TableCell>{item.结算状态 || '-'}</TableCell><TableCell>{item.柜号 || '-'}</TableCell>
                  <TableCell><Badge className={item.verdict === '通过' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{item.verdict}</Badge></TableCell>
                </TableRow>
              )))}</TableBody>
            </Table></div>
            <div className="flex gap-3"><Button variant="outline" onClick={handleReset} className="flex-1">重新选择文件</Button><Button onClick={handleConfirmImport} disabled={phase === 'importing'} className="flex-1">{phase === 'importing' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}{phase === 'importing' ? '导入中...' : `确认导入（${preview.length} 条）`}</Button></div>
            {result && <div className={`p-3 rounded-lg flex items-center gap-2 ${result.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{result.passed ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}<span>{result.msg}</span></div>}
          </CardContent></Card>
      ) : (
        <Card><CardHeader><CardTitle>上传文件</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>上传月份</Label>
            <Input type="month" value={uploadMonth} onChange={e => setUploadMonth(e.target.value)} className="h-8 w-36" />
          </div>
          <div className="space-y-2"><Label>选择 Excel 文件（.xlsx）</Label><Input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)} /></div>
          {result && <div className={`p-3 rounded-lg flex items-center gap-2 ${result.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{result.passed ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}<span>{result.msg}</span></div>}
          <Button onClick={handleExtract} disabled={phase === 'parsing' || !file} className="w-full">{phase === 'parsing' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}{phase === 'parsing' ? 'AI 解析中...' : 'AI 识别并提取数据'}</Button>
        </CardContent></Card>
      )}
    </div>
  );
}
