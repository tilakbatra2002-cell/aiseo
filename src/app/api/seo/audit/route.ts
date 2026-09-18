export const dynamic = 'force-dynamic';

import mongoose from 'mongoose';
import { handler, ok, toId } from '@/lib/http';
import { SEOIssue } from '@/models';
import { requireAuth } from '../../_lib';
import { resolveProject } from '../_seo';
import { seoOverview, siteAudit, SRC } from '@/server/seo/intelligence';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const u = new URL(req.url);
  const [ov, audit] = await Promise.all([
    seoOverview(session.orgId, String(project._id)),
    siteAudit(session.orgId, String(project._id), {
      category: u.searchParams.get('category') ?? undefined,
      severity: u.searchParams.get('severity') ?? undefined,
      limit: Math.min(Number(u.searchParams.get('limit') ?? 100), 200),
      skip: Number(u.searchParams.get('skip') ?? 0),
    }),
  ]);
  const openByCategory = await SEOIssue.aggregate([
    { $match: { organization: new mongoose.Types.ObjectId(session.orgId), project: project._id, status: 'open' } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  return ok(toId({
    project: { _id: project._id, name: project.name, website: project.website },
    score: ov.stats?.score ?? null,
    scoreFormula: ov.stats?.scoreFormula ?? null,
    scoreLabel: 'Internal technical health score. It is not a Google ranking score and does not predict rankings.',
    lastCrawl: (ov.crawl as Record<string, unknown> | null) ? { completedAt: (ov.crawl as { completedAt?: string }).completedAt ?? null, pages: ((ov.crawl as { stats?: Record<string, unknown> }).stats?.pages ?? null), source: SRC.crawler } : null,
    issues: audit.issues,
    total: audit.total,
    byCategory: openByCategory,
    categories: ['technical', 'content', 'performance', 'links', 'indexability', 'structured-data'],
    source: SRC.crawler,
  }));
});
