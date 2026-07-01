import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { shipmentCosts } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer' || user.role === 'operator') {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  try {
    const { id } = await params;
    await db.delete(shipmentCosts).where(eq(shipmentCosts.id, parseInt(id)));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
