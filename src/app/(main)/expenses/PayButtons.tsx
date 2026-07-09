'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export function PayExpenseButton({ expenseId }: { expenseId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: '已支付', paidDate: new Date().toISOString().substring(0, 10) }),
      });
      if (res.ok) router.refresh();
      else alert('操作失败');
    } catch { alert('网络错误'); }
    setLoading(false);
  };

  return (
    <Button variant="outline" size="sm" onClick={handlePay} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '支付'}
    </Button>
  );
}

export function PayScItemButton({ itemId }: { itemId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shared-container-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cost_status: '已支出' }),
      });
      if (res.ok) router.refresh();
      else alert('操作失败');
    } catch { alert('网络错误'); }
    setLoading(false);
  };

  return (
    <Button variant="outline" size="sm" onClick={handlePay} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '付'}
    </Button>
  );
}

export function PayLdItemButton({ itemId }: { itemId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/loading-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: '已支付' }),
      });
      if (res.ok) router.refresh();
      else alert('操作失败');
    } catch { alert('网络错误'); }
    setLoading(false);
  };

  return (
    <Button variant="outline" size="sm" onClick={handlePay} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '付'}
    </Button>
  );
}

export function BatchPayScButton({ markId }: { markId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/shared-container-items/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markIds: [markId] }),
      });
      if (res.ok) router.refresh();
      else alert('操作失败');
    } catch { alert('网络错误'); }
    setLoading(false);
  };

  return (
    <Button size="sm" onClick={handlePay} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}一键支付
    </Button>
  );
}

export function BatchPayLdButton({ markId }: { markId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/loading-items/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markIds: [markId] }),
      });
      if (res.ok) router.refresh();
      else alert('操作失败');
    } catch { alert('网络错误'); }
    setLoading(false);
  };

  return (
    <Button size="sm" onClick={handlePay} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}一键支付
    </Button>
  );
}
