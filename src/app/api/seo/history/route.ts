export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { SEOSnapshot, SEOChange, Crawl } from '@/models';
import { requireAuth } from '../../_lib';
import { resolveProject } from '../_seo';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const u = new URL(req.url);
  const a = u.searchParams.get('a');
  const b = u.searchParams.get('b');
  if (a && b) {
    const [sa, sb] = await Promise.all([
      SEOSnapshot.findOne({ organization: session.orgId, project: project._id, crawlId: a }).lean<any>(),
      SEOSnapshot.findOne({ organization: session.orgId, project: project._id, crawlId: b }).lean<any>(),
    ]);
    if (!sa || !sb) throw new ApiError('One or both snapshots not found', 404);
    let changes = await SEOChange.find({ organization: session.orgId, project: project._id, crawlId: b, vsCrawlId: a }).limit(400).lean<any>();
    if (!changes.length) {
      // Non-adjacent pair: show every change detected between the two snapshot times.
      const from = new Date(Math.min(+new Date(sa.takenAt), +new Date(sb.takenAt)));
      const to = new Date(Math.max(+new Date(sa.takenAt), +new Date(sb.takenAt)));
      changes = await SEOChange.find({ organization: session.orgId, project: project._id, detectedAt: { $gt: from, $lte: to } }).limit(400).lean<any>();
    }
    const delta: Record<string, unknown> = {};
    for (const key of ['score', 'pages', 'indexable', 'internalLinks', 'avgTtfbMs', 'avgWordCount']) {
      const va = (sa.metrics as Record<string, number> | undefined)?.[key];
      const vb = (sb.metrics as Record<string, number> | undefined)?.[key];
      if (typeof va === 'number' && typeof vb === 'number') delta[key] = { from: va, to: vb, diff: Math.round((vb - va) * 100) / 100 };
    }
    const ia = (sa.metrics as { issues?: { total?: number } } | undefined)?.issues?.total;
    const ib = (sb.metrics as { issues?: { total?: number } } | undefined)?.issues?.total;
    if (typeof ia === 'number' && typeof ib === 'number') delta.issues = { from: ia, to: ib, diff: ib - ia };
    return ok(toId({ a: { crawlId: a, takenAt: sa.takenAt }, b: { crawlId: b, takenAt: sb.takenAt }, delta, changes, source: 'Crawled by Webamazee — measured diff between two crawls' }));
  }
  const [snapshots, changes, crawls] = await Promise.all([
    SEOSnapshot.find({ organization: session.orgId, project: project._id }).sort({ takenAt: 1 }).limit(60).lean<any>(),
    SEOChange.find({ organization: session.orgId, project: project._id }).sort({ detectedAt: -1 }).limit(100).lean<any>(),
    Crawl.find({ organization: session.orgId, project: project._id, status: 'completed' }).sort({ startedAt: -1 }).limit(20).lean<any>(),
  ]);
  return ok(toId({ snapshots, changes, crawls, source: 'Crawled by Webamazee' }));
});
