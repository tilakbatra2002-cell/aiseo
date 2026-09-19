import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { env } from '@/lib/env';

const COOKIE = 'agentos_session';
const secret = new TextEncoder().encode(env.JWT_SECRET);

/** Check the session cookie's presence AND cryptographic validity (edge-safe). */
async function sessionState(req: NextRequest): Promise<{ present: boolean; valid: boolean }> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return { present: false, valid: false };
  try {
    await jwtVerify(token, secret);
    return { present: true, valid: true };
  } catch {
    // expired signature, tampered token, wrong secret — present but not valid
    return { present: true, valid: false };
  }
}

/** Protect the app shell with VALIDATED sessions.
 *  An invalid-but-present cookie previously caused an infinite /app ↔ /login
 *  redirect loop (middleware counted it as authenticated while /api/auth/me
 *  rejected it). We now verify the JWT and self-heal by deleting bad cookies. */
export async function middleware(req: NextRequest) {
  const { present, valid } = await sessionState(req);
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/app')) {
    if (!valid) {
      const res = NextResponse.redirect(new URL('/login', req.url));
      if (present) res.cookies.delete(COOKIE); // clear stale/invalid session
      return res;
    }
    return NextResponse.next();
  }

  if (pathname === '/login' || pathname === '/signup') {
    if (valid) {
      return NextResponse.redirect(new URL('/app/dashboard', req.url));
    }
    const res = NextResponse.next();
    if (present) res.cookies.delete(COOKIE); // self-heal: drop bad cookie on auth pages
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/login', '/signup'],
};
