export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Job } from '@/models';
import { requireAuth, listQuery } from '../_lib';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const { limit, searchParams } = listQuery(req.url, { limit: 40 });
  await dbConnect();
  const filter: Record<string, unknown> = { organization: session.orgId };
  if (searchParams.get('status')) filter.status = searchParams.get('status');
  const [items, stats] = await Promise.all([
    Job.find(filter).sort({ createdAt: -1 }).limit(limit).lean<any>(),
    Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  return ok(toId({ items, stats }));
});
