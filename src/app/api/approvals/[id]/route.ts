export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { readJson, requireAuth } from '../../_lib';
import { decideApproval } from '@/server/engine/approvals';

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAuth();
  if (!['owner', 'admin'].includes(session.role)) throw new ApiError('Only the agency owner can decide approvals', 403);
  const body = (await readJson(req)) as { decision?: string; note?: string };
  if (!['approve', 'reject'].includes(body.decision ?? '')) throw new ApiError('decision must be approve or reject', 422);
  const approval = await decideApproval({
    approvalId: params.id,
    orgId: session.orgId,
    decision: body.decision === 'approve' ? 'Approved' : 'Rejected',
    decidedBy: { id: session.userId, name: session.name },
    note: body.note,
  });
  return ok(toId(approval));
});
