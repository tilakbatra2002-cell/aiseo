export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Crawl, Competitor } from '@/models';
import { enqueueJob } from '@/server/engine/queue';
import { requireAuth } from '../../_lib';
import { resolveProject } from '../_seo';
import { env } from '@/lib/env';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  await dbConnect();
  const u = new URL(req.url);
  const id = u.searchParams.get('id');
  if (id) {
    const crawl = await Crawl.findOne({ _id: id, organization: session.orgId }).lean<any>();
    if (!crawl) throw new ApiError('Crawl not found', 404);
    return ok(toId({ crawl }));
  }
  const project = await resolveProject(session, req.url);
  const items = await Crawl.find({ organization: session.orgId, project: project._id })
    .sort({ startedAt: -1, createdAt: -1 }).limit(30).lean<any>();
  return ok(toId({ items, project: { _id: project._id, name: project.name, website: project.website } }));
});

export const POST = handler(async (req: Request) => {
  const session = await requireAuth();
  await dbConnect();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const project = await resolveProject(session, req.url + (body.projectId ? `?project=${body.projectId}` : ''));
  const type = body.type === 'competitor' ? 'competitor' : 'self';
  let domain = String(body.domain ?? project.website ?? '');
  if (!domain) throw new ApiError('No domain/website available to crawl', 400);
  domain = domain.trim();
  let competitor: string | undefined;
  if (type === 'competitor') {
    const comp = await Competitor.findOne({ organization: session.orgId, project: project._id, _id: body.competitorId ?? undefined })
      ?? await Competitor.findOne({ organization: session.orgId, project: project._id, domain });
    if (!comp) throw new ApiError('Competitor not found for this project', 404);
    competitor = String(comp._id);
    domain = comp.domain;
  }
  const running = await Crawl.findOne({ organization: session.orgId, project: project._id, domain, status: { $in: ['queued', 'running'] } });
  if (running) throw new ApiError(`A crawl for this domain is already queued/running (crawlId ${running._id})`, 409);

  const maxPages = Math.min(Math.max(Number(body.maxPages ?? env.CRAWL_MAX_PAGES), 1), 200);
  const crawl = await Crawl.create({
    organization: session.orgId,
    project: project._id,
    domain,
    type,
    competitor,
    status: 'queued',
    settings: {
      maxPages,
      concurrency: Math.min(Math.max(Number(body.concurrency ?? env.CRAWL_CONCURRENCY), 1), 8),
      delayMs: Math.min(Math.max(Number(body.delayMs ?? env.CRAWL_DELAY_MS), 100), 5000),
      incremental: body.incremental !== false,
    },
  });
  await enqueueJob(session.orgId, 'seo_crawl', { crawlId: String(crawl._id) }, { dedupeKey: `seo_crawl:${crawl._id}`, maxAttempts: 2 });
  return ok(toId({ crawlId: String(crawl._id), status: 'queued', note: 'Crawl queued. The worker processes it; poll GET /api/seo/crawl?id=' + crawl._id }), 202);
});
