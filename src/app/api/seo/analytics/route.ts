export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { AnalyticsSnapshot, Integration } from '@/models';
import { requireAuth } from '../../_lib';
import { resolveProject } from '../_seo';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const [integration, snapshots] = await Promise.all([
    Integration.findOne({ organization: session.orgId, provider: 'google_analytics' }).select('status connectedAt label').lean<any>(),
    AnalyticsSnapshot.find({ organization: session.orgId, project: project._id }).sort({ date: 1 }).limit(120).lean<any>(),
  ]);
  const connected = integration?.status === 'Connected';
  return ok(toId({
    connected,
    integration: integration ?? null,
    snapshots,
    source: 'Google Analytics 4',
    note: connected
      ? 'Showing real GA4 data from the connected integration.'
      : 'Requires Integration — Google Analytics 4 is not connected. Sessions/users/engagement are never fabricated; connect GA4 to populate this panel.',
  }));
});
