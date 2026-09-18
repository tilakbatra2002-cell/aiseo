export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { requireAuth } from '../../_lib';
import { resolveProject } from '../_seo';
import { internalLinkAnalysis } from '@/server/seo/intelligence';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const data = await internalLinkAnalysis(session.orgId, String(project._id));
  return ok(toId(data));
});
