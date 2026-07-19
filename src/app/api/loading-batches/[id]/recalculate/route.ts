import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { loadingItems, marks, customers, loadingBatches } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { cargoKey } from '@/lib/pricing';

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
    const batch = await db.select().from(loadingBatches).where(eq(loadingBatches.id, batchId)).get();
    if (!batch) return NextResponse.json({ error: '批次不存在' }, { status: 404 });

    const items = await db.select().from(loadingItems).where(eq(loadingItems.batchId, batchId)).all();
    if (items.length === 0) return NextResponse.json({ success: true, message: '无明细，无需重算' });

    await db.transaction((tx) => {
      const custMap = new Map<number, { pm: any; em: boolean }>();

      const getCust = (cid: number) => {
        if (custMap.has(cid)) return custMap.get(cid)!;
        const c = tx.select().from(customers).where(eq(customers.id, cid)).get();
        let pm: any = {};
        if (c?.defaultCurrency === 'THB') { if (c?.priceMatrixThb) try { pm = JSON.parse(c.priceMatrixThb); } catch {} }
        else if (c?.priceMatrix) { try { pm = JSON.parse(c.priceMatrix); } catch {} }
        const info = { pm, em: c?.enableMinVolume !== 0 };
        custMap.set(cid, info);
        return info;
      };

      const getPrice = (pm: any, wh: string | null, transport: string, cargo: string): number => {
        const m = transport === '海运' ? 'sea' : 'land';
        const t = cargoKey(cargo);
        const key = m + '_' + t;
        if (wh && typeof pm[wh] === 'object' && pm[wh] !== null && typeof pm[wh][key] === 'number') return (pm[wh] as any)[key];
        return typeof pm[key] === 'number' ? pm[key] : 0;
      };

      // 按 客户+运单号 分组
      const groups = new Map<string, typeof items>();
      items.forEach((item, idx) => {
        const waybill = (item.运单号 || '').trim() || `_${idx}`;
        const gk = `${item.customerId}__${waybill}`;
        if (!groups.has(gk)) groups.set(gk, []);
        groups.get(gk)!.push(item);
      });

      for (const [, group] of groups) {
        const first = group[0];
        const { pm, em } = getCust(first.customerId);
        let orderVol = 0;
        for (const item of group) orderVol = Math.max(orderVol, item.总体积 || 0);
        const transport = first.运输方式 || '海运';
        const cargo = first.货型 || '普货';
        const warehouse = (first as any).仓库 || null;
        const price = getPrice(pm, warehouse, transport, cargo);
        const minVol = em ? (transport === '海运' ? 0.5 : 0.3) : 0;
        const chargeVol = Math.max(orderVol, minVol);
        const receivable = Math.round(price * chargeVol * 100) / 100;

        // 第一条设应收，其余设 0
        tx.update(loadingItems).set({ 客户应收: receivable }).where(eq(loadingItems.id, first.id)).run();
        for (let i = 1; i < group.length; i++) {
          tx.update(loadingItems).set({ 客户应收: 0 }).where(eq(loadingItems.id, group[i].id)).run();
        }
      }
    });

    return NextResponse.json({ success: true, message: `已重算 ${items.length} 条明细` });
  } catch (error) {
    console.error('重算装柜应收失败:', error);
    return NextResponse.json({ error: '重算失败' }, { status: 500 });
  }
}
