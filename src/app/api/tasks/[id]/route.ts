export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { AgentRun, Task } from '@/models';
import { readJson, requireAuth } from '../../_lib';
import { enqueueJob } from '@/server/engine/queue';
import { logActivity } from '@/server/activity';

type Params = { params: { id: string } };

export const GET = handler(async (_req: Request, { params }: Params) => {
  const session = await requireAuth();
  await dbConnect();
  const task = await Task.findOne({ _id: params.id, organization: session.orgId })
    .populate('assignedAgent', 'name role specialistKey status')
    .populate('project', 'name isDemo')
    .populate('dependencies', 'title status')
    .lean<any>();
  if (!task) throw new ApiError('Task not found', 404);
  const runs = await AgentRun.find({ task: task._id }).select('status startedAt completedAt durationMs toolCalls errors').sort({ createdAt: -1 }).lean<any>();
  return ok(toId({ task, runs }));
});

/** Actions: retry | cancel | reassign */
export const POST = handler(async (req: Request, { params }: Params) => {
  const session = await requireAuth();
  const body = (await readJson(req)) as { action?: string; agentId?: string };
  await dbConnect();
  const task = await Task.findOne({ _id: params.id, organization: session.orgId });
  if (!task) throw new ApiError('Task not found', 404);

  if (body.action === 'retry') {
    if (!['Failed', 'Cancelled', 'Needs Rework'].includes(task.status)) throw new ApiError('Only failed/cancelled tasks can be retried', 409);
    task.status = 'Queued';
    task.runAfter = new Date();
    task.logs.push({ at: new Date(), message: `Manual retry requested by ${session.name}` });
    await task.save();
    await enqueueJob(session.orgId, 'run_task', { taskId: String(task._id) });
    await logActivity({ orgId: session.orgId, actor: { type: 'user', id: session.userId, name: session.name }, action: `Owner retried task: ${task.title}`, projectId: String(task.project), taskId: String(task._id) });
    return ok(toId(task));
  }
  if (body.action === 'cancel') {
    if (['Completed', 'Cancelled'].includes(task.status)) throw new ApiError('Task already finished', 409);
    task.status = 'Cancelled';
    await task.save();
    await logActivity({ orgId: session.orgId, actor: { type: 'user', id: session.userId, name: session.name }, action: `Owner cancelled task: ${task.title}`, projectId: String(task.project), taskId: String(task._id) });
    return ok(toId(task));
  }
  if (body.action === 'reassign' && body.agentId) {
    task.assignedAgent = body.agentId as never;
    task.status = 'Queued';
    task.logs.push({ at: new Date(), message: `Reassigned by ${session.name}` });
    await task.save();
    await enqueueJob(session.orgId, 'run_task', { taskId: String(task._id) });
    return ok(toId(task));
  }
  throw new ApiError('Unknown action', 400);
});

export const PATCH = handler(async (req: Request, { params }: Params) => {
  const session = await requireAuth();
  const body = (await readJson(req)) as Record<string, unknown>;
  await dbConnect();
  const allowed = ['title', 'objective', 'instructions', 'priority', 'deadline', 'status'];
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  const task = await Task.findOneAndUpdate({ _id: params.id, organization: session.orgId }, { $set: update }, { new: true }).lean<any>();
  if (!task) throw new ApiError('Task not found', 404);
  return ok(toId(task));
});
