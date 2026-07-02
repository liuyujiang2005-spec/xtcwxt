import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, any> = {};
    if (body.成本单价_cents !== undefined) {
      updateData.成本单价_cents = body.成本单价_cents;
      updateData.需支付总价_cents = Math.round(body.成本单价_cents * body.总体积);
    }
    if (body.客户应收_cents !== undefined) {
      updateData.客户应收_cents = body.客户应收_cents;
    }

    await db.update(sharedContainerItems)
      .set(updateData)
      .where(eq(sharedContainerItems.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}
