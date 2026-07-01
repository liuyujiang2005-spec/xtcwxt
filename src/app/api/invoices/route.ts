import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { invoices, invoiceItems, shipments } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { generateInvoiceNo } from '@/lib/format';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const body = await request.json();
    const count = (await db.select().from(invoices).all()).length;

    const invoiceNo = generateInvoiceNo('应收发票', count + 1);

    const result = await db.insert(invoices).values({
      invoiceNo,
      customerId: body.customerId,
      type: '应收发票',
      status: '已开',
      totalAmountCents: body.totalAmountCents,
      currency: body.currency || 'CNY',
      issueDate: new Date().toISOString().substring(0, 10),
    });

    const invoiceId = Number(result.lastInsertRowid);

    for (const shipmentId of body.shipmentIds) {
      const shipment = await db.select().from(shipments).where(eq(shipments.id, shipmentId)).get();
      await db.insert(invoiceItems).values({
        invoiceId,
        shipmentId,
        amountCents: shipment?.totalReceivableCents || 0,
      });
    }

    return NextResponse.json({ success: true, invoiceNo });
  } catch (error) {
    return NextResponse.json({ error: '创建失败' }, { status: 500 });
  }
}
