'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus } from 'lucide-react';

interface Customer {
  id: number;
  name: string;
}

interface Shipment {
  id: number;
  shipmentNo: string;
  customerId: number;
  totalReceivableCents: number;
  status: string;
}

interface Props {
  customers: Customer[];
  shipments: Shipment[];
}

export default function CreateInvoiceDialog({ customers, shipments }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [selectedShipments, setSelectedShipments] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const filteredShipments = shipments.filter(
    (s) => s.customerId === parseInt(customerId || '0')
  );

  const totalAmount = selectedShipments.reduce((sum, id) => {
    const s = shipments.find((s) => s.id === id);
    return sum + (s?.totalReceivableCents || 0);
  }, 0);

  const toggleShipment = (id: number) => {
    setSelectedShipments((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: parseInt(customerId),
          shipmentIds: selectedShipments,
          totalAmountCents: totalAmount,
        }),
      });
      if (res.ok) {
        setOpen(false);
        setSelectedShipments([]);
        router.refresh();
      } else {
        alert('创建失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          新建发票
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>新建发票</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>客户</Label>
            <Select value={customerId} onValueChange={(v) => { setCustomerId(v || ''); setSelectedShipments([]); }}>
              <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredShipments.length > 0 && (
            <div className="space-y-2">
              <Label>选择票货</Label>
              <div className="border rounded-lg max-h-60 overflow-auto">
                {filteredShipments.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 p-2 hover:bg-muted cursor-pointer">
                    <Checkbox
                      checked={selectedShipments.includes(s.id)}
                      onCheckedChange={() => toggleShipment(s.id)}
                    />
                    <span className="text-sm flex-1">{s.shipmentNo}</span>
                    <span className="text-sm text-muted-foreground">¥{(s.totalReceivableCents / 100).toFixed(2)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {selectedShipments.length > 0 && (
            <div className="flex justify-between font-bold text-lg p-3 bg-muted rounded-lg">
              <span>合计金额:</span>
              <span>¥{(totalAmount / 100).toFixed(2)}</span>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={loading || !customerId || selectedShipments.length === 0} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            生成发票
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
