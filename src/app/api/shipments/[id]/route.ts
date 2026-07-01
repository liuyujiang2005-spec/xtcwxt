import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { shipments } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  try {
    if (body.status) {
      await db.update(shipments).set({ status: body.status }).where(eq(shipments.id, parseInt(id)));
    }
    if (body.blNo !== undefined) {
      await db.update(shipments).set({ blNo: body.blNo }).where(eq(shipments.id, parseInt(id)));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}
