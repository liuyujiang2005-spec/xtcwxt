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

  // Customer price matrix
  let priceMatrix: Record<string, number> = {};
  if (customer?.priceMatrix) { try { priceMatrix = JSON.parse(customer.priceMatrix); } catch {} }
  const enableMinVol = customer?.enableMinVolume !== 0;
  const getPrice = (t: string, c: string): number => {
    const m = t === '海运' ? 'sea' : 'land';
    const ty = c === '普货' ? 'regular' : c === '商检货' ? 'inspection' : 'sensitive';
    return priceMatrix[`${m}_${ty}`] || 0;
  };
  const minVol = (t: string): number => {
    if (!enableMinVol) return 0;
    return t === '海运' ? 0.5 : 0.3;
  };

  const rows: BillRow[] = [];
  let totalCny = 0;

  for (const mId of markIds) {
    const mark = markMap.get(mId);
    const scItems = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, mId)).all();
    const ldItems = await db.select().from(loadingItems).where(eq(loadingItems.markId, mId)).all();

    const orderTotalVol = new Map<string, number>();
    for (const item of [...scItems, ...ldItems]) {
      const key = (item as any).运单号 || `_${(item as any).id}`;
      orderTotalVol.set(key, (orderTotalVol.get(key) || 0) + ((item as any).单箱体积 || 0));
    }

    for (const item of [...scItems, ...ldItems]) {
      const transport = (item as any).运输方式 || '海运';
      const cargo = (item as any).货型 || '普货';
      const unitPrice = getPrice(transport, cargo);
      const singleVol = (item as any).单箱体积 ?? 0;
      const volume = (item as any).总体积 ?? 0;
      const count = (item as any).箱数 ?? 1;
      const orderKey = (item as any).运单号 || `_${(item as any).id}`;
      const totalVol = orderTotalVol.get(orderKey) || singleVol;
      const chargeVol = Math.max(singleVol, minVol(transport));
      const receivable = unitPrice * chargeVol;

      totalCny += receivable;

      const dims = [(item as any).尺寸_长, (item as any).尺寸_宽, (item as any).尺寸_高]
        .filter((d: any) => d != null && d > 0)
        .join('*');

      rows.push({
        日期: mark?.createdAt?.substring(0, 10) ?? bill.monthTag,
        唛头: mark?.markNo ?? '',
        仓库: (item as any).仓库 || '',
        运输方式: transport,
        运单号: (item as any).运单号 ?? mark?.markNo ?? '',
        货型: cargo,
        品名: (item as any).品名 ?? '',
        尺寸: dims,
        件数: count,
        国内单号: (item as any).国内单号 ?? '',
        单项体积: singleVol,
        单项重量: (item as any).单项重量 ?? 0,
        总体积: volume,
        总重量: (item as any).总重量 ?? 0,
        计费体积: chargeVol,
        总计费体积: totalVol,
        单价: unitPrice,
        订单总价: receivable,
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

    const fileName = `账单_${customer?.name ?? bill.billNo}_${bill.monthTag}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error('账单导出失败:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
