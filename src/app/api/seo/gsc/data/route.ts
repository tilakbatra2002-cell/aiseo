export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { GSCQuery, GSCPage, GSCMetricSnapshot, GSCProperty } from '@/models';
import { requireAuth } from '../../../_lib';
import { resolveProject, oid } from '../../_seo';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const prop = await GSCProperty.findOne({ organization: session.orgId, project: project._id }).lean<any>();
  if (!prop) return ok({ connected: false, label: 'Requires Integration — Google Search Console', daily: [], topQueries: [], topPages: [] });
  const [daily, topQueries, topPages] = await Promise.all([
    GSCMetricSnapshot.find({ organization: session.orgId, project: project._id }).sort({ date: 1 }).limit(120).lean<any>(),
    GSCQuery.aggregate([
      { $match: { organization: oid(session.orgId), project: project._id } as never },
      { $group: { _id: '$query', clicks: { $sum: '$clicks' }, impressions: { $sum: '$impressions' }, ctr: { $avg: '$ctr' }, position: { $avg: '$position' } } },
      { $sort: { clicks: -1 } }, { $limit: 30 },
    ]),
    GSCPage.aggregate([
      { $match: { organization: oid(session.orgId), project: project._id } as never },
      { $group: { _id: '$page', clicks: { $sum: '$clicks' }, impressions: { $sum: '$impressions' }, ctr: { $avg: '$ctr' }, position: { $avg: '$position' } } },
      { $sort: { clicks: -1 } }, { $limit: 30 },
    ]),
  ]);
  return ok(toId({
    connected: true,
    siteUrl: prop.siteUrl,
    lastSyncAt: prop.lastSyncAt,
    source: 'Google Search Console (verified OAuth)',
    daily, topQueries, topPages,
    positionLabel: 'Google Search Console Average Position — not a universal exact rank.',
  }));
});
