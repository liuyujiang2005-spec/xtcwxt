import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { marks, sharedContainerItems, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { getMonthTag } from '@/lib/format';
import { generateBillXlsx, type BillRow } from '@/lib/generate-bill-xlsx';
import { and, eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const user = await validateSession(sessionToken);
  if (!user) return NextResponse.json({ error: '登录已过期' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const customerId = Number(searchParams.get('customerId'));
  const month = searchParams.get('month') || getMonthTag();

  if (!customerId) return NextResponse.json({ error: '请选择客户' }, { status: 400 });

  const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
  if (!customer) return NextResponse.json({ error: '客户不存在' }, { status: 404 });

  // 查询该客户当月所有唛头
  const customerMarks = await db.select().from(marks)
    .where(and(eq(marks.customerId, customerId), eq(marks.monthTag, month)))
    .all();

  const markIds = customerMarks.map((m) => m.id);
  if (markIds.length === 0) {
    return NextResponse.json({ error: '该客户在所选月份没有记录' }, { status: 404 });
  }

  // 查询拼柜明细（客户应收数据）
  const rows: BillRow[] = [];
  let totalCny = 0;

  for (const mark of customerMarks) {
    const items = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, mark.id)).all();

    for (const item of items) {
      const volume = item.总体积 ?? 0;
      const singleVolume = item.单箱体积 ?? 0;
      const count = item.箱数 ?? 0;
      const amountCents = item.需支付总价_cents ?? 0;
      const amountYuan = amountCents;
      const unitPrice = volume > 0 ? amountYuan / volume : 0;

      totalCny += amountYuan;

      const dimensions = [item.尺寸_长, item.尺寸_宽, item.尺寸_高]
        .filter((d) => d != null)
        .join('x');

      rows.push({
        日期: mark.createdAt?.substring(0, 10) ?? month,
        唛头: mark.markNo,
        入库仓位: '',
        运输方式: mark.mode ?? item.运输方式 ?? '',
        单号: item.国内单号 ?? mark.markNo,
        货物类型: item.货型 ?? '',
        品名: item.品名 ?? '',
        尺寸: dimensions,
        件数: count,
        单项体积: singleVolume,
        计费体积: volume,
        单价: Number(unitPrice.toFixed(2)),
        备注: '',
        结算状态: item.cost_status ?? '',
        柜号: '',
      });
    }
  }

  try {
    const buffer = await generateBillXlsx(
      '湘泰物流',
      customer.name,
      month,
      rows,
      totalCny,
      0,
    );

    const fileName = `账单_${customer.name}_${month}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error('生成账单失败:', error);
    return NextResponse.json({ error: '生成账单失败' }, { status: 500 });
  }
}
