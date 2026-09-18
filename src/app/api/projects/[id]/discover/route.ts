export const dynamic = 'force-dynamic';

import { handler, ok, ApiError } from '@/lib/http';
import { requireAuth } from '../../../_lib';
import { startDiscovery } from '@/server/engine/workflow';
import { rateLimit } from '@/lib/ratelimit';

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAuth();
  if (!rateLimit(`discover:${session.orgId}`, 10, 60_000)) {
    throw new ApiError('Too many discovery requests. Wait a minute.', 429);
  }
  const result = await startDiscovery(session.orgId, params.id, { type: 'user', id: session.userId, name: session.name });
  return ok(result, 202);
});
