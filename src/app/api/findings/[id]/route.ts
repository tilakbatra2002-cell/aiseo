export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Finding } from '@/models';
import { readJson, requireAuth } from '../../_lib';
import { logActivity } from '@/server/activity';

type Params = { params: { id: string } };

export const PATCH = handler(async (req: Request, { params }: Params) => {
  const session = await requireAuth();
  const body = (await readJson(req)) as { status?: string };
  await dbConnect();
  const allowed = ['Dismissed', 'Approved', 'Detected'];
  if (body.status && !allowed.includes(body.status)) throw new ApiError(`Status must be one of: ${allowed.join(', ')}`, 422);
  const finding = await Finding.findOneAndUpdate(
    { _id: params.id, organization: session.orgId },
    { $set: { ...(body.status ? { status: body.status } : {}) } },
    { new: true },
  ).lean<any>();
  if (!finding) throw new ApiError('Finding not found', 404);
  await logActivity({
    orgId: session.orgId, actor: { type: 'user', id: session.userId, name: session.name },
    action: `Owner marked finding "${finding.title}" as ${body.status}`,
    projectId: String(finding.project),
  });
  return ok(toId(finding));
});
