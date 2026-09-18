export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { ActivityLog, AgentRun, Approval, ExecutionArtifact, Finding, Project, ProjectMemory, Report, Task, WorkflowRun } from '@/models';
import { readJson, requireAuth } from '../../_lib';

type Params = { params: { id: string } };

export const GET = handler(async (req: Request, { params }: Params) => {
  const session = await requireAuth();
  await dbConnect();
  const project = await Project.findOne({ _id: params.id, organization: session.orgId })
    .populate('client', 'name industry')
    .populate('teamHead', 'name status role')
    .populate('specialists', 'name status role specialistKey')
    .lean<any>();
  if (!project) throw new ApiError('Project not found', 404);

  const u = new URL(req.url);
  if (u.searchParams.get('include') === 'full') {
    const [tasks, findings, findingsBySeverity, workflowRun, activity, runs, approvals, reports, memory, artifacts] = await Promise.all([
      Task.find({ project: project._id }).populate('assignedAgent', 'name role specialistKey').sort({ createdAt: -1 }).limit(100).lean<any>(),
      Finding.find({ project: project._id }).sort({ createdAt: -1 }).limit(150).lean<any>(),
      Finding.aggregate([{ $match: { project: project._id } }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
      WorkflowRun.findOne({ project: project._id }).sort({ createdAt: -1 }).lean<any>(),
      ActivityLog.find({ project: project._id }).sort({ createdAt: -1 }).limit(40).lean<any>(),
      AgentRun.find({ project: project._id }).populate('agent', 'name').sort({ createdAt: -1 }).limit(30).lean<any>(),
      Approval.find({ project: project._id }).sort({ createdAt: -1 }).limit(20).lean<any>(),
      Report.find({ project: project._id }).sort({ createdAt: -1 }).limit(10).lean<any>(),
      ProjectMemory.find({ project: project._id }).select('key value updatedAt').limit(20).lean<any>(),
      ExecutionArtifact.find({ project: project._id }).select('-content').sort({ createdAt: -1 }).limit(30).lean<any>(),
    ]);
    return ok(toId({ project, tasks, findings, findingsBySeverity, workflowRun, activity, runs, approvals, reports, memory, artifacts }));
  }
  return ok(toId(project));
});

export const PATCH = handler(async (req: Request, { params }: Params) => {
  const session = await requireAuth();
  const body = (await readJson(req)) as Record<string, unknown>;
  await dbConnect();
  const allowed = ['name', 'website', 'industry', 'country', 'targetLocations', 'businessGoals', 'competitors', 'targetKeywords', 'stage'];
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  const project = await Project.findOneAndUpdate({ _id: params.id, organization: session.orgId }, { $set: update }, { new: true }).lean<any>();
  if (!project) throw new ApiError('Project not found', 404);
  return ok(toId(project));
});
