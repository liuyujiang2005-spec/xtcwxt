import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PREFIXES = [
  '/shipments',
  '/revenue',
  '/expenses',
  '/accounts',
  '/reports',
  '/invoices',
  '/customers',
  '/suppliers',
  '/shared-containers',
  '/loading-lists',
  '/costs',
  '/direct-income',
  '/marks',
  '/bills',
  '/users',
  '/api',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get('session')?.value;

  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    if (sessionToken && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (pathname === '/' || pathname === '') {
    if (!sessionToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (isProtected && !sessionToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
