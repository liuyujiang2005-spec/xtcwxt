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

    if (!batchId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 });
    }

    // 🔴修复：用事务包裹整个导入，失败全部回滚
    db.transaction((tx) => {
      const custCache = new Map<number, { priceMatrix: Record<string, number>; enableMinVol: boolean }>();

      for (const item of items) {
        let custId = item.customerId;
        const cleanMarkNo = (item.markNo || '').replace(/^BL-[\d]{6}-/, '');

        const custExists = custId > 0
          ? tx.select().from(customers).where(eq(customers.id, custId)).get()
          : null;

        if (!custExists && cleanMarkNo) {
          const existingCust = tx.select().from(customers).where(eq(customers.name, cleanMarkNo)).get();
          if (existingCust) {
            custId = existingCust.id;
          } else {
            const result = tx.insert(customers).values({ name: cleanMarkNo }).run();
            custId = Number(result.lastInsertRowid);
          }
        }

        let mark = tx.select().from(marks).where(eq(marks.markNo, cleanMarkNo)).get();
        if (!mark) {
          const monthTag = new Date().toISOString().substring(0, 7);
          const result = tx.insert(marks).values({
            markNo: cleanMarkNo, customerId: custId, mode: '拼柜', monthTag,
          }).run();
          mark = tx.select().from(marks).where(eq(marks.id, Number(result.lastInsertRowid))).get();
          // 🔴修复：mark 为 null 时抛出明确错误
          if (!mark) throw new Error(`创建唛头失败: ${item.markNo}`);
        }

        // 用价格矩阵算客户应收
        let custInfo = custCache.get(custId);
        if (!custInfo) {
          const cust = tx.select().from(customers).where(eq(customers.id, custId)).get();
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

        tx.insert(sharedContainerItems).values({
          batchId,
          markId: mark.id,
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
        }).run();
      }

      tx.update(sharedContainerBatches).set({ status: '待审核' }).where(eq(sharedContainerBatches.id, batchId)).run();
    });

    return NextResponse.json({ success: true, itemCount: items.length });
  } catch (error) {
    console.error('导入拼柜数据失败:', error);
    return NextResponse.json({ error: '导入失败，已全部回滚，请检查数据后重试' }, { status: 500 });
  }
}
