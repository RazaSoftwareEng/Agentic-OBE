import { NextResponse, type NextRequest } from 'next/server';

// Optimistic check only: real session validation happens in lib/auth.ts (requireUser).
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has('obe_session');
  const { pathname } = request.nextUrl;
  if (!hasSession && (pathname.startsWith('/dashboard') || pathname.startsWith('/report'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/report/:path*'],
};
