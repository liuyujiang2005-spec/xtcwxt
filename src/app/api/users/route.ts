import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { users } from '@/db/schema';
import { validateSession, hashPassword } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role !== 'admin') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const all = await db.select().from(users).all();
  const safe = all.map(({ passwordHash, ...rest }) => rest);
  return NextResponse.json(safe);
}

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role !== 'admin') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const body = await request.json();
  if (!body.username || !body.password || !body.displayName) {
    return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
  }

  const existing = await db.select().from(users).where(eq(users.username, body.username)).get();
  if (existing) return NextResponse.json({ error: '用户名已存在' }, { status: 409 });

  const passwordHash = await hashPassword(body.password);
  await db.insert(users).values({
    username: body.username,
    passwordHash,
    displayName: body.displayName,
    role: body.role || 'viewer',
    active: 1,
  });

  return NextResponse.json({ success: true });
}

export async function PUT(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const currentUser = await validateSession(sessionToken);
  if (!currentUser || currentUser.role !== 'admin') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const body = await request.json();

  if (body.id === currentUser.id && body.role && body.role !== 'admin') {
    return NextResponse.json({ error: '不允许修改自己的角色' }, { status: 403 });
  }

  const updates: Record<string, any> = {};
  if (body.displayName !== undefined) updates.displayName = body.displayName;
  if (body.role !== undefined) updates.role = body.role;
  if (body.active !== undefined) updates.active = body.active;
  if (body.password) updates.passwordHash = await hashPassword(body.password);

  if (Object.keys(updates).length > 0) {
    await db.update(users).set(updates).where(eq(users.id, body.id));
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const currentUser = await validateSession(sessionToken);
  if (!currentUser || currentUser.role !== 'admin') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { id } = await request.json();

  if (id === currentUser.id) {
    return NextResponse.json({ error: '不允许删除自己' }, { status: 403 });
  }

  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ success: true });
}
