import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { loadingBatches } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { desc } from 'drizzle-orm';
import ExcelJS from 'exceljs';

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  await validateSession(sessionToken);

  const batches = await db.select().from(loadingBatches).orderBy(desc(loadingBatches.createdAt)).all();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('装柜批次');
  ws.columns = [
    { header: '批次号', key: 'batchNo', width: 22 },
    { header: '文件名', key: 'file', width: 30 },
    { header: '创建时间', key: 'createdAt', width: 14 },
  ];
  batches.forEach(b => ws.addRow({ batchNo: b.batchNo, file: b.originalFilename, createdAt: b.createdAt?.substring(0, 10) }));

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="loading-batches_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
