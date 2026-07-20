import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, marks, sharedContainerBatches } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { inArray, desc } from 'drizzle-orm';
import ExcelJS from 'exceljs';

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user) return NextResponse.json({ error: '登录已过期' }, { status: 401 });

  try {
    const batches = await db.select().from(sharedContainerBatches).orderBy(desc(sharedContainerBatches.createdAt)).all();
    if (batches.length === 0) return NextResponse.json({ error: '无数据' }, { status: 404 });

    const batchIds = batches.map(b => b.id);
    const allItems = await db.select().from(sharedContainerItems).where(inArray(sharedContainerItems.batchId, batchIds)).all();
    const markIds = [...new Set(allItems.map(i => i.markId))];
    const markList = await db.select().from(marks).where(inArray(marks.id, markIds)).all();
    const markMap = new Map(markList.map(m => [m.id, m.markNo]));

    // Sort items by markId, then 运单号 for proper grouping
    allItems.sort((a, b) => {
      if (a.markId !== b.markId) return a.markId - b.markId;
      return (a.运单号 || '').localeCompare(b.运单号 || '');
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('拼柜明细');
    const headers = ['批次号','日期','唛头','运输方式','运单号','货型','品名','尺寸(cm)','件数(箱)','国内单号','单项体积','总重量','总体积','成本单价','需支付总价','订单总价','结算状态','客户应收'];
    const hRow = ws.addRow(headers);
    hRow.eachCell((cell: any) => { cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }; });

    // Track group boundaries for merge: columns 2(日期),3(唛头),4(运输方式),5(运单号),13(总体积),16(订单总价)
    const mergeCols = [2, 3, 4, 5, 13, 16];
    let currentRow = 1; // header row
    let markStart = 2;  // first data row for current mark
    let lastMarkId = allItems[0]?.markId ?? -1;

    for (const item of allItems) {
      currentRow++;
      const batch = batches.find(b => b.id === item.batchId);
      const dims = [item.尺寸_长, item.尺寸_宽, item.尺寸_高].filter((d: any) => d != null && d > 0).join('×') || '';

      // Check if mark changes — merge previous group
      if (item.markId !== lastMarkId) {
        if (currentRow - 1 > markStart) {
          mergeCols.forEach(col => {
            ws.mergeCells(markStart, col, currentRow - 1, col);
          });
        }
        markStart = currentRow;
        lastMarkId = item.markId;
      }

      ws.addRow([
        batch?.batchNo || '',
        batch?.createdAt?.substring(0, 10) || '',
        markMap.get(item.markId) || '',
        item.运输方式 || '',
        item.运单号 || '',
        item.货型 || '',
        item.品名 || '',
        dims,
        item.箱数 ?? '',
        item.国内单号 || '',
        item.单项体积 ?? '',
        item.总重量 ?? '',
        item.总体积 ?? '',
        item.成本单价 ?? '',
        item.需支付总价 ?? '',
        item.订单总价 ?? '',
        item.cost_status || '',
        item.客户应收 ?? '',
      ]);
    }

    // Merge last group
    if (currentRow > markStart) {
      mergeCols.forEach(col => {
        ws.mergeCells(markStart, col, currentRow, col);
      });
    }

    ws.columns = headers.map(() => ({ width: 14 }));

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="sc-items_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('拼柜导出失败:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
