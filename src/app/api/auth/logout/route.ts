import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  // CSRF 防护：必须携带自定义请求头（浏览器跨站请求无法设置自定义头）
  if (request.headers.get('x-csrf-protection') !== '1') {
    return NextResponse.json({ error: '非法请求' }, { status: 403 });
  }
  const sessionToken = request.cookies.get('session')?.value;
  if (sessionToken) {
    await deleteSession(sessionToken);
  }

  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete('session');
  return response;
}
