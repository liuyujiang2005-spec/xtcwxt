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
import * as XLSX from 'xlsx';

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

interface ScSummary {
  totalItems: number;
  abnormalCount: number;
}

const BATCH_SIZE = 50;

export default function UploadSharedContainerPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);

  const [phase, setPhase] = useState<'idle' | 'parsing' | 'preview' | 'importing'>('idle');
  const [preview, setPreview] = useState<ScItem[]>([]);
  const [summary, setSummary] = useState<ScSummary>({ totalItems: 0, abnormalCount: 0 });
  const [result, setResult] = useState<{ passed: boolean; msg: string } | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [customerId, setCustomerId] = useState<number>(0);

  const handleExtract = async () => {
    if (!file) return;
    setPhase('parsing');
    setResult(null);
    setPreview([]);
    setProgress({ current: 0, total: 0 });

    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const wb = XLSX.read(ev.target?.result, { type: 'array' });

          let ws: XLSX.WorkSheet | null = null;
          let targetSheet = '';
          for (const name of wb.SheetNames) {
            const test: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
            if (test.some((r: unknown[]) => r.some((c: unknown) => String(c).trim() !== ''))) {
              ws = wb.Sheets[name];
              targetSheet = name;
              break;
            }
          }
          if (!ws) {
            setResult({ passed: false, msg: '所有 sheet 均为空' });
            setPhase('idle');
            return;
          }
          console.log('使用 sheet:', targetSheet);

          const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

          const filtered = rawRows.filter((row) =>
            row.some((cell) => String(cell).trim() !== ''),
          );

          if (filtered.length < 2) {
            setResult({ passed: false, msg: '表格至少需要表头和一行数据' });
            setPhase('idle');
            return;
          }

          const colCount = Math.max(...filtered.map((r) => r.length));
          const nonEmptyCols: number[] = [];
          for (let c = 0; c < colCount; c++) {
            if (filtered.some((row) => String(row[c] || '').trim() !== '')) {
              nonEmptyCols.push(c);
            }
          }
          const compact = filtered.map((row) =>
            nonEmptyCols.map((c) => row[c] ?? ''),
          );
          const header = compact[0];
          const dataRows = compact.slice(1);
          console.log('去除空列后 — 表头:', header, '数据行数:', dataRows.length);

          // 前向填充：唛头列和运单号列
          const markColIdx = header.findIndex((h) => String(h).includes('唛头'));
          const trackingColIdx = header.findIndex((h) => String(h).includes('单号') || String(h).includes('运单'));
          for (let i = 1; i < dataRows.length; i++) {
            if (markColIdx !== -1 && !String(dataRows[i][markColIdx] || '').trim() && String(dataRows[i - 1][markColIdx] || '').trim()) {
              dataRows[i][markColIdx] = dataRows[i - 1][markColIdx];
            }
            if (trackingColIdx !== -1 && !String(dataRows[i][trackingColIdx] || '').trim() && String(dataRows[i - 1][trackingColIdx] || '').trim()) {
              dataRows[i][trackingColIdx] = dataRows[i - 1][trackingColIdx];
            }
          }

          // 过滤汇总行：箱数 > 100 且大于其他所有行箱数之和的视为汇总行
          const boxColIdx = header.findIndex((h) => String(h).includes('箱数') || String(h).includes('件数'));
          let finalRows: unknown[][] = dataRows;
          if (boxColIdx !== -1) {
            const boxes = dataRows.map((r) => parseFloat(String(r[boxColIdx])) || 0);
            const filtered: unknown[][] = [];
            for (let i = 0; i < dataRows.length; i++) {
              const myBox = boxes[i];
              const othersSum = boxes.reduce((sum, b, j) => j !== i ? sum + b : sum, 0);
              if (myBox > 100 && myBox > othersSum) continue;
              filtered.push(dataRows[i]);
            }
            if (filtered.length < dataRows.length) {
              console.log(`过滤汇总行: ${dataRows.length - filtered.length} 行被移除`);
            }
            finalRows = filtered;
          }

          const totalBatches = Math.ceil(finalRows.length / BATCH_SIZE);
          let allItems: ScItem[] = [];

          for (let i = 0; i < totalBatches; i++) {
            const start = i * BATCH_SIZE;
            const batchRows = finalRows.slice(start, start + BATCH_SIZE);
            const batch = [header, ...batchRows];

            const aiRes = await fetch('/api/ai/extract-sc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rawRows: batch }),
            });

            if (!aiRes.ok) {
              const err = await aiRes.json().catch(() => ({ error: 'AI 解析失败' }));
              setResult({ passed: false, msg: err.error || `第 ${i + 1}/${totalBatches} 组解析失败` });
              setPhase('idle');
              return;
            }

            const aiData = await aiRes.json();
            allItems = [...allItems, ...(aiData.items || [])];

            setProgress({ current: i + 1, total: totalBatches });
          }

          allItems = allItems.map((item, idx) => ({ ...item, rowIndex: idx + 1 }));

          // 从提取结果取客户名，查库匹配 customerId
          const customerName = allItems.find((item) => item.客户 && item.客户.trim())?.客户;
          if (customerName) {
            try {
              const res = await fetch('/api/customers');
              const list = await res.json();
              const match = (Array.isArray(list) ? list : []).find(
                (c: any) => c.name === customerName.trim()
              );
              if (match) setCustomerId(match.id);
            } catch {}
          }

          setPreview(allItems);
          setSummary({
            totalItems: allItems.length,
            abnormalCount: allItems.filter((i) => i.verdict === '异常').length,
          });
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
    setProgress({ current: 0, total: 0 });
    setCustomerId(0);
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
        尺寸_长: item.尺寸_长 || 0,
        尺寸_宽: item.尺寸_宽 || 0,
        尺寸_高: item.尺寸_高 || 0,
        单箱体积: item.单箱体积 || 0,
        总体积: item.总体积 || 0,
        国内单号: item.国内单号 || '',
        单箱数量: item.单箱数量 || 0,
        总重量: item.总重量 || 0,
        箱数: item.箱数 || 0,
        pcs数量: item.pcs数量 || 0,
        成本单价_cents: Math.round((item.成本单价 || 0) * 100),
        需支付总价_cents: Math.round((item.需支付总价 || 0) * 100),
        货型: item.货型 || '',
        运输方式: item.运输方式 || '',
        客户应收_cents: Math.round((item.需支付总价 || 0) * 100),
        结算状态: item.结算状态 || '',
        customerId,
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

  const fmtSize = (item: ScItem) => {
    if (!item.尺寸_长 && !item.尺寸_宽 && !item.尺寸_高) return '-';
    return `${item.尺寸_长 || '-'}×${item.尺寸_宽 || '-'}×${item.尺寸_高 || '-'}`;
  };

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
                    <TableHead className="w-10 sticky top-0 bg-muted">#</TableHead>
                    <TableHead className="sticky top-0 bg-muted">唛头</TableHead>
                    <TableHead className="sticky top-0 bg-muted">品名</TableHead>
                    <TableHead className="sticky top-0 bg-muted">客户</TableHead>
                    <TableHead className="sticky top-0 bg-muted">尺寸</TableHead>
                    <TableHead className="sticky top-0 bg-muted text-right">单箱体积</TableHead>
                    <TableHead className="sticky top-0 bg-muted text-right">总体积</TableHead>
                    <TableHead className="sticky top-0 bg-muted text-right">单价</TableHead>
                    <TableHead className="sticky top-0 bg-muted text-right">总价</TableHead>
                    <TableHead className="sticky top-0 bg-muted">国内单号</TableHead>
                    <TableHead className="sticky top-0 bg-muted text-right">数量</TableHead>
                    <TableHead className="sticky top-0 bg-muted text-right">重量</TableHead>
                    <TableHead className="sticky top-0 bg-muted text-right">箱数</TableHead>
                    <TableHead className="sticky top-0 bg-muted text-right">pcs</TableHead>
                    <TableHead className="sticky top-0 bg-muted">货型</TableHead>
                    <TableHead className="sticky top-0 bg-muted">运输</TableHead>
                    <TableHead className="sticky top-0 bg-muted">结算</TableHead>
                    <TableHead className="sticky top-0 bg-muted">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{item.rowIndex || i + 1}</TableCell>
                      <TableCell>{item.markNo || '-'}</TableCell>
                      <TableCell>{item.品名 || '-'}</TableCell>
                      <TableCell>{item.客户 || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{fmtSize(item)}</TableCell>
                      <TableCell className="text-right">{item.单箱体积 || '-'}</TableCell>
                      <TableCell className="text-right">{item.总体积 || '-'}</TableCell>
                      <TableCell className="text-right">{item.成本单价 || '-'}</TableCell>
                      <TableCell className="text-right">{item.需支付总价 || '-'}</TableCell>
                      <TableCell className="text-xs">{item.国内单号 || '-'}</TableCell>
                      <TableCell className="text-right">{item.单箱数量 || '-'}</TableCell>
                      <TableCell className="text-right">{item.总重量 || '-'}</TableCell>
                      <TableCell className="text-right">{item.箱数 || '-'}</TableCell>
                      <TableCell className="text-right">{item.pcs数量 || '-'}</TableCell>
                      <TableCell>{item.货型 || '-'}</TableCell>
                      <TableCell>{item.运输方式 || '-'}</TableCell>
                      <TableCell>{item.结算状态 || '-'}</TableCell>
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
              {phase === 'parsing'
                ? progress.total > 0
                  ? `AI 提取中 ${progress.current}/${progress.total}...`
                  : 'AI 提取中...'
                : 'AI 识别并提取数据'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
