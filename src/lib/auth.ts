import { eq, gt, and } from 'drizzle-orm';
import { db } from '@/db/index';
import { sessions, users } from '@/db/schema';
import { hash, compare } from 'bcryptjs';
import { cookies } from 'next/headers';

export type User = {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'finance' | 'operator' | 'viewer';
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

export async function verifyPassword(password: string, hashStr: string): Promise<boolean> {
  return compare(password, hashStr);
}

export async function createSession(userId: number): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  await db.insert(sessions).values({ id: sessionId, userId, expiresAt });
  return sessionId;
}

export async function validateSession(sessionId: string): Promise<User | null> {
  const now = Math.floor(Date.now() / 1000);

  // 🔴修复：在 SQL 层直接过滤过期 session（原来是取出后内存判断）
  const result = await db
    .select({
      user: {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(users.active, 1),
        gt(sessions.expiresAt, now), // ← 新增：SQL 层过滤过期
      )
    )
    .get();

  if (!result) return null;
  return result.user as User;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value;
  if (!sessionToken) return null;
  return validateSession(sessionToken);
}

export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

export function canAccess(user: User | null, requiredRoles: string[]): boolean {
  if (!user) return false;
  if (requiredRoles.includes('*') || requiredRoles.includes(user.role)) return true;
  if (user.role === 'admin') return true;
  return false;
}

const ROLE_HIERARCHY: Record<string, number> = {
  admin: 4,
  finance: 3,
  operator: 2,
  viewer: 1,
};

export function hasRole(user: User | null, minRole: string): boolean {
  if (!user) return false;
  const userLevel = ROLE_HIERARCHY[user.role] || 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] || 0;
  return userLevel >= requiredLevel;
}
