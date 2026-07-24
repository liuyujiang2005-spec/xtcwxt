import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { fullContainerItems, fullContainerBatches, marks, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

// 整柜明细导入。与装柜不同:整柜计价是柜级手填一口价,这里不算任何应收,只落成本。
// 沿用「总体积按单项体积之和自算」;唛头→客户解析同装柜;整柜=一个客户,把主客户/月份写回批次。
export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const { batchId, items } = await request.json();
    if (!batchId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 });
    }

    await db.transaction((tx) => {
      // 第一步:解析唛头→客户(含建唛/建客户)
      const resolved: { raw: any; custId: number; markId: number }[] = [];
      let monthTagOfBatch = '';
      for (const item of items) {
        const cleanMarkNo = (item.markNo || '').replace(/^BL-[\d]{6}-/, '').trim();
        const monthTag = item.monthTag || new Date().toISOString().substring(0, 7);
        if (!monthTagOfBatch) monthTagOfBatch = monthTag;

        let mark = tx.select().from(marks).where(and(eq(marks.markNo, cleanMarkNo), eq(marks.monthTag, monthTag))).get();
        if (!mark) {
          let newCustId = 0;
          if (cleanMarkNo) {
            const existingCust = tx.select().from(customers).where(eq(customers.name, cleanMarkNo)).get();
            if (existingCust) newCustId = existingCust.id;
            else newCustId = Number(tx.insert(customers).values({ name: cleanMarkNo }).run().lastInsertRowid);
          }
          const r = tx.insert(marks).values({ markNo: cleanMarkNo, customerId: newCustId, mode: '整柜', monthTag }).run();
          mark = tx.select().from(marks).where(eq(marks.id, Number(r.lastInsertRowid))).get();
          if (!mark) throw new Error(`创建唛头失败: ${cleanMarkNo}`);
        }
        resolved.push({ raw: item, custId: mark.customerId, markId: mark.id });
      }

      // 第二步:按运单分组,总体积一律=组内单项体积之和(源表可能填错);没单项体积时兜底退回源值
      const groups = new Map<string, typeof resolved>();
      resolved.forEach((r, idx) => {
        const ok = (r.raw.运单号 || '').trim() || `_${idx}`;
        if (!groups.has(ok)) groups.set(ok, []);
        groups.get(ok)!.push(r);
      });
      for (const [, group] of groups) {
        const sumVol = group.reduce((s, r) => s + (Number(r.raw.单项体积) || 0), 0);
        const totalVol = sumVol > 0 ? Math.round(sumVol * 1e6) / 1e6 : (Number(group[0].raw.总体积) || 0);
        for (const r of group) r.raw.总体积 = totalVol;
      }

      // 第三步:插入明细(只落成本,无应收)
      for (const { raw: item, custId, markId } of resolved) {
        tx.insert(fullContainerItems).values({
          batchId, markId, customerId: custId,
          品名: item.品名 || null,
          尺寸_长: item.尺寸_长 || null, 尺寸_宽: item.尺寸_宽 || null, 尺寸_高: item.尺寸_高 || null,
          单项体积: item.单项体积 ?? null, 总体积: item.总体积,
          国内单号: item.国内单号 || null, 单箱数量: item.单箱数量 ?? null, 总重量: item.总重量 || null,
          箱数: item.箱数 ?? null, pcs数量: item.pcs数量 ?? null,
          仓库: item.仓库 || null, 运单号: item.运单号 || '',
          单价: item.单价 || 0, 成本单价: item.成本单价 ?? item.单价 ?? 0, 需支付总价: item.需支付总价 || 0,
          货型: item.货型 || '普货', 运输方式: item.运输方式 || '海运',
          payment_status: '待支付',
        }).run();
      }

      // 整柜=一个客户:主客户取出现最多的(通常只有一个),写回批次;月份也写回
      const custCount = new Map<number, number>();
      for (const r of resolved) if (r.custId) custCount.set(r.custId, (custCount.get(r.custId) || 0) + 1);
      let mainCust = 0, best = 0;
      for (const [cid, n] of custCount) if (n > best) { best = n; mainCust = cid; }
      const upd: any = { status: '待验证' };
      if (mainCust) upd.customerId = mainCust;
      if (monthTagOfBatch) upd.monthTag = monthTagOfBatch;
      tx.update(fullContainerBatches).set(upd).where(eq(fullContainerBatches.id, batchId)).run();
    });

    return NextResponse.json({ success: true, itemCount: items.length });
  } catch (error) {
    console.error('导入整柜数据失败:', error);
    return NextResponse.json({ error: '导入失败，已全部回滚，请检查数据后重试' }, { status: 500 });
  }
}
