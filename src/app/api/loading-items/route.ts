import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { loadingItems, marks, customers, loadingBatches } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

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

    // 🔴修复：用事务包裹整个循环，任何一条失败全部回滚
    db.transaction((tx) => {
      for (const item of items) {
        const cleanMarkNo = (item.markNo || '').replace(/^BL-[\d]{6}-/, '').trim();
        const monthTag = item.monthTag || new Date().toISOString().substring(0, 7);

        let mark = tx.select().from(marks).where(and(eq(marks.markNo, cleanMarkNo), eq(marks.monthTag, monthTag))).get();
        if (!mark) {
          let newCustId = 0;
          if (cleanMarkNo) {
            const existingCust = tx.select().from(customers).where(eq(customers.name, cleanMarkNo)).get();
            if (existingCust) {
              newCustId = existingCust.id;
            } else {
              const result = tx.insert(customers).values({ name: cleanMarkNo }).run();
              newCustId = Number(result.lastInsertRowid);
            }
          }

          const result = tx.insert(marks).values({
            markNo: cleanMarkNo,
            customerId: newCustId,
            mode: '装柜',
            monthTag,
          }).run();
          mark = tx.select().from(marks).where(eq(marks.id, Number(result.lastInsertRowid))).get();
          if (!mark) throw new Error(`创建唛头失败: ${cleanMarkNo}`);
        }
        const custId = mark.customerId;

        const cust = tx.select().from(customers).where(eq(customers.id, custId)).get();
        const warehouse = item.仓库 || null;
        const transport = item.运输方式 || '海运';
        const cargo = item.货型 || '普货';
        let unitPrice = 0;
        if (cust?.priceMatrix) {
          try {
            const matrix = JSON.parse(cust.priceMatrix);
            const m = transport === '海运' ? 'sea' : 'land';
            const t = cargo === '普货' ? 'regular' : cargo === '商检货' ? 'inspection' : 'sensitive';
            const key = m + '_' + t;
            if (warehouse && matrix[warehouse] && typeof matrix[warehouse][key] === 'number') {
              unitPrice = matrix[warehouse][key];
            } else if (typeof matrix[key] === 'number') {
              unitPrice = matrix[key];
            }
          } catch { /* 价格矩阵解析失败，使用默认值 0 */ }
        }

        tx.insert(loadingItems).values({
          batchId,
          markId: mark.id,
          customerId: custId,
          品名: item.品名 || null,
          尺寸_长: item.尺寸_长 || null,
          尺寸_宽: item.尺寸_宽 || null,
          尺寸_高: item.尺寸_高 || null,
          单箱体积: item.单箱体积 ?? null,
          总体积: item.总体积,
          国内单号: item.国内单号 || null,
          单箱数量: item.单箱数量 ?? null,
          总重量: item.总重量 || null,
          箱数: item.箱数 ?? null,
          pcs数量: item.pcs数量 ?? null,
          仓库: warehouse,
          运单号: item.运单号 || '',
          单价: unitPrice,
          需支付总价: item.需支付总价 || 0,
          货型: cargo,
          运输方式: transport,
          payment_status: '待支付',
        }).run();
      }

      tx.update(loadingBatches).set({ status: '待审核' }).where(eq(loadingBatches.id, batchId)).run();
    });

    return NextResponse.json({ success: true, itemCount: items.length });
  } catch (error) {
    console.error('导入装柜数据失败:', error);
    return NextResponse.json({ error: '导入失败，已全部回滚，请检查数据后重试' }, { status: 500 });
  }
}
