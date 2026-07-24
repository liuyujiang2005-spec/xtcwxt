import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { fullContainerBatches, fullContainerItems, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { generateBillXlsx, type BillRow } from '@/lib/generate-bill-xlsx';

// 生成整柜请款单 Excel:货物明细 + 整柜应收(一口价)作总额;同时记出账单日期。
export async function GET(request: NextRequest) {
  const st = request.cookies.get('session')?.value;
  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(st);
  if (!user) return NextResponse.json({ error: '登录已过期' }, { status: 401 });

  const idRaw = request.nextUrl.searchParams.get('id') || '';
  const bid = parseInt(idRaw);
  if (!bid || bid <= 0 || String(bid) !== idRaw.trim()) return NextResponse.json({ error: '无效的 id' }, { status: 400 });

  const batch = await db.select().from(fullContainerBatches).where(eq(fullContainerBatches.id, bid)).get();
  if (!batch) return NextResponse.json({ error: '批次不存在' }, { status: 404 });
  const items = await db.select().from(fullContainerItems).where(eq(fullContainerItems.batchId, bid)).all();
  if (items.length === 0) return NextResponse.json({ error: '无明细' }, { status: 404 });
  const customer = batch.customerId ? await db.select().from(customers).where(eq(customers.id, batch.customerId)).get() : null;

  const custName = customer?.name || '';
  const rows: BillRow[] = items.map((it: any) => ({
    日期: (batch.国内收货日期 || batch.createdAt || '').substring(0, 10),
    唛头: custName,
    仓库: it.仓库 || '',
    运输方式: it.运输方式 || '',
    运单号: it.运单号 || '',
    货型: it.货型 || '',
    品名: it.品名 || '',
    尺寸: [it.尺寸_长, it.尺寸_宽, it.尺寸_高].filter((d: any) => d != null && d > 0).join('×'),
    件数: it.箱数 ?? 0,
    国内单号: it.国内单号 || '',
    单项体积: it.单项体积 ?? 0,
    单项重量: 0,
    总体积: it.总体积 ?? 0,
    总重量: it.总重量 ?? 0,
    计费体积: it.单项体积 ?? 0,
    总计费体积: it.总体积 ?? 0,
    单价: 0,
    订单总价: 0,
    备注: '',
  }));

  const total = Number(batch.整柜应收) || 0;

  try {
    // 记出账单日期(首次生成时)
    if (!batch.出账单日期) {
      await db.update(fullContainerBatches).set({ 出账单日期: new Date().toISOString().substring(0, 10) }).where(eq(fullContainerBatches.id, bid));
    }
    const buffer = await generateBillXlsx('暹联出海企业管理咨询(深圳)有限公司', custName || '未知客户', batch.monthTag || '', rows, total, 0);
    const fileName = '整柜请款单_' + (custName || batch.batchNo) + '_' + (batch.monthTag || '') + '.xlsx';
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(fileName),
      },
    });
  } catch (error) {
    console.error('整柜请款单导出失败:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
