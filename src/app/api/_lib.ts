import { z } from 'zod';
import type { FilterQuery } from 'mongoose';
import { ApiError, requireAuth } from '@/lib/http';

export function parseBody<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') || 'Invalid request', 422);
  }
  return result.data;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError('Invalid JSON body', 400);
  }
}

export function listQuery(url: string, defaults?: { limit?: number }) {
  const u = new URL(url);
  const limit = Math.min(Number(u.searchParams.get('limit') ?? defaults?.limit ?? 50), 200);
  const skip = Math.max(Number(u.searchParams.get('skip') ?? 0), 0);
  return { limit, skip, searchParams: u.searchParams };
}

export function orgFilter<T extends Record<string, unknown>>(orgId: string, extra?: T): FilterQuery<unknown> {
  return { organization: orgId, ...(extra ?? {}) } as FilterQuery<unknown>;
}

export { requireAuth };
