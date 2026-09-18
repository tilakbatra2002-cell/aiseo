export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { Competitor } from '@/models';
import { requireAuth } from '../../_lib';
import { resolveProject } from '../_seo';
import { competitorComparison } from '@/server/seo/intelligence';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const compare = new URL(req.url).searchParams.get('compare') === '1';
  if (compare) {
    const data = await competitorComparison(session.orgId, String(project._id));
    return ok(toId(data));
  }
  const items = await Competitor.find({ organization: session.orgId, project: project._id }).sort({ createdAt: -1 }).lean<any>();
  return ok(toId({ items }));
});

export const POST = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let domain = String(body.domain ?? '').trim();
  if (!domain) throw new ApiError('domain is required', 422);
  domain = domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  try {
    const comp = await Competitor.create({ organization: session.orgId, project: project._id, domain, name: String(body.name ?? domain) });
    return ok(toId(comp), 201);
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new ApiError('Competitor already added for this project', 409);
    throw e;
  }
});
