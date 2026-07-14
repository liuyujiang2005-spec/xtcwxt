'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';

export function ExportButton({ apiPath, label }: { apiPath: string; label: string }) {
  const [loading, setLoading] = useState(false);

  const exportExcel = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiPath);
      if (!res.ok) { alert('导出失败'); setLoading(false); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${label}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('下载失败'); }
    setLoading(false);
  };

  return (
    <Button variant="outline" size="sm" onClick={exportExcel} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
      导出Excel
    </Button>
  );
}
