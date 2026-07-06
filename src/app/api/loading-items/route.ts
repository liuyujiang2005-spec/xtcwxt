import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { loadingItems, marks, customers, loadingBatches } from '@/db/schema';
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

    for (const item of items) {
      // 检查或自动创建客户
      let custId = item.customerId;
      const custExists = custId > 0 ? await db.select().from(customers).where(eq(customers.id, custId)).get() : null;
      if (!custExists && item.markNo) {
        const existingCust = await db.select().from(customers).where(eq(customers.name, item.markNo)).get();
        if (existingCust) {
          custId = existingCust.id;
        } else {
          const result = await db.insert(customers).values({ name: item.markNo });
          custId = Number(result.lastInsertRowid);
        }
      }

      let mark = await db.select().from(marks).where(eq(marks.markNo, item.markNo)).get();
      if (!mark) {
        const monthTag = new Date().toISOString().substring(0, 7);
        const result = await db.insert(marks).values({
          markNo: item.markNo,
          customerId: custId,
          mode: '装柜',
          monthTag,
        });
        mark = await db.select().from(marks).where(eq(marks.id, Number(result.lastInsertRowid))).get();
        if (!mark) throw new Error(`创建唛头失败: ${item.markNo}`);
      }

      const cust = await db.select().from(customers).where(eq(customers.id, custId)).get();
      let unitPriceCents = 0;
      if (cust?.priceMatrix) {
        try {
          const matrix = JSON.parse(cust.priceMatrix);
          const mode = item.运输方式 === '海运' ? 'sea' : 'land';
          const type = item.货型 === '普货' ? 'regular' : item.货型 === '商检货' ? 'inspection' : 'sensitive';
          if (!item.运输方式 || !item.货型) {
            console.log(`客户 ${cust?.name || item.customerId} 运输方式="${item.运输方式 || '空'}" 或货型="${item.货型 || '空'}"，默认取 sea_${type}`);
          }
          const key = `${mode}_${type}`;
          unitPriceCents = Math.round((matrix[key] || 0) * 100);
        } catch {}
      }

      await db.insert(loadingItems).values({
        batchId,
        markId: mark!.id,
        customerId: item.customerId,
        品名: item.品名 || null,
        尺寸_长: item.尺寸_长 || null,
        尺寸_宽: item.尺寸_宽 || null,
        尺寸_高: item.尺寸_高 || null,
        单箱体积: item.单箱体积 || null,
        总体积: item.总体积,
        国内单号: item.国内单号 || null,
        单箱数量: item.单箱数量 || null,
        总重量: item.总重量 || null,
        箱数: item.箱数 || null,
        pcs数量: item.pcs数量 || null,
        单价_cents: unitPriceCents,
        需支付总价_cents: item.需支付总价_cents || 0,
        货型: item.货型 || null,
        运输方式: item.运输方式 || null,
        payment_status: '待支付',
      });
    }

    await db.update(loadingBatches).set({ status: '待审核' }).where(eq(loadingBatches.id, batchId));

    return NextResponse.json({ success: true, itemCount: items.length });
  } catch (error) {
    return NextResponse.json({ error: '导入失败' }, { status: 500 });
  }
}
