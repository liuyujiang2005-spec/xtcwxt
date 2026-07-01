import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { shipmentCosts } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function PUT(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const body = await request.json();
    await db.update(shipmentCosts)
      .set({
        costType: body.costType,
        amountCents: body.amountCents,
        currency: body.currency,
        supplierId: body.supplierId || null,
        remark: body.remark || null,
      })
      .where(eq(shipmentCosts.id, body.id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || (user.role !== 'admin' && user.role !== 'finance'))
    return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const { id } = await request.json();
    await db.delete(shipmentCosts).where(eq(shipmentCosts.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
