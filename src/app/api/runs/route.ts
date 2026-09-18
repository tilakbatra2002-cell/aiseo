export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { AgentRun } from '@/models';
import { listQuery, requireAuth } from '../_lib';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const { limit, skip, searchParams } = listQuery(req.url, { limit: 60 });
  await dbConnect();
  const filter: Record<string, unknown> = { organization: session.orgId };
  if (searchParams.get('status')) filter.status = searchParams.get('status');
  if (searchParams.get('agent')) filter.agent = searchParams.get('agent');
  if (searchParams.get('project')) filter.project = searchParams.get('project');
  const [items, total] = await Promise.all([
    AgentRun.find(filter)
      .populate('agent', 'name role specialistKey')
      .populate('project', 'name isDemo')
      .populate('task', 'title kind')
      .sort({ createdAt: -1 }).skip(skip).limit(limit).lean<any>(),
    AgentRun.countDocuments(filter),
  ]);
  return ok(toId({ items, total }));
});
