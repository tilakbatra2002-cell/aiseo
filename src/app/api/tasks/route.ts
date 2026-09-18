export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { handler, ok, toId, ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Agent, Project, Task } from '@/models';
import { listQuery, parseBody, readJson, requireAuth } from '../_lib';
import { logActivity } from '@/server/activity';
import { enqueueJob } from '@/server/engine/queue';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const { limit, skip, searchParams } = listQuery(req.url, { limit: 60 });
  await dbConnect();
  const filter: Record<string, unknown> = { organization: session.orgId };
  if (searchParams.get('status')) filter.status = searchParams.get('status');
  if (searchParams.get('project')) filter.project = searchParams.get('project');
  if (searchParams.get('agent')) filter.assignedAgent = searchParams.get('agent');
  const [items, total] = await Promise.all([
    Task.find(filter)
      .populate('assignedAgent', 'name role specialistKey status')
      .populate('project', 'name isDemo')
      .sort({ createdAt: -1 }).skip(skip).limit(limit).lean<any>(),
    Task.countDocuments(filter),
  ]);
  return ok(toId({ items, total }));
});

const CreateSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(3).max(200),
  kind: z.string().min(2).max(60).default('custom'),
  objective: z.string().max(2000).optional(),
  assignedAgentId: z.string().optional(),
  priority: z.enum(['Critical', 'High', 'Medium', 'Low']).default('Medium'),
  requiresApproval: z.boolean().default(false),
});

export const POST = handler(async (req: Request) => {
  const session = await requireAuth();
  const body = parseBody(CreateSchema, await readJson(req));
  await dbConnect();
  const project = await Project.findOne({ _id: body.projectId, organization: session.orgId });
  if (!project) throw new ApiError('Project not found', 404);
  let agent: any = null;
  if (body.assignedAgentId) {
    agent = await Agent.findOne({ _id: body.assignedAgentId, organization: session.orgId });
    if (!agent) throw new ApiError('Agent not found', 404);
  }
  const task = await Task.create({
    organization: session.orgId,
    project: project._id,
    kind: body.kind,
    title: body.title,
    objective: body.objective,
    assignedAgent: agent?._id,
    createdBy: { type: 'user', id: session.userId, name: session.name },
    priority: body.priority,
    requiresApproval: body.requiresApproval,
    status: agent ? 'Queued' : 'Queued',
  });
  await logActivity({ orgId: session.orgId, actor: { type: 'user', id: session.userId, name: session.name }, action: `Owner created task: ${task.title}`, projectId: String(project._id), taskId: String(task._id) });
  if (agent) await enqueueJob(session.orgId, 'run_task', { taskId: String(task._id) });
  return ok(toId(task), 201);
});
