'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Loader2, Upload, Brain } from 'lucide-react';

interface ScItem {
  rowIndex: number;
  markNo: string;
  品名: string;
  总体积: number;
  成本单价: number;
  货型: string;
  运输方式: string;
  verdict: string;
  reason: string;
}

interface ScSummary {
  totalItems: number;
  abnormalCount: number;
}

export default function UploadSharedContainerPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);

  const [phase, setPhase] = useState<'idle' | 'parsing' | 'preview' | 'importing'>('idle');
  const [preview, setPreview] = useState<ScItem[]>([]);
  const [summary, setSummary] = useState<ScSummary>({ totalItems: 0, abnormalCount: 0 });
  const [result, setResult] = useState<{ passed: boolean; msg: string } | null>(null);

  const handleExtract = async () => {
    if (!file) return;
    setPhase('parsing');
    setResult(null);
    setPreview([]);

    try {
      const XLSX = (window as any).XLSX;
      if (!XLSX) { setResult({ passed: false, msg: '请先加载 xlsx 库' }); setPhase('idle'); return; }

      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const wb = XLSX.read(ev.target?.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });

          // 过滤掉全是空值的行
          const filtered = rawRows.filter((row: unknown[]) =>
            row.some((cell: unknown) => cell !== '' && cell !== null && cell !== undefined),
          );

          if (filtered.length === 0) {
            setResult({ passed: false, msg: '表格没有数据' });
            setPhase('idle');
            return;
          }

          const aiRes = await fetch('/api/ai/extract-sc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawRows: filtered }),
          });

          if (!aiRes.ok) {
            const err = await aiRes.json().catch(() => ({ error: 'AI 解析失败' }));
            setResult({ passed: false, msg: err.error || 'AI 解析失败' });
            setPhase('idle');
            return;
          }

          const aiData = await aiRes.json();
          setPreview(aiData.items || []);
          setSummary(aiData.summary || { totalItems: 0, abnormalCount: 0 });
          setPhase('preview');
        } catch {
          setResult({ passed: false, msg: '解析 Excel 失败' });
          setPhase('idle');
        }
      };
      reader.readAsArrayBuffer(file);
    } catch {
      setResult({ passed: false, msg: '读取文件失败' });
      setPhase('idle');
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview([]);
    setSummary({ totalItems: 0, abnormalCount: 0 });
    setResult(null);
    setPhase('idle');
  };

  const handleConfirmImport = async () => {
    if (!file || preview.length === 0) return;
    setPhase('importing');

    try {
      const batchNo = `SC-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

      const items = preview.map((item) => ({
        markNo: item.markNo,
        品名: item.品名,
        总体积: item.总体积,
        成本单价_cents: Math.round((item.成本单价 || 0) * 100),
        货型: item.货型,
        运输方式: item.运输方式,
        customerId: 0,
        ai_verified: item.verdict === '通过' ? 1 : 0,
        ai_verify_msg: item.reason || '',
      }));

      const totalVol = items.reduce((s, i) => s + (i.总体积 || 0), 0);

      const batchRes = await fetch('/api/shared-containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchNo, totalVolumeUploaded: totalVol, originalFilename: file.name }),
      });
      const batchData = await batchRes.json();

      const importRes = await fetch('/api/shared-container-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batchData.id, items }),
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
    } catch {
      setResult({ passed: false, msg: '导入失败' });
      setPhase('preview');
    }
  };

  const abnormalItems = preview.filter(i => i.verdict === '异常');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">上传拼柜表格</h1>

      {phase === 'preview' || phase === 'importing' ? (
        <Card>
          <CardHeader>
            <CardTitle>
              预览数据
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                共 {summary.totalItems} 条{summary.abnormalCount > 0 ? `，${summary.abnormalCount} 条异常` : '，全部通过'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.abnormalCount > 0 && (
              <div className="p-3 rounded-lg bg-yellow-50 text-yellow-700 text-sm max-h-32 overflow-auto">
                {abnormalItems.map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="shrink-0">第{item.rowIndex}行：</span>
                    <span>{item.reason}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="border rounded-lg overflow-auto max-h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 sticky top-0 bg-muted">#</TableHead>
                    <TableHead className="sticky top-0 bg-muted">唛头</TableHead>
                    <TableHead className="sticky top-0 bg-muted">品名</TableHead>
                    <TableHead className="sticky top-0 bg-muted text-right">体积</TableHead>
                    <TableHead className="sticky top-0 bg-muted text-right">单价</TableHead>
                    <TableHead className="sticky top-0 bg-muted">货型</TableHead>
                    <TableHead className="sticky top-0 bg-muted">运输</TableHead>
                    <TableHead className="sticky top-0 bg-muted">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 100).map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{item.rowIndex || i + 1}</TableCell>
                      <TableCell>{item.markNo || '-'}</TableCell>
                      <TableCell>{item.品名 || '-'}</TableCell>
                      <TableCell className="text-right">{item.总体积 || '-'}</TableCell>
                      <TableCell className="text-right">{item.成本单价 || '-'}</TableCell>
                      <TableCell>{item.货型 || '-'}</TableCell>
                      <TableCell>{item.运输方式 || '-'}</TableCell>
                      <TableCell>
                        <Badge className={item.verdict === '通过' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                          {item.verdict}
                        </Badge>
                      </TableCell>
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

            {result && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${result.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {result.passed ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                <span>{result.msg}</span>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>上传文件</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>选择 Excel 文件（.xlsx）</Label>
              <Input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>

            {result && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${result.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {result.passed ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                <span>{result.msg}</span>
              </div>
            )}

            <Button onClick={handleExtract} disabled={phase === 'parsing' || !file} className="w-full">
              {phase === 'parsing' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
              {phase === 'parsing' ? 'AI 提取中...' : 'AI 识别并提取数据'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
