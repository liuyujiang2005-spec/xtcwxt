import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, marks, billItems } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq, inArray } from 'drizzle-orm';
import ExcelJS from 'exceljs';

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  await validateSession(sessionToken);

  const billId = parseInt(request.nextUrl.searchParams.get('billId') || '0');
  if (!billId) return NextResponse.json({ error: '缺少 billId' }, { status: 400 });

  const bItems = await db.select().from(billItems).where(eq(billItems.billId, billId)).all();
  const markIds = [...new Set(bItems.map(i => i.markId))];
  if (markIds.length === 0) return NextResponse.json({ error: '无明细' }, { status: 404 });

  const markList = await db.select().from(marks).where(inArray(marks.id, markIds)).all();
  const markMap = new Map(markList.map(m => [m.id, m.markNo]));

  const allItems: any[] = [];
  for (const mId of markIds) {
    const items = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, mId)).all();
    allItems.push(...items);
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(markMap.get(markIds[0]) || '账单明细');
  ws.columns = [
    { header: '唛头', key: 'markNo', width: 14 },
    { header: '品名', key: '品名', width: 20 },
    { header: '货型', key: '货型', width: 10 },
    { header: '运输方式', key: '运输方式', width: 10 },
    { header: '件数', key: '箱数', width: 8 },
    { header: '总体积', key: '总体积', width: 12 },
    { header: '国内单号', key: '国内单号', width: 16 },
    { header: '总重量', key: '总重量', width: 10 },
    { header: '结算状态', key: 'cost_status', width: 10 },
  ];
  allItems.forEach(i => ws.addRow({ ...i, markNo: markMap.get(i.markId) || '' }));

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="账单明细_${markMap.get(markIds[0]) || billId}.xlsx"`,
    },
  });
}
