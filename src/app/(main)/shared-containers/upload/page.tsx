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
  rowIndex: number;
  markNo: string;
  品名: string;
  客户: string;
  尺寸_长: number;
  尺寸_宽: number;
  尺寸_高: number;
  单箱体积: number;
  总体积: number;
  成本单价: number;
  国内单号: string;
  单箱数量: number;
  总重量: number;
  箱数: number;
  pcs数量: number;
  货型: string;
  运输方式: string;
  需支付总价: number;
  结算状态: string;
  verdict: string;
  reason: string;
}

interface ScSummary { totalItems: number; abnormalCount: number; }

export default function UploadSharedContainerPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<'idle' | 'parsing' | 'preview' | 'importing'>('idle');
  const [preview, setPreview] = useState<ScItem[]>([]);
  const [summary, setSummary] = useState<ScSummary>({ totalItems: 0, abnormalCount: 0 });
  const [result, setResult] = useState<{ passed: boolean; msg: string } | null>(null);
  const [customerId, setCustomerId] = useState<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { const result = reader.result as string; resolve(result.split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleExtract = async () => {
    if (!file || processingRef.current) return;
    processingRef.current = true;
    setPhase('parsing');
    setResult(null);
    setPreview([]);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const base64 = await toBase64(file);

      const res = await fetch('/api/ai/extract-sc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileData: base64 }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'AI 解析失败' }));
        setResult({ passed: false, msg: err.error || 'AI 解析失败' });
        setPhase('idle');
        processingRef.current = false;
        return;
      }

      const data = await res.json();
      const items: ScItem[] = (data.items || []).map((item: any, idx: number) => ({ ...item, rowIndex: idx + 1 }));

      const custName = items.find(item => item.客户?.trim())?.客户;
      if (custName) {
        try {
          const customersRes = await fetch('/api/customers', { signal: controller.signal });
          const list = await customersRes.json();
          const match = (Array.isArray(list) ? list : []).find((c: any) => c.name === custName.trim());
          if (match) setCustomerId(match.id);
        } catch {}
      }

      setPreview(items);
      setSummary({ totalItems: items.length, abnormalCount: items.filter(i => i.verdict === '异常').length });
      setPhase('preview');
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setResult({ passed: false, msg: '解析失败' });
      setPhase('idle');
    }
    processingRef.current = false;
  };

  const handleReset = () => {
    setFile(null);
    setPreview([]);
    setSummary({ totalItems: 0, abnormalCount: 0 });
    setResult(null);
    setCustomerId(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setPhase('idle');
  };

  const handleConfirmImport = async () => {
    if (!file || preview.length === 0 || processingRef.current) return;
    processingRef.current = true;
    setPhase('importing');

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const batchNo = `SC-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
      const items = preview.map(item => ({
        markNo: item.markNo, 品名: item.品名, 尺寸_长: item.尺寸_长 || 0, 尺寸_宽: item.尺寸_宽 || 0, 尺寸_高: item.尺寸_高 || 0,
        单箱体积: item.单箱体积 || 0, 总体积: item.总体积 || 0, 国内单号: item.国内单号 || '', 单箱数量: item.单箱数量 || 0,
        总重量: item.总重量 || 0, 箱数: item.箱数 || 0, pcs数量: item.pcs数量 || 0,
        成本单价_cents: Math.round((item.成本单价 || 0) * 100), 需支付总价_cents: Math.round((item.需支付总价 || 0) * 100),
        货型: item.货型 || '', 运输方式: item.运输方式 || '', 客户应收_cents: Math.round((item.需支付总价 || 0) * 100),
        结算状态: item.结算状态 || '', customerId, ai_verified: item.verdict === '通过' ? 1 : 0, ai_verify_msg: item.reason || '',
      }));
      const totalVol = items.reduce((s: number, i: any) => s + (i.总体积 || 0), 0);

      const batchRes = await fetch('/api/shared-containers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchNo, totalVolumeUploaded: totalVol, originalFilename: file.name }),
        signal: controller.signal,
      });
      const batchData = await batchRes.json().catch(() => ({}));
      if (!batchData.id) throw new Error('批次创建失败');

      const importRes = await fetch('/api/shared-container-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batchData.id, items }),
        signal: controller.signal,
      });

      if (importRes.ok) {
        setResult({ passed: true, msg: `导入成功！共 ${items.length} 条记录` });
        setPhase('idle');
        setTimeout(() => router.push('/shared-containers'), 2000);
      } else {
        const err = await importRes.json();
        setResult({ passed: false, msg: err.error || '导入失败' });
        setPhase('preview');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setResult({ passed: false, msg: '导入失败' });
      setPhase('preview');
    }
    processingRef.current = false;
  };

  const abnormalItems = preview.filter(i => i.verdict === '异常');
  const fmtSize = (item: ScItem) => {
    if (!item.尺寸_长 && !item.尺寸_宽 && !item.尺寸_高) return '-';
    return `${item.尺寸_长 || '-'}×${item.尺寸_宽 || '-'}×${item.尺寸_高 || '-'}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/shared-containers"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <h1 className="text-2xl font-bold">上传拼柜表格</h1>
      </div>

      {phase === 'preview' || phase === 'importing' ? (
        <Card>
          <CardHeader><CardTitle>预览数据 <span className="ml-2 text-sm font-normal text-muted-foreground">共 {summary.totalItems} 条{summary.abnormalCount > 0 ? `，${summary.abnormalCount} 条异常` : '，全部通过'}</span></CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {summary.abnormalCount > 0 && (
              <div className="p-3 rounded-lg bg-yellow-50 text-yellow-700 text-sm max-h-32 overflow-auto">
                {abnormalItems.map((item, i) => (<div key={i} className="flex gap-2"><span className="shrink-0">第{item.rowIndex}行：</span><span>{item.reason}</span></div>))}
              </div>
            )}
            <div className="border rounded-lg overflow-auto max-h-80">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-10 sticky top-0 bg-muted">#</TableHead><TableHead className="sticky top-0 bg-muted">唛头</TableHead><TableHead className="sticky top-0 bg-muted">品名</TableHead><TableHead className="sticky top-0 bg-muted">客户</TableHead><TableHead className="sticky top-0 bg-muted">尺寸</TableHead>
                  <TableHead className="sticky top-0 bg-muted text-right">单箱体积</TableHead><TableHead className="sticky top-0 bg-muted text-right">总体积</TableHead><TableHead className="sticky top-0 bg-muted text-right">单价</TableHead><TableHead className="sticky top-0 bg-muted text-right">总价</TableHead>
                  <TableHead className="sticky top-0 bg-muted">国内单号</TableHead><TableHead className="sticky top-0 bg-muted text-right">数量</TableHead><TableHead className="sticky top-0 bg-muted text-right">重量</TableHead><TableHead className="sticky top-0 bg-muted text-right">箱数</TableHead><TableHead className="sticky top-0 bg-muted text-right">pcs</TableHead>
                  <TableHead className="sticky top-0 bg-muted">货型</TableHead><TableHead className="sticky top-0 bg-muted">运输</TableHead><TableHead className="sticky top-0 bg-muted">结算</TableHead><TableHead className="sticky top-0 bg-muted">状态</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {preview.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{item.rowIndex}</TableCell><TableCell>{item.markNo || '-'}</TableCell><TableCell>{item.品名 || '-'}</TableCell><TableCell>{item.客户 || '-'}</TableCell><TableCell className="whitespace-nowrap text-xs">{fmtSize(item)}</TableCell>
                      <TableCell className="text-right">{item.单箱体积 || '-'}</TableCell><TableCell className="text-right">{item.总体积 || '-'}</TableCell><TableCell className="text-right">{item.成本单价 || '-'}</TableCell><TableCell className="text-right">{item.需支付总价 || '-'}</TableCell>
                      <TableCell className="text-xs">{item.国内单号 || '-'}</TableCell><TableCell className="text-right">{item.单箱数量 || '-'}</TableCell><TableCell className="text-right">{item.总重量 || '-'}</TableCell><TableCell className="text-right">{item.箱数 || '-'}</TableCell><TableCell className="text-right">{item.pcs数量 || '-'}</TableCell>
                      <TableCell>{item.货型 || '-'}</TableCell><TableCell>{item.运输方式 || '-'}</TableCell><TableCell>{item.结算状态 || '-'}</TableCell>
                      <TableCell><Badge className={item.verdict === '通过' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{item.verdict}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReset} className="flex-1">重新选择文件</Button>
              <Button onClick={handleConfirmImport} disabled={phase === 'importing'} className="flex-1">
                {phase === 'importing' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {phase === 'importing' ? '导入中...' : `确认导入（${preview.length} 条）`}
              </Button>
            </div>
            {result && (<div className={`p-3 rounded-lg flex items-center gap-2 ${result.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{result.passed ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}<span>{result.msg}</span></div>)}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>上传文件</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>选择 Excel 文件（.xlsx）</Label><Input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)} /></div>
            {result && (<div className={`p-3 rounded-lg flex items-center gap-2 ${result.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{result.passed ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}<span>{result.msg}</span></div>)}
            <Button onClick={handleExtract} disabled={phase === 'parsing' || !file} className="w-full">
              {phase === 'parsing' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
              {phase === 'parsing' ? 'AI 解析中...' : 'AI 识别并提取数据'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
