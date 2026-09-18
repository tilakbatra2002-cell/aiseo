export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Agent, AgentRun, Task } from '@/models';
import { listQuery, requireAuth } from '../_lib';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const { searchParams } = listQuery(req.url);
  await dbConnect();
  const withPerf = searchParams.get('perf') === '1';
  const agents = await Agent.find({ organization: session.orgId })
    .select('-systemInstructions')
    .populate('department', 'name')
    .populate('parent', 'name')
    .sort({ isTeamHead: -1, createdAt: 1 })
    .lean<any>();

  let perf = new Map<string, Record<string, number>>();
  if (withPerf) {
    const rows = await AgentRun.aggregate([
      { $match: { organization: agents[0]?.organization } },
      {
        $group: {
          _id: '$agent',
          runs: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'Failed'] }, 1, 0] } },
          avgDurationMs: { $avg: '$durationMs' },
          toolCalls: { $sum: { $size: { $ifNull: ['$toolCalls', []] } } },
        },
      },
    ]);
    perf = new Map(rows.map((r: { _id: { toString(): string } } & Record<string, number>) => [r._id.toString(), r]));
  }

  // Real metrics calculated from database activity — never fabricated
  const items = agents.map((a) => {
    const p = perf.get(String(a._id));
    return {
      ...a,
      performance: p
        ? {
            runs: p.runs ?? 0,
            completed: p.completed ?? 0,
            failed: p.failed ?? 0,
            successRate: p.runs ? Math.round(((p.completed ?? 0) / p.runs) * 100) : 0,
            avgDurationMs: Math.round(p.avgDurationMs ?? 0),
            toolCalls: p.toolCalls ?? 0,
          }
        : null,
    };
  });
  const taskCounts = await Task.aggregate([
    { $group: { _id: { agent: '$assignedAgent', status: '$status' }, count: { $sum: 1 } } },
  ]);
  void taskCounts;
  return ok(toId({ items, total: items.length }));
});
