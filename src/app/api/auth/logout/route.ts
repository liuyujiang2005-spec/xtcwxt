import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (sessionToken) {
    await deleteSession(sessionToken);
  }

  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete('session');
  return response;
}
