import { Agent, Project, Task, WorkflowRun } from '@/models';
import { logActivity } from '../activity';
import { createRunCtx } from './run-context';
import {
  runAudit, runTechnicalAudit, runKeywordResearch, runCompetitorAnalysis,
} from './specialists-core';
import {
  runOnPageOptimization, runInternalLinking, runContentAnalysis, runLocalSeo,
  runGbpAnalysis, runOffPageAnalysis, runAnalyticsReview, runQaVerification,
} from './specialists-misc';
import { runTeamHeadReview, runTeamHeadStrategy, buildReport } from './teamhead';
import { enqueueJob } from './queue';

type SpecialistFn = (ctx: Awaited<ReturnType<typeof createRunCtx>>['ctx']) => Promise<void>;

const KIND_TO_FN: Record<string, SpecialistFn> = {
  audit: runAudit,
  technical_audit: runTechnicalAudit,
  keyword_research: runKeywordResearch,
  competitor_analysis: runCompetitorAnalysis,
  onpage_optimization: runOnPageOptimization,
  internal_linking: runInternalLinking,
  content_analysis: runContentAnalysis,
  local_seo: runLocalSeo,
  gbp_analysis: runGbpAnalysis,
  offpage_analysis: runOffPageAnalysis,
  analytics_review: runAnalyticsReview,
  qa_verification: runQaVerification,
  teamhead_review: runTeamHeadReview,
  teamhead_strategy: async (ctx) => runTeamHeadStrategy(ctx, buildReport),
};

const TERMINAL_FOR_PIPELINE = ['Completed', 'Needs Approval', 'Rejected', 'Cancelled'];

/** Execute a task: creates an AgentRun, dispatches to the specialist logic,
 *  records evidence/artifacts and updates the workflow run if applicable. */
export async function runTask(taskId: string): Promise<{ ok: boolean; error?: string }> {
  const task = await Task.findById(taskId);
  if (!task) return { ok: false, error: 'Task not found' };
  if (!['Queued', 'Assigned', 'Needs Rework'].includes(task.status)) return { ok: true }; // already handled

  const [agent, project] = await Promise.all([
    task.assignedAgent ? Agent.findById(task.assignedAgent) : null,
    Project.findById(task.project),
  ]);
  if (!project) return { ok: false, error: 'Project not found' };
  if (!agent) {
    await Task.updateOne({ _id: task._id }, { $set: { status: 'Failed' }, $push: { logs: { at: new Date(), message: 'No agent assigned' } } });
    return { ok: false, error: 'No agent assigned' };
  }

  const orgId = String(task.organization);
  await Task.updateOne({ _id: task._id }, { $set: { status: 'Running' }, $push: { logs: { at: new Date(), message: `Assigned to ${agent.name} — execution started` } } });
  await Agent.updateOne({ _id: agent._id }, { $set: { status: 'Working', lastActiveAt: new Date() } });
  await logActivity({
    orgId, actor: { type: 'agent', id: String(agent._id), name: agent.name },
    action: `${agent.name} started: ${task.title}`,
    projectId: String(project._id), taskId: String(task._id), agentId: String(agent._id), isDemo: project.isDemo,
  });

  const { ctx, complete } = await createRunCtx({
    orgId,
    agent: agent.toObject() as never,
    project: project.toObject() as never,
    task: task.toObject() as never,
  });

  let ok = true; let error: string | undefined;
  try {
    const fn = KIND_TO_FN[task.kind];
    if (!fn) throw new Error(`No specialist implemented for task kind "${task.kind}"`);
    await fn(ctx);
    const finishedRun = await complete();
    // Persist the specialist's structured output on the task itself
    await Task.updateOne({ _id: task._id }, { $set: { result: (finishedRun.output as Record<string, unknown>) ?? {} } });
    // Only set Completed if a specialist didn't move it (e.g. Needs Approval)
    await Task.updateOne({ _id: task._id, status: 'Running' }, { $set: { status: 'Completed' } });
    await Agent.updateOne({ _id: agent._id }, { $set: { status: 'Idle' } });
    await logActivity({
      orgId, actor: { type: 'agent', id: String(agent._id), name: agent.name },
      action: `${agent.name} completed: ${task.title}`,
      projectId: String(project._id), taskId: String(task._id), agentId: String(agent._id), isDemo: project.isDemo,
    });
  } catch (e) {
    ok = false;
    error = (e as Error).message;
    ctx.run.status = 'Failed';
    ctx.run.errors = [error];
    ctx.run.completedAt = new Date();
    ctx.run.toolCalls = ctx.toolCalls as never;
    await ctx.run.save();

    const retriesLeft = task.retryCount < task.maxRetries;
    const backoffMs = Math.pow(2, task.retryCount) * 30_000; // exponential backoff
    await Task.updateOne(
      { _id: task._id },
      retriesLeft
        ? { $set: { status: 'Queued', runAfter: new Date(Date.now() + backoffMs) }, $inc: { retryCount: 1 }, $push: { logs: { at: new Date(), message: `FAILED: ${error}. Retrying in ${Math.round(backoffMs / 1000)}s (attempt ${task.retryCount + 2}/${task.maxRetries + 1})` } } }
        : { $set: { status: 'Failed' }, $push: { logs: { at: new Date(), message: `FAILED permanently: ${error}` } } },
    );
    await Agent.updateOne({ _id: agent._id }, { $set: { status: retriesLeft ? 'Waiting' : 'Error' } });
    await logActivity({
      orgId, actor: { type: 'agent', id: String(agent._id), name: agent.name },
      action: `${agent.name} failed: ${task.title} — ${error}`,
      projectId: String(project._id), taskId: String(task._id), agentId: String(agent._id),
      metadata: { retry: retriesLeft, backoffMs }, isDemo: project.isDemo,
    });
    if (retriesLeft) {
      await enqueueJob(orgId, 'run_task', { taskId }, { runAfter: new Date(Date.now() + backoffMs) });
    }
  }

  // Advance any workflow step bound to this task
  if (ok || task.retryCount >= task.maxRetries) {
    await WorkflowRun.updateMany(
      { project: project._id, 'steps.task': task._id },
      { $set: { 'steps.$[s].status': ok ? 'completed' : 'failed', 'steps.$[s].completedAt': new Date() } },
      { arrayFilters: [{ 's.task': task._id }] },
    );
    await enqueueJob(orgId, 'advance_workflow', { projectId: String(project._id) });
  }
  return { ok, error };
}

// Workflow requires this exact name
export { KIND_TO_FN, TERMINAL_FOR_PIPELINE };
