export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { Report } from '@/models';
import { requireAuth } from '../../_lib';
import { resolveProject } from '../_seo';
import { generateSeoReport } from '@/server/seo/intelligence';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const items = await Report.find({ organization: session.orgId, project: project._id, type: 'seo_intelligence' })
    .sort({ createdAt: -1 }).limit(30).select('title summary createdAt verificationStatus generatedBy').lean<any>();
  return ok(toId({ items }));
});

export const POST = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const report = await generateSeoReport(session.orgId, String(project._id), { id: session.userId, name: session.name ?? 'Owner' });
  if (!report) throw new ApiError('Could not build report', 500);
  return ok(toId(report), 201);
});
