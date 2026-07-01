import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { paymentsReceived, paymentShipmentAllocations, shipments } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { refreshCustomerMetrics } from '@/lib/metrics';
import { eq, asc } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const body = await request.json();
    const { customerId, amountCents, currency, receivedDate, remark, allocations } = body;

    const result = await db.insert(paymentsReceived).values({
      customerId,
      amountCents,
      currency: currency || 'CNY',
      receivedDate,
      remark: remark || null,
    });

    const paymentId = Number(result.lastInsertRowid);

    // FIFO auto-allocation or manual allocation
    if (allocations && allocations.length > 0) {
      for (const alloc of allocations) {
        await db.insert(paymentShipmentAllocations).values({
          paymentReceivedId: paymentId,
          shipmentId: alloc.shipmentId,
          amountCents: alloc.amountCents,
        });
      }
    } else {
      // Auto FIFO allocation
      let remaining = amountCents;
      const unpaidShipments = await db
        .select()
        .from(shipments)
        .where(eq(shipments.customerId, customerId))
        .orderBy(asc(shipments.createdAt))
        .all();

      for (const s of unpaidShipments) {
        if (remaining <= 0) break;
        if (s.status === '已结算') continue;

        const existingAllocs = await db
          .select()
          .from(paymentShipmentAllocations)
          .where(eq(paymentShipmentAllocations.shipmentId, s.id))
          .all();

        const alreadyAllocated = existingAllocs.reduce((sum, a) => sum + a.amountCents, 0);
        const unpaidAmount = s.totalReceivableCents - alreadyAllocated;

        if (unpaidAmount > 0) {
          const allocAmount = Math.min(remaining, unpaidAmount);
          await db.insert(paymentShipmentAllocations).values({
            paymentReceivedId: paymentId,
            shipmentId: s.id,
            amountCents: allocAmount,
          });
          remaining -= allocAmount;

          if (allocAmount >= unpaidAmount) {
            await db.update(shipments).set({ status: '已结算' }).where(eq(shipments.id, s.id));
          } else if (allocAmount > 0) {
            await db.update(shipments).set({ status: '部分已收' }).where(eq(shipments.id, s.id));
          }
        }
      }
    }

    // Update customer metrics
    await refreshCustomerMetrics(customerId);

    return NextResponse.json({ success: true, paymentId });
  } catch (error) {
    console.error('Create payment error:', error);
    return NextResponse.json({ error: '录入失败' }, { status: 500 });
  }
}
