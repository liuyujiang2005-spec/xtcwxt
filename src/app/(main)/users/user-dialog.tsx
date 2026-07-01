'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

const ROLES = ['admin', 'finance', 'operator', 'viewer'] as const;
const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  finance: '财务',
  operator: '操作员',
  viewer: '查看者',
};

interface Props {
  mode: 'create' | 'edit' | 'delete';
  user?: { id: number; username: string; displayName: string; role: string; active: number };
}

export default function UserDialog({ mode, user }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [role, setRole] = useState(user?.role || 'viewer');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const url = '/api/users';
      let method = 'POST';
      let body: any = {};

      if (mode === 'create') {
        body = { username, displayName, role, password };
      } else if (mode === 'edit') {
        method = 'PUT';
        body = { id: user?.id, displayName, role };
        if (password) body.password = password;
      } else if (mode === 'delete') {
        method = 'DELETE';
        body = { id: user?.id };
      }

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || '操作失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const Icon = mode === 'create' ? Plus : mode === 'delete' ? Trash2 : Pencil;
  const title = mode === 'create' ? '新建用户' : mode === 'delete' ? '删除用户' : '编辑用户';
  const buttonVariant = mode === 'delete' ? 'destructive' : 'default';

  const triggerButton = mode === 'create' ? (
    <Button><Plus className="h-4 w-4 mr-2" />新建用户</Button>
  ) : mode === 'delete' ? (
    <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4" /></Button>
  ) : (
    <Button variant="outline" size="sm"><Pencil className="h-4 w-4" /></Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>{triggerButton}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

        {mode === 'delete' ? (
          <div className="space-y-4 py-4">
            <p>确定要删除用户 "{user?.username}" 吗？此操作不可撤销。</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleSubmit} disabled={loading} variant="destructive" className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}确认删除
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {mode === 'create' && (
              <div className="space-y-2">
                <Label>用户名 *</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label>显示名</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={role} onValueChange={(v) => setRole(v || '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{mode === 'create' ? '密码 *' : '新密码（留空不修改）'}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={mode === 'create'} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleSubmit} disabled={loading || (mode === 'create' && (!username || !password))} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {mode === 'create' ? '创建' : '保存'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
