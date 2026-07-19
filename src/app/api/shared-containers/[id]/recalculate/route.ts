import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, customers, sharedContainerBatches } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

function getMatrixPrice(pm: any, warehouse: string | null, transport: string, cargo: string): number {
  const m = transport === '海运' ? 'sea' : 'land';
  const t = cargo === '普货' ? 'regular' : cargo === '商检货' ? 'inspection' : 'sensitive';
  const key = m + '_' + t;
  if (warehouse && typeof pm[warehouse] === 'object' && pm[warehouse] !== null && typeof pm[warehouse][key] === 'number') return (pm[warehouse] as any)[key];
  return typeof pm[key] === 'number' ? pm[key] : 0;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const { id } = await params;
    const batchId = parseInt(id);
    const batch = await db.select().from(sharedContainerBatches).where(eq(sharedContainerBatches.id, batchId)).get();
    if (!batch) return NextResponse.json({ error: '批次不存在' }, { status: 404 });

    const items = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.batchId, batchId)).all();
    if (items.length === 0) return NextResponse.json({ success: true, message: '无明细，无需重算' });

    db.transaction((tx) => {
      const custCache = new Map<number, { pm: any; em: boolean }>();
      for (const item of items) {
        let ci = custCache.get(item.customerId);
        if (!ci) {
          const c = tx.select().from(customers).where(eq(customers.id, item.customerId)).get();
          let pm: any = {};
          if (c?.priceMatrix) { try { pm = JSON.parse(c.priceMatrix); } catch {} }
          ci = { pm, em: c?.enableMinVolume !== 0 };
          custCache.set(item.customerId, ci);
        }

        const transport = item.运输方式 || '海运';
        const cargo = item.货型 || '普货';
        const warehouse = (item as any).仓库 || null;
        const price = getMatrixPrice(ci.pm, warehouse, transport, cargo);
        const vol = item.单箱体积 ?? item.总体积 ?? 0;
        const minVol = ci.em ? (transport === '海运' ? 0.5 : 0.3) : 0;
        const chargeVol = Math.max(vol, minVol);
        const receivable = Math.round(price * chargeVol * 100) / 100;

        tx.update(sharedContainerItems).set({ 客户应收: receivable }).where(eq(sharedContainerItems.id, item.id)).run();
      }
    });

    return NextResponse.json({ success: true, message: `已重算 ${items.length} 条明细` });
  } catch (error) {
    console.error('重算拼柜应收失败:', error);
    return NextResponse.json({ error: '重算失败' }, { status: 500 });
  }
}
