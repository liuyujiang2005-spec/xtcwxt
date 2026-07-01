'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

interface Supplier {
  id: number;
  name: string;
  type: string | null;
  contact: string | null;
  defaultCurrency: string | null;
  remark: string | null;
}

const SUPPLIER_TYPES = ['车队', '报关行', '仓库', '船司', '其他'];

export default function SupplierDialog({ mode, supplier }: { mode: 'create' | 'edit' | 'delete'; supplier?: Supplier }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(supplier?.name || '');
  const [type, setType] = useState(supplier?.type || '');
  const [contact, setContact] = useState(supplier?.contact || '');
  const [currency, setCurrency] = useState(supplier?.defaultCurrency || 'CNY');
  const [remark, setRemark] = useState(supplier?.remark || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const body = { id: supplier?.id, name, type, contact, defaultCurrency: currency, remark };
      const url = '/api/suppliers';
      const method = mode === 'edit' ? 'PUT' : mode === 'delete' ? 'DELETE' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'DELETE' ? JSON.stringify({ id: supplier?.id }) : JSON.stringify(body),
      });

      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        alert('操作失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'create' ? '新建供应商' : mode === 'delete' ? '删除供应商' : '编辑供应商';

  const triggerButton = mode === 'create' ? (
    <Button>
      <Plus className="h-4 w-4 mr-2" />
      新建供应商
    </Button>
  ) : mode === 'delete' ? (
    <Button variant="destructive" size="sm">
      <Trash2 className="h-4 w-4" />
    </Button>
  ) : (
    <Button variant="outline" size="sm">
      <Pencil className="h-4 w-4" />
    </Button>
  );

  const formContent = mode === 'delete' ? (
    <p className="py-4">确定要删除供应商 "{supplier?.name}" 吗？此操作不可撤销。</p>
  ) : (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>供应商名称 *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>类型</Label>
          <Select value={type} onValueChange={(v) => setType(v || '')}>
            <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
            <SelectContent>
              {SUPPLIER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>联系人</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>默认币种</Label>
        <Select value={currency} onValueChange={(v) => setCurrency(v || '')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="CNY">CNY</SelectItem>
            <SelectItem value="THB">THB</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>备注</Label>
        <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>{triggerButton}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {formContent}
        <Button onClick={handleSubmit} disabled={loading || (!name && mode !== 'delete')}
          variant={mode === 'delete' ? 'destructive' : 'default'} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {mode === 'delete' ? '确认删除' : mode === 'create' ? '创建' : '保存'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
