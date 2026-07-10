import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, marks, sharedContainerBatches, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const body = await request.json();
    const { batchId, items } = body;

    const custCache = new Map<number, { priceMatrix: Record<string, number>; enableMinVol: boolean }>();

    for (const item of items) {
      // 检查或自动创建客户
      let custId = item.customerId;
      const cleanMarkNo = (item.markNo || '').replace(/^BL-[\d]{6}-/, '');
      const custExists = custId > 0 ? await db.select().from(customers).where(eq(customers.id, custId)).get() : null;
      if (!custExists && cleanMarkNo) {
        const existingCust = await db.select().from(customers).where(eq(customers.name, cleanMarkNo)).get();
        if (existingCust) {
          custId = existingCust.id;
        } else {
          const result = await db.insert(customers).values({ name: cleanMarkNo });
          custId = Number(result.lastInsertRowid);
        }
      }

      let mark = await db.select().from(marks).where(eq(marks.markNo, cleanMarkNo)).get();
      if (!mark) {
        const monthTag = new Date().toISOString().substring(0, 7);
        const result = await db.insert(marks).values({
          markNo: cleanMarkNo,
          customerId: custId,
          mode: '拼柜',
          monthTag,
        });
        mark = await db.select().from(marks).where(eq(marks.id, Number(result.lastInsertRowid))).get();
        if (!mark) throw new Error(`创建唛头失败: ${item.markNo}`);
      }

      // 用价格矩阵算客户应收
      let custInfo = custCache.get(custId);
      if (!custInfo) {
        const cust = await db.select().from(customers).where(eq(customers.id, custId)).get();
        let pm: Record<string, number> = {};
        if (cust?.priceMatrix) { try { pm = JSON.parse(cust.priceMatrix); } catch {} }
        custInfo = { priceMatrix: pm, enableMinVol: cust?.enableMinVolume !== 0 };
        custCache.set(custId, custInfo);
      }
      const transport = item.运输方式 || '海运';
      const cargo = item.货型 || '普货';
      const mode = transport === '海运' ? 'sea' : 'land';
      const type = cargo === '普货' ? 'regular' : cargo === '商检货' ? 'inspection' : 'sensitive';
      const unitPrice = custInfo.priceMatrix[`${mode}_${type}`] || 0;
      const vol = item.单箱体积 ?? item.总体积 ?? 0;
      const minVol = custInfo.enableMinVol ? (transport === '海运' ? 0.5 : 0.3) : 0;
      const chargeVol = Math.max(vol, minVol);
      const receivable = item.客户应收_cents ?? Math.round(unitPrice * chargeVol * 100) / 100;

      await db.insert(sharedContainerItems).values({
        batchId,
        markId: mark!.id,
        customerId: custId,
        品名: item.品名 || null,
        尺寸_长: item.尺寸_长 ?? null,
        尺寸_宽: item.尺寸_宽 ?? null,
        尺寸_高: item.尺寸_高 ?? null,
        单箱体积: item.单箱体积 ?? null,
        总体积: item.总体积,
        国内单号: item.国内单号 || null,
        单箱数量: item.单箱数量 ?? null,
        总重量: item.总重量 || null,
        箱数: item.箱数 ?? null,
        pcs数量: item.pcs数量 ?? null,
        仓库: item.仓库 || null,
        单项重量: item.单项重量 || null,
        备注: item.备注 || null,
        成本单价_cents: item.成本单价_cents || 0,
        需支付总价_cents: item.需支付总价_cents || 0,
        货型: item.货型 || null,
        运输方式: item.运输方式 || null,
        订单总价_cents: item.订单总价_cents || 0,
        运单号: item.运单号 || '',
        客户应收_cents: receivable,
        cost_status: '待支出',
        ai_verified: item.ai_verified || 0,
        ai_verify_msg: item.ai_verify_msg || null,
      });
    }

    await db.update(sharedContainerBatches)
      .set({ status: '待审核' })
      .where(eq(sharedContainerBatches.id, batchId));

    return NextResponse.json({ success: true, itemCount: items.length });
  } catch (error) {
    return NextResponse.json({ error: '导入失败' }, { status: 500 });
  }
}
