'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Loader2 } from 'lucide-react';

export function NewBatchButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [batchNo, setBatchNo] = useState(`LD-${`${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}`}-${Date.now().toString().slice(-4)}`);
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!batchNo.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/loading-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchNo: batchNo.trim(), originalFilename: remark.trim() || null }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setOpen(false);
        router.push(`/loading-lists/${data.id}/manual`);
      } else {
        alert(data.error || '创建失败');
      }
    } catch { alert('网络错误'); }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button><Plus className="h-4 w-4 mr-2" />新建批次</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>新建装柜批次</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>批次号 *</Label>
            <Input value={batchNo} onChange={e => setBatchNo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="批次说明（可选）" />
          </div>
          <Button onClick={handleCreate} disabled={loading || !batchNo.trim()} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            创建并录入
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
