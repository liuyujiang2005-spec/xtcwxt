'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, X } from 'lucide-react';

interface Props {
  apiPath: string; // e.g. '/api/bills/pay' or '/api/expenses/ID'
  entityId: number;
  currentUrl?: string | null;
  updateField?: string; // e.g. 'receipt_url'
}

export function ReceiptUploader({ apiPath, entityId, currentUrl, updateField = 'receiptUrl' }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);

      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!r.ok) { alert('上传失败'); setUploading(false); return; }

      const { url } = await r.json();
      if (!url) { alert('上传成功但获取文件地址失败'); setUploading(false); return; }

      // Update entity with receipt URL
      const ur = await fetch(apiPath, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entityId, [updateField]: url }),
      });
      if (ur.ok) {
        setPreview(url);
        router.refresh();
      } else {
        alert('保存失败');
      }
    } catch { alert('网络错误'); }
    setUploading(false);
  };

  const removeImage = async () => {
    try {
      const ur = await fetch(apiPath, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entityId, [updateField]: null }),
      });
      if (ur.ok) { setPreview(null); router.refresh(); } else { alert('删除失败'); }
    } catch { alert('网络错误'); }
  };

  return (
    <div className="flex items-center gap-2">
      {preview ? (
        <div className="relative inline-block">
          <a href={preview} target="_blank" rel="noopener">
            <img src={preview} alt="水单" className="h-12 w-12 object-cover rounded border" />
          </a>
          <button onClick={removeImage} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs"><X size={10} /></button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        </Button>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
