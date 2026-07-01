'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const STATUSES = ['运输中', '已到仓', '已签收', '已结算'];

export default function ShipmentActions({ shipmentId, currentStatus }: { shipmentId: number; currentStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);

  const handleUpdateStatus = async () => {
    if (status === currentStatus) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        alert('更新失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>操作</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Select value={status} onValueChange={(v) => setStatus(v || '')}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleUpdateStatus} disabled={loading || status === currentStatus}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            更新状态
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
