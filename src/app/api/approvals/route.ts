export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Approval } from '@/models';
import { listQuery, requireAuth } from '../_lib';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const { limit, skip, searchParams } = listQuery(req.url, { limit: 50 });
  await dbConnect();
  const filter: Record<string, unknown> = { organization: session.orgId };
  if (searchParams.get('status')) filter.status = searchParams.get('status');
  const [items, total, pendingCount] = await Promise.all([
    Approval.find(filter).populate('project', 'name isDemo').populate('task', 'title').sort({ createdAt: -1 }).skip(skip).limit(limit).lean<any>(),
    Approval.countDocuments(filter),
    Approval.countDocuments({ organization: session.orgId, status: 'Pending' }),
  ]);
  return ok(toId({ items, total, pendingCount }));
});
