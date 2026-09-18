export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Report } from '@/models';
import { listQuery, requireAuth } from '../_lib';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const { limit, skip, searchParams } = listQuery(req.url, { limit: 30 });
  await dbConnect();
  const filter: Record<string, unknown> = { organization: session.orgId };
  if (searchParams.get('project')) filter.project = searchParams.get('project');
  const [items, total] = await Promise.all([
    Report.find(filter).select('-sections').populate('project', 'name isDemo').sort({ createdAt: -1 }).skip(skip).limit(limit).lean<any>(),
    Report.countDocuments(filter),
  ]);
  return ok(toId({ items, total }));
});
