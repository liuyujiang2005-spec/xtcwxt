import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { bills, billItems, marks, sharedContainerItems, loadingItems, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { generateBillXlsx, type BillRow } from '@/lib/generate-bill-xlsx';
import { eq, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user) return NextResponse.json({ error: '登录已过期' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const billId = Number(searchParams.get('billId'));
  if (!billId || billId <= 0) return NextResponse.json({ error: '缺少 billId' }, { status: 400 });

  const bill = await db.select().from(bills).where(eq(bills.id, billId)).get();
  if (!bill) return NextResponse.json({ error: '账单不存在' }, { status: 404 });

  const customer = await db.select().from(customers).where(eq(customers.id, bill.customerId)).get();

  const bItems = await db.select().from(billItems).where(eq(billItems.billId, billId)).all();
  const markIds = [...new Set(bItems.map(i => i.markId))];
  if (markIds.length === 0) return NextResponse.json({ error: '无明细' }, { status: 404 });

  const markList = await db.select().from(marks).where(inArray(marks.id, markIds)).all();
  const markMap = new Map(markList.map(m => [m.id, m]));

  const scItems = await db.select().from(sharedContainerItems).where(inArray(sharedContainerItems.markId, markIds)).all();
  const ldItems = await db.select().from(loadingItems).where(inArray(loadingItems.markId, markIds)).all();

  const rows: BillRow[] = [];
  let dedupedTotal = 0;
  const seenOrders = new Set<string>();

  const addRows = (items: any[]) => {
    for (const item of items) {
      const mark = markMap.get(item.markId);
      const volume = item.总体积 ?? 0;
      const singleVolume = item.单箱体积 ?? 0;
      const count = item.箱数 ?? 0;
      const amountYuan = item.客户应收 ?? 0;
      const waybillKey = item.运单号 || mark?.markNo || `_${item.id}`;

      if (!seenOrders.has(waybillKey)) {
        seenOrders.add(waybillKey);
        dedupedTotal += amountYuan;
      }

      const unitPrice = (volume > 0 && amountYuan > 0) ? amountYuan / volume : (item.单价 ?? 0);
      const dimensions = [item.尺寸_长, item.尺寸_宽, item.尺寸_高]
        .filter((d: any) => d != null && d > 0)
        .join('×');

      rows.push({
        日期: mark?.createdAt?.substring(0, 10) ?? bill.monthTag,
        唛头: mark?.markNo ?? '',
        仓库: (item as any).仓库 || '',
        运输方式: item.运输方式 ?? '',
        运单号: item.运单号 ?? mark?.markNo ?? '',
        货型: item.货型 ?? '',
        品名: item.品名 ?? '',
        尺寸: dimensions,
        件数: count,
        国内单号: item.国内单号 ?? '',
        单项体积: singleVolume,
        单项重量: (item as any).单项重量 ?? 0,
        总体积: volume,
        总重量: item.总重量 ?? 0,
        计费体积: singleVolume,
        总计费体积: volume,
        单价: Number((unitPrice || 0).toFixed(6)),
        订单总价: amountYuan,
        备注: item.备注 || '',
        结算状态: (item as any).cost_status ?? (item as any).payment_status ?? '',
      });
    }
  };

  addRows(scItems);
  addRows(ldItems);

  try {
    const buffer = await generateBillXlsx(
      '湘泰物流',
      customer?.name ?? '未知客户',
      bill.monthTag,
      rows,
      dedupedTotal,
      0,
    );

    const fileName = `账单_${customer?.name ?? '未知客户'}_${bill.monthTag}.xlsx`;
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