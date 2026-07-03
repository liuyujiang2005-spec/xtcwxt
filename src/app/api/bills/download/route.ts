import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { marks, customers, sharedContainerItems, loadingItems, directIncome } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { generateBillXlsx } from '@/lib/generate-bill-xlsx';

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const customerId = parseInt(searchParams.get('customerId') || '');
  const month = searchParams.get('month') || '';

  if (!customerId || !month) {
    return NextResponse.json({ error: '缺少参数 customerId 或 month' }, { status: 400 });
  }

  const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
  if (!customer) return NextResponse.json({ error: '客户不存在' }, { status: 404 });

  const markList = await db.select().from(marks)
    .where(and(eq(marks.customerId, customerId), eq(marks.monthTag, month)))
    .all();

  type BillRow = Parameters<typeof generateBillXlsx>[3][number];

  const rows: BillRow[] = [];
  let totalCny = 0;
  let totalThb = 0;

  for (const mark of markList) {
    const scItems = await db.select().from(sharedContainerItems)
      .where(eq(sharedContainerItems.markId, mark.id)).all();
    const ldItems = await db.select().from(loadingItems)
      .where(eq(loadingItems.markId, mark.id)).all();
    const diItems = await db.select().from(directIncome)
      .where(eq(directIncome.markId, mark.id)).all();

    for (const item of scItems) {
      const receivable = item.客户应收_cents || 0;
      const unitPrice = item.总体积 > 0 ? Math.round(receivable / item.总体积) : 0;
      rows.push({
        日期: mark.createdAt?.substring(0, 10) || '',
        唛头: mark.markNo,
        入库仓位: '深圳仓',
        运输方式: item.运输方式 || '',
        单号: '',
        货物类型: item.货型 || '',
        品名: item.品名 || '',
        尺寸: '',
        件数: 0,
        单项体积: item.总体积,
        计费体积: item.总体积,
        单价: unitPrice / 100,
        备注: '',
        结算状态: '未支付',
        柜号: '',
      });
      totalCny += receivable;
    }

    for (const item of ldItems) {
      const receivable = item.需支付总价_cents || 0;
      rows.push({
        日期: mark.createdAt?.substring(0, 10) || '',
        唛头: mark.markNo,
        入库仓位: '深圳仓',
        运输方式: item.运输方式 || '',
        单号: '',
        货物类型: item.货型 || '',
        品名: item.品名 || '',
        尺寸: '',
        件数: 0,
        单项体积: item.总体积,
        计费体积: item.总体积,
        单价: (item.单价_cents || 0) / 100,
        备注: '',
        结算状态: item.payment_status || '未支付',
        柜号: '',
      });
      totalCny += receivable;
    }

    for (const item of diItems) {
      rows.push({
        日期: item.incomeDate || '',
        唛头: mark.markNo,
        入库仓位: '',
        运输方式: '',
        单号: '',
        货物类型: '',
        品名: '直接收入',
        尺寸: '',
        件数: 0,
        单项体积: item.volume || 0,
        计费体积: item.volume || 0,
        单价: item.amountCents / 100,
        备注: item.remark || '',
        结算状态: '未支付',
        柜号: '',
      });
      if (item.currency === 'THB') {
        totalThb += item.amountCents;
      } else {
        totalCny += item.amountCents;
      }
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: '该客户在所选月份没有业务数据' }, { status: 404 });
  }

  const buffer = await generateBillXlsx(
    '深圳新泓瀚国际物流有限公司',
    customer.name,
    month,
    rows,
    totalCny,
    totalThb,
  );

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="账单_${customer.name}_${month}.xlsx"`,
    },
  });
}
