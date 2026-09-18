import { NextResponse } from 'next/server';
import { getSession, type SessionPayload } from './session';

export function ok(data: unknown, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Require an authenticated session; returns the session payload. */
export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new ApiError('Authentication required', 401);
  return session;
}

/** Require owner or admin role. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireAuth();
  if (!['owner', 'admin'].includes(session.role)) throw new ApiError('Insufficient permissions', 403);
  return session;
}

/** Standard wrapper for API route handlers. */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return fail(e.message, e.status);
      console.error('[AgentOS API]', e);
      return fail('Something went wrong. Please try again.', 500);
    }
  };
}

export function toId(doc: unknown): unknown {
  return JSON.parse(JSON.stringify(doc));
}
