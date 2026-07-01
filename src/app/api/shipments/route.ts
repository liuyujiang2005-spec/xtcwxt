import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { shipments, shipmentCosts } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { generateShipmentNo, getMonthTag } from '@/lib/format';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const body = await request.json();

    const monthTag = getMonthTag();
    const allShipments = await db.select().from(shipments).all();
    const existingCount = allShipments.filter((s) => s.monthTag === monthTag).length;
    const shipmentNo = generateShipmentNo(monthTag, existingCount + 1);

    const result = await db.insert(shipments).values({
      shipmentNo,
      customerId: body.customerId,
      shipmentType: body.shipmentType,
      goodsType: body.goodsType,
      volume: body.volume,
      unitPriceCents: body.unitPriceCents,
      totalReceivableCents: body.totalReceivableCents,
      currency: body.currency || 'CNY',
      status: body.status || '运输中',
      monthTag,
      blNo: body.blNo || null,
      containerNo: body.containerNo || null,
      etd: body.etd || null,
      etaBkk: body.etaBkk || null,
      remark: body.remark || null,
      createdAt: new Date().toISOString(),
    });

    const shipmentId = Number(result.lastInsertRowid);

    if (body.costs && body.costs.length > 0) {
      for (const cost of body.costs) {
        await db.insert(shipmentCosts).values({
          shipmentId,
          costType: cost.costType,
          amountCents: cost.amountCents,
          currency: cost.currency || 'CNY',
          supplierId: cost.supplierId || null,
          remark: cost.remark || null,
        });
      }
    }

    return NextResponse.json({ success: true, shipmentNo });
  } catch (error) {
    console.error('Create shipment error:', error);
    return NextResponse.json({ error: '创建失败' }, { status: 500 });
  }
}
