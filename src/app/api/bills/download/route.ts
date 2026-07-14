import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { marks, sharedContainerItems, loadingItems, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { getMonthTag } from '@/lib/format';
import { generateBillXlsx, type BillRow } from '@/lib/generate-bill-xlsx';
import { and, eq, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user) return NextResponse.json({ error: '登录已过期' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const customerId = Number(searchParams.get('customerId'));
  const month = searchParams.get('month') || getMonthTag();

  if (!customerId || customerId <= 0) return NextResponse.json({ error: '请选择客户' }, { status: 400 });

  const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
  if (!customer) return NextResponse.json({ error: '客户不存在' }, { status: 404 });

  const customerMarks = await db.select().from(marks)
    .where(and(eq(marks.customerId, customerId), eq(marks.monthTag, month)))
    .all();

  const markIds = customerMarks.map((m) => m.id);
  if (markIds.length === 0) {
    return NextResponse.json({ error: '该客户在所选月份没有记录' }, { status: 404 });
  }

  const markMap = new Map(customerMarks.map((m) => [m.id, m]));

  // 🟡修复：同时查询拼柜和装柜数据（原来只查拼柜）
  const scItems = await db.select().from(sharedContainerItems)
    .where(inArray(sharedContainerItems.markId, markIds)).all();
  const ldItems = await db.select().from(loadingItems)
    .where(inArray(loadingItems.markId, markIds)).all();

  const rows: BillRow[] = [];
  let totalCny = 0;

  // 处理拼柜明细
  for (const item of scItems) {
    const mark = markMap.get(item.markId);
    const volume = item.总体积 ?? 0;
    const singleVolume = item.单箱体积 ?? 0;
    const count = item.箱数 ?? 0;
    const amountYuan = item.客户应收 ?? item.需支付总价 ?? 0;

    // 🟡修复：volume 为 0 时不计算单价，避免 Infinity/NaN 写入 Excel
    const unitPrice = (volume > 0 && amountYuan > 0) ? amountYuan / volume : 0;
    totalCny += amountYuan;

    const dimensions = [item.尺寸_长, item.尺寸_宽, item.尺寸_高]
      .filter((d) => d != null && d > 0)
      .join('×');

    rows.push({
      日期: mark?.createdAt?.substring(0, 10) ?? month,
      唛头: mark?.markNo ?? '',
      仓库: item.仓库 || '',
      运输方式: item.运输方式 ?? '',
      运单号: item.运单号 ?? mark?.markNo ?? '',
      货型: item.货型 ?? '',
      品名: item.品名 ?? '',
      尺寸: dimensions,
      件数: count,
      国内单号: item.国内单号 ?? '',
      单项体积: singleVolume,
      单项重量: item.单项重量 ?? 0,
      总体积: volume,
      总重量: item.总重量 ?? 0,
      计费体积: singleVolume,
      总计费体积: volume,
      单价: Number(unitPrice.toFixed(6)),
      订单总价: amountYuan,
      备注: item.备注 || '',
      结算状态: item.cost_status ?? '',
    });
  }

  // 🟡修复：新增装柜明细处理
  for (const item of ldItems) {
    const mark = markMap.get(item.markId);
    const volume = item.总体积 ?? 0;
    const singleVolume = item.单箱体积 ?? 0;
    const count = item.箱数 ?? 0;
    const amountYuan = item.需支付总价 ?? 0;

    // 🟡修复：同样防止 volume 为 0
    const unitPrice = (volume > 0 && amountYuan > 0) ? amountYuan / volume : (item.单价 ?? 0);
    totalCny += amountYuan;

    const dimensions = [item.尺寸_长, item.尺寸_宽, item.尺寸_高]
      .filter((d) => d != null && d > 0)
      .join('×');

    rows.push({
      日期: mark?.createdAt?.substring(0, 10) ?? month,
      唛头: mark?.markNo ?? '',
      仓库: '',
      运输方式: item.运输方式 ?? '',
      运单号: mark?.markNo ?? '',
      货型: item.货型 ?? '',
      品名: item.品名 ?? '',
      尺寸: dimensions,
      件数: count,
      国内单号: item.国内单号 ?? '',
      单项体积: singleVolume,
      单项重量: 0,
      总体积: volume,
      总重量: item.总重量 ?? 0,
      计费体积: singleVolume,
      总计费体积: volume,
      单价: Number(unitPrice.toFixed(6)),
      订单总价: amountYuan,
      备注: '',
      结算状态: item.payment_status ?? '',
    });
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
