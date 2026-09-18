import { NextResponse, type NextRequest } from 'next/server';

/** Protect the app shell — full JWT verification happens in API routes. */
export function middleware(req: NextRequest) {
  const hasSession = !!req.cookies.get('agentos_session')?.value;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/app') && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  if ((pathname === '/login' || pathname === '/signup') && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/app/dashboard';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/login', '/signup'],
};
