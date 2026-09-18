import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { env } from './env';

const COOKIE = 'agentos_session';
const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface SessionPayload {
  userId: string;
  orgId: string;
  role: string;
  name: string;
  email: string;
}

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSession(payload);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.IS_PROD,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
