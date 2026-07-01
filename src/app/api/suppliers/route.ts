import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { suppliers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function GET() {
  const all = await db.select().from(suppliers).all();
  return NextResponse.json(all);
}

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const body = await request.json();
    await db.insert(suppliers).values({
      name: body.name,
      type: body.type || null,
      contact: body.contact || null,
      defaultCurrency: body.defaultCurrency || 'CNY',
      remark: body.remark || null,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '创建失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const body = await request.json();
    await db.update(suppliers)
      .set({
        name: body.name,
        type: body.type,
        contact: body.contact,
        defaultCurrency: body.defaultCurrency,
        remark: body.remark,
      })
      .where(eq(suppliers.id, body.id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const user = await validateSession(sessionToken);
  if (!user || user.role !== 'admin') return NextResponse.json({ error: '仅管理员可删除' }, { status: 403 });

  try {
    const { id } = await request.json();
    await db.delete(suppliers).where(eq(suppliers.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
