export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Agent, AgentRun, Approval, KnowledgeDocument, Task } from '@/models';
import { readJson, requireAuth } from '../../_lib';

type Params = { params: { id: string } };

export const GET = handler(async (req: Request, { params }: Params) => {
  const session = await requireAuth();
  await dbConnect();
  const agent = await Agent.findOne({ _id: params.id, organization: session.orgId })
    .populate('department', 'name')
    .populate('parent', 'name role')
    .populate('knowledge', 'title type category')
    .lean<any>();
  if (!agent) throw new ApiError('Agent not found', 404);

  const u = new URL(req.url);
  if (u.searchParams.get('include') === 'full') {
    const [tasks, runs, approvals, perfAgg, memories] = await Promise.all([
      Task.find({ assignedAgent: agent._id, organization: session.orgId }).populate('project', 'name isDemo').sort({ createdAt: -1 }).limit(60).lean<any>(),
      AgentRun.find({ agent: agent._id }).populate('project', 'name').sort({ createdAt: -1 }).limit(40).lean<any>(),
      Approval.find({ organization: session.orgId, status: 'Pending', 'requestedBy.id': agent._id }).limit(20).lean<any>(),
      AgentRun.aggregate([
        { $match: { agent: agent._id } },
        { $group: {
          _id: null,
          runs: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'Failed'] }, 1, 0] } },
          avgDurationMs: { $avg: '$durationMs' },
          toolCalls: { $sum: { $size: { $ifNull: ['$toolCalls', []] } } },
        } },
      ]),
      (await import('@/models')).AgentMemory.find({ agent: agent._id }).sort({ createdAt: -1 }).limit(20).lean<any>(),
    ]);
    const qaAgg = await Task.aggregate([
      { $match: { assignedAgent: agent._id, qaStatus: { $in: ['passed', 'rework', 'failed'] } } },
      { $group: { _id: '$qaStatus', count: { $sum: 1 } } },
    ]);
    const p = perfAgg[0] ?? null;
    const qaMap = Object.fromEntries(qaAgg.map((r: { _id: string; count: number }) => [r._id, r.count]));
    const performance = p
      ? {
          runs: p.runs, completed: p.completed, failed: p.failed,
          successRate: p.runs ? Math.round((p.completed / p.runs) * 100) : 0,
          avgDurationMs: Math.round(p.avgDurationMs ?? 0),
          toolCalls: p.toolCalls ?? 0,
          qaPassRate: (qaMap.passed ?? 0) + (qaMap.rework ?? 0) + (qaMap.failed ?? 0)
            ? Math.round(((qaMap.passed ?? 0) / ((qaMap.passed ?? 0) + (qaMap.rework ?? 0) + (qaMap.failed ?? 0))) * 100)
            : null,
        }
      : null;
    return ok(toId({ agent, tasks, runs, approvals, performance, memories }));
  }
  return ok(toId(agent));
});

export const PATCH = handler(async (req: Request, { params }: Params) => {
  const session = await requireAuth();
  if (!['owner', 'admin'].includes(session.role)) throw new ApiError('Only owners can modify agents', 403);
  const body = (await readJson(req)) as Record<string, unknown>;
  await dbConnect();
  const allowed = ['name', 'description', 'systemInstructions', 'skills', 'tools', 'permissions', 'status', 'ai', 'successCriteria', 'knowledge'];
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  const agent = await Agent.findOneAndUpdate({ _id: params.id, organization: session.orgId }, { $set: update }, { new: true }).lean<any>();
  if (!agent) throw new ApiError('Agent not found', 404);
  return ok(toId(agent));
});
