export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { ExecutionArtifact } from '@/models';
import { requireAuth } from '../../_lib';

export const GET = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAuth();
  await dbConnect();
  const artifact = await ExecutionArtifact.findOne({ _id: params.id, organization: session.orgId }).lean<any>();
  if (!artifact) throw new ApiError('Artifact not found', 404);
  return ok(toId(artifact));
});
