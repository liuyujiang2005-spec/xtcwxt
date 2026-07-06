import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, loadingItems, marks, billItems, customers } from '@/db/schema';
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
  const markMap = new Map(markList.map(m => [m.id, m]));
  const custIds = [...new Set(markList.map(m => m.customerId))];
  const custList = await db.select().from(customers).where(inArray(customers.id, custIds)).all();
  const custMap = new Map(custList.map(c => [c.id, c]));

  function getUnitPrice(cust: any, transport: string, cargoType: string): number {
    const mode = transport === '海运' ? 'sea' : transport === '陆运' ? 'land' : 'sea';
    const type = cargoType === '普货' ? 'regular' : cargoType === '商检货' ? 'inspection' : 'sensitive';
    if (cust?.priceMatrix) { try { return JSON.parse(cust.priceMatrix)[`${mode}_${type}`] || 0; } catch {} }
    return 0;
  }
  function minVolume(cust: any, transport: string): number {
    if (!cust?.enableMinVolume) return 0;
    return transport === '海运' ? 0.5 : transport === '陆运' ? 0.3 : 0;
  }

  const allSC: any[] = [];
  const allLD: any[] = [];
  for (const mId of markIds) {
    const mark = markMap.get(mId);
    const cust = custMap.get(mark?.customerId || 0);
    const scItems = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, mId)).all();
    const ldItems = await db.select().from(loadingItems).where(eq(loadingItems.markId, mId)).all();
    allSC.push(...scItems.map(i => {
      const t = (i.运输方式 || '海运') as string; const c = (i.货型 || '普货') as string;
      const up = getUnitPrice(cust, t, c);
      const cv = Math.max((i as any).计费体积 || i.单箱体积 || i.总体积 || 0, minVolume(cust, t));
      return { ...i, markNo: mark?.markNo || '', 客户单价: up, 计费体积: cv, 应收: (up * cv).toFixed(2) };
    }));
    allLD.push(...ldItems.map(i => {
      const t = (i.运输方式 || '海运') as string; const c = (i.货型 || '普货') as string;
      const up = getUnitPrice(cust, t, c);
      const cv = Math.max(i.总体积 || 0, minVolume(cust, t));
      return { ...i, markNo: mark?.markNo || '', 客户单价: up, 计费体积: cv, 应收: (up * cv).toFixed(2) };
    }));
  }

  const wb = new ExcelJS.Workbook();
  const cols = [
    { header: '唛头', key: 'markNo', width: 14 }, { header: '品名', key: '品名', width: 20 },
    { header: '货型', key: '货型', width: 10 }, { header: '运输方式', key: '运输方式', width: 10 },
    { header: '箱数', key: '箱数', width: 8 }, { header: '计费体积', key: '计费体积', width: 12 },
    { header: '客户单价', key: '客户单价', width: 10 }, { header: '应收', key: '应收', width: 14 },
    { header: '国内单号', key: '国内单号', width: 16 },
  ];
  if (allSC.length > 0) { const ws = wb.addWorksheet('拼柜'); ws.columns = cols; allSC.forEach(i => ws.addRow(i)); }
  if (allLD.length > 0) { const ws = wb.addWorksheet('装柜'); ws.columns = cols; allLD.forEach(i => ws.addRow(i)); }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="账单_${markMap.get(markIds[0])?.markNo || billId}.xlsx"`,
    },
  });
}
