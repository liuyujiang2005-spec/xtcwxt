const fs = require("fs");

// 1. Sidebar: remove "供应商应付"
let s = fs.readFileSync("src/components/sidebar.tsx", "utf8");
s = s.replace(/\s*\{ name: '供应商应付', href: '\/accounts\/suppliers', icon: Truck \},?\n?/g, "");
fs.writeFileSync("src/components/sidebar.tsx", s);
console.log("1. sidebar fixed");

// 2. Revenue page: rewrite with individual records + edit/delete
const revenuePage = `import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { directIncome, customers } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Trash2, Pencil } from 'lucide-react';
import { NewIncomeDialog } from './NewIncomeDialog';
import { DeleteIncomeButton } from './DeleteIncomeButton';
import { EditIncomeDialog } from './EditIncomeDialog';

export default async function RevenuePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const allIncome = await db.select().from(directIncome).orderBy(desc(directIncome.incomeDate || desc(directIncome.createdAt))).all();
  const allCustomers = await db.select().from(customers).all();
  const customerMap = new Map(allCustomers.map((c) => [c.id, c.name]));

  const summary = new Map<number, { CNY: number; THB: number; count: number }>();
  allIncome.forEach((i) => {
    const entry = summary.get(i.customerId) || { CNY: 0, THB: 0, count: 0 };
    entry.count++;
    if (i.currency === 'THB') entry.THB += i.amountCents;
    else entry.CNY += i.amountCents;
    summary.set(i.customerId, entry);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">收入总表</h1>
        <NewIncomeDialog />
      </div>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">明细（{allIncome.length} 条）</h2></div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead>币种</TableHead>
                <TableHead className="text-right">体积</TableHead>
                <TableHead>日期</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allIncome.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{customerMap.get(i.customerId) || '-'}</TableCell>
                  <TableCell className="text-right">¥{i.amountCents.toFixed(6)}</TableCell>
                  <TableCell>{i.currency}</TableCell>
                  <TableCell className="text-right">{i.volume ? `\${i.volume.toFixed(6)}m³` : '-'}</TableCell>
                  <TableCell className="text-sm">{i.incomeDate}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{i.remark || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <EditIncomeDialog income={i} customers={allCustomers} />
                      <DeleteIncomeButton incomeId={i.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {allIncome.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">暂无收入记录</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">按客户汇总</h2></div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户</TableHead>
                <TableHead className="text-right">笔数</TableHead>
                <TableHead className="text-right">CNY</TableHead>
                <TableHead className="text-right">THB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from(summary.entries()).map(([cid, v]) => (
                <TableRow key={cid}>
                  <TableCell className="font-medium">{customerMap.get(cid) || '-'}</TableCell>
                  <TableCell className="text-right">{v.count}</TableCell>
                  <TableCell className="text-right">¥{v.CNY.toFixed(6)}</TableCell>
                  <TableCell className="text-right">THB {v.THB.toFixed(6)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}`;
fs.writeFileSync("src/app/(main)/revenue/page.tsx", revenuePage);
console.log("2. revenue page rewritten");

// Create NewIncomeDialog
const newIncomeDlg = `'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus } from 'lucide-react';

export function NewIncomeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [volume, setVolume] = useState('');
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().substring(0, 10));
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!customerId || !amount) return;
    setLoading(true);
    const r = await fetch('/api/direct-income', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: parseInt(customerId),
        amountCents: parseFloat(amount),
        currency,
        volume: volume ? parseFloat(volume) : null,
        incomeDate,
        remark,
      }),
    });
    if (r.ok) { setOpen(false); router.refresh(); }
    else { alert('创建失败'); }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger><Button><Plus className="h-4 w-4 mr-2" />新建收入</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>新建收入</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>客户ID</Label><Input type="number" value={customerId} onChange={e => setCustomerId(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>金额</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
            <div className="space-y-2"><Label>币种</Label><Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CNY">CNY</SelectItem><SelectItem value="THB">THB</SelectItem></SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label>体积 (m³)</Label><Input type="number" step="0.000001" value={volume} onChange={e => setVolume(e.target.value)} /></div>
          <div className="space-y-2"><Label>日期</Label><Input type="date" value={incomeDate} onChange={e => setIncomeDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>备注</Label><Input value={remark} onChange={e => setRemark(e.target.value)} /></div>
          <Button onClick={handleSubmit} disabled={loading || !customerId || !amount} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}创建
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}`;
fs.mkdirSync("src/app/(main)/revenue", { recursive: true });
fs.writeFileSync("src/app/(main)/revenue/NewIncomeDialog.tsx", newIncomeDlg);
console.log("3. NewIncomeDialog created");

// Create DeleteIncomeButton
const delBtn = `'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';

export function DeleteIncomeButton({ incomeId }: { incomeId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const handleDelete = async () => {
    if (!confirm('确认删除？')) return;
    setLoading(true);
    const r = await fetch('/api/direct-income/' + incomeId, { method: 'DELETE' });
    if (r.ok) router.refresh(); else alert('删除失败');
    setLoading(false);
  };
  return <Button variant="ghost" size="sm" onClick={handleDelete} disabled={loading}>{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-red-500" />}</Button>;
}`;
fs.writeFileSync("src/app/(main)/revenue/DeleteIncomeButton.tsx", delBtn);
console.log("4. DeleteIncomeButton created");

// Create EditIncomeDialog
const editDlg = `'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Pencil } from 'lucide-react';

export function EditIncomeDialog({ income, customers }: { income: any; customers: any[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState(String(income.customerId));
  const [amount, setAmount] = useState(String(income.amountCents));
  const [currency, setCurrency] = useState(income.currency || 'CNY');
  const [volume, setVolume] = useState(String(income.volume || ''));
  const [incomeDate, setIncomeDate] = useState(income.incomeDate);
  const [remark, setRemark] = useState(income.remark || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    const r = await fetch('/api/direct-income/' + income.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: parseInt(customerId),
        amountCents: parseFloat(amount),
        currency,
        volume: volume ? parseFloat(volume) : null,
        incomeDate,
        remark,
      }),
    });
    if (r.ok) { setOpen(false); router.refresh(); } else { alert('保存失败'); }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>编辑收入</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>客户ID</Label><Input type="number" value={customerId} onChange={e => setCustomerId(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>金额</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
            <div className="space-y-2"><Label>币种</Label><Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CNY">CNY</SelectItem><SelectItem value="THB">THB</SelectItem></SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label>体积 (m³)</Label><Input type="number" step="0.000001" value={volume} onChange={e => setVolume(e.target.value)} /></div>
          <div className="space-y-2"><Label>日期</Label><Input type="date" value={incomeDate} onChange={e => setIncomeDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>备注</Label><Input value={remark} onChange={e => setRemark(e.target.value)} /></div>
          <Button onClick={handleSave} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}`;
fs.writeFileSync("src/app/(main)/revenue/EditIncomeDialog.tsx", editDlg);
console.log("5. EditIncomeDialog created");

// 6. Delete old direct-income pages (keep API routes)
fs.rmSync("src/app/(main)/direct-income", { recursive: true, force: true });
console.log("6. direct-income pages deleted");

// 7. Expenses page: change button to dialog
let expPage = fs.readFileSync("src/app/(main)/expenses/page.tsx", "utf8");
expPage = expPage.replace(
  '<Link href="/direct-income/new"><Button><Plus className="h-4 w-4 mr-2" />新建费用</Button></Link>',
  '<NewExpenseDialog />'
);
// Add import
expPage = expPage.replace(
  "import { DeleteExpenseButton } from './DeleteExpenseButton';",
  "import { DeleteExpenseButton } from './DeleteExpenseButton';\nimport { NewExpenseDialog } from './NewExpenseDialog';"
);
fs.writeFileSync("src/app/(main)/expenses/page.tsx", expPage);
console.log("7. expenses page fixed");
