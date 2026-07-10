import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, loadingItems, marks, billItems, customers, bills } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, inArray } from 'drizzle-orm';
import { generateBillXlsx, type BillRow } from '@/lib/generate-bill-xlsx';

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user) return NextResponse.json({ error: '登录已过期' }, { status: 401 });

  const billId = parseInt(request.nextUrl.searchParams.get('billId') || '0');
  if (!billId) return NextResponse.json({ error: '缺少 billId' }, { status: 400 });

  const bill = await db.select().from(bills).where(eq(bills.id, billId)).get();
  if (!bill) return NextResponse.json({ error: '账单不存在' }, { status: 404 });

  const bItems = await db.select().from(billItems).where(eq(billItems.billId, billId)).all();
  const markIds = [...new Set(bItems.map(i => i.markId))];
  if (markIds.length === 0) return NextResponse.json({ error: '无明细' }, { status: 404 });

  const markList = await db.select().from(marks).where(inArray(marks.id, markIds)).all();
  const markMap = new Map(markList.map(m => [m.id, m]));
  const customer = await db.select().from(customers).where(eq(customers.id, bill.customerId)).get();

  const rows: BillRow[] = [];
  let totalCny = 0;

  let priceMatrix: Record<string, number> = {};
  if (customer?.priceMatrix) { try { priceMatrix = JSON.parse(customer.priceMatrix); } catch {} }
  const getPrice = (t: string, c: string): number => {
    const m = t === '海运' ? 'sea' : 'land';
    const ty = c === '普货' ? 'regular' : c === '商检货' ? 'inspection' : 'sensitive';
    return priceMatrix[m + '_' + ty] || 0;
  };

  for (const mId of markIds) {
    const mark = markMap.get(mId);
    const scItems = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, mId)).all();
    const ldItems = await db.select().from(loadingItems).where(eq(loadingItems.markId, mId)).all();

    // Compute order-level receivable totals (price × volume per运单号)
    const orderReceivable = new Map<string, number>();
    for (const item of [...scItems, ...ldItems]) {
      const key = (item as any).运单号 || '_' + (item as any).id;
      const up2 = getPrice((item as any).运输方式 || '', (item as any).货型 || '');
      const sv2 = (item as any).单箱体积 || 0;
      orderReceivable.set(key, (orderReceivable.get(key) || 0) + up2 * sv2);
    }

    const orderTotalVol = new Map<string, number>();
    for (const item of [...scItems, ...ldItems]) {
      const key = (item as any).运单号 || '_' + (item as any).id;
      orderTotalVol.set(key, (orderTotalVol.get(key) || 0) + ((item as any).单箱体积 || 0));
    }

    for (const item of [...scItems, ...ldItems]) {
      const vol = (item as any).总体积 ?? 0;
      const sv = (item as any).单箱体积 ?? 0;
      const ct = (item as any).箱数 ?? 0;
      const okey = (item as any).运单号 || '_' + (item as any).id;
      const tv = orderTotalVol.get(okey) || sv;
      const up = getPrice((item as any).运输方式 || '', (item as any).货型 || '');
      const amt = orderReceivable.get(okey) || 0;

      totalCny += amt;

      const dims = [(item as any).尺寸_长, (item as any).尺寸_宽, (item as any).尺寸_高]
        .filter((d: any) => d != null && d > 0)
        .join('×');

      rows.push({
        日期: mark?.createdAt?.substring(0, 10) ?? bill.monthTag,
        唛头: mark?.markNo ?? '',
        仓库: (item as any).仓库 || '',
        运输方式: (item as any).运输方式 ?? '',
        运单号: (item as any).运单号 ?? mark?.markNo ?? '',
        货型: (item as any).货型 ?? '',
        品名: (item as any).品名 ?? '',
        尺寸: dims,
        件数: ct,
        国内单号: (item as any).国内单号 ?? '',
        单项体积: sv,
        单项重量: (item as any).单项重量 ?? 0,
        总体积: vol,
        总重量: (item as any).总重量 ?? 0,
        计费体积: sv,
        总计费体积: tv,
        单价: up,
        订单总价: amt,
        备注: (item as any).备注 || '',
        结算状态: (item as any).cost_status ?? (item as any).payment_status ?? '',
      });
    }
  }

  try {
    await db.update(bills).set({ exportedAt: new Date().toISOString() }).where(eq(bills.id, billId));

    const buffer = await generateBillXlsx(
      customer?.name ?? '深圳新泓瀚国际物流有限公司',
      customer?.name ?? '未知客户',
      bill.monthTag,
      rows,
      totalCny,
      0,
    );

    const fileName = '账单_' + (customer?.name ?? bill.billNo) + '_' + bill.monthTag + '.xlsx';
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename*=UTF-8\'\'' + encodeURIComponent(fileName),
      },
    });
  } catch (error) {
    console.error('账单导出失败:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
