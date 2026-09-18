export const dynamic = 'force-dynamic';

import { handler, ok } from '@/lib/http';
import { processJobsFor } from '@/server/engine/process';
import { env } from '@/lib/env';

/**
 * Serverless queue drain — designed for Vercel Cron (vercel.json) or a manual
 * trigger from the Jobs page. Processes a bounded number of jobs so the HTTP
 * request never stays open for long-running work (§33).
 */
export const maxDuration = 60;

export const POST = handler(async (req: Request) => {
  const auth = req.headers.get('authorization');
  const cronSecret = req.headers.get('x-vercel-cron') ?? auth?.replace('Bearer ', '');
  // Allow: Vercel cron header, CRON_SECRET bearer, or local development
  const allowed = !!cronSecret || !env.IS_PROD;
  if (!allowed) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const processed = await processJobsFor(45_000, 15);
  return ok({ processed });
});

export const GET = POST;
