export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { ActivityLog } from '@/models';
import { listQuery, requireAuth } from '../_lib';

/** Live activity feed — real system events only (§24). */
export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const { limit, skip, searchParams } = listQuery(req.url, { limit: 50 });
  await dbConnect();
  const filter: Record<string, unknown> = { organization: session.orgId };
  if (searchParams.get('project')) filter.project = searchParams.get('project');
  if (searchParams.get('since')) filter.createdAt = { $gt: new Date(searchParams.get('since')!) };
  const items = await ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean<any>();
  return ok(toId({ items }));
});
