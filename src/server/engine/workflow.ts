import { Agent, Approval, Project, Task, Workflow, WorkflowRun } from '@/models';
import { dbConnect } from '@/lib/db';
import { logActivity } from '../activity';
import { enqueueJob } from './queue';
import { TERMINAL_FOR_PIPELINE } from './dispatch';

export const DISCOVERY_WORKFLOW_KEY = 'new_seo_project';

const STEPS = [
  { key: 'audit', name: 'Website Crawl & SEO Audit', kind: 'audit' },
  { key: 'review', name: 'Team Head Review & Delegation', kind: 'teamhead_review' },
  { key: 'specialist_work', name: 'Specialist Execution', kind: '_virtual_wait_children' },
  { key: 'qa', name: 'QA Verification', kind: 'qa_verification' },
  { key: 'strategy', name: 'Strategy, Report & Approval', kind: 'teamhead_strategy' },
] as const;

async function agentFor(orgId: string, specialistKey: string) {
  return Agent.findOne({ organization: orgId, specialistKey });
}

/** Kick off the discovery workflow for a project (real backend operations). */
export async function startDiscovery(orgId: string, projectId: string, actor: { type: 'user' | 'system'; id?: string; name: string }) {
  await dbConnect();
  const project = await Project.findOne({ _id: projectId, organization: orgId });
  if (!project) throw new Error('Project not found');

  const existing = await WorkflowRun.findOne({ project: project._id, workflowKey: DISCOVERY_WORKFLOW_KEY, status: { $in: ['running', 'waiting_approval'] } });
  if (existing) return { workflowRunId: String(existing._id), alreadyRunning: true };

  const teamHead = await agentFor(orgId, 'team_head');
  const auditAgent = await agentFor(orgId, 'seo_audit');
  if (!teamHead || !auditAgent) throw new Error('Agent hierarchy not initialized. Run the seed script.');

  if (!project.teamHead) project.teamHead = teamHead._id;
  project.stage = 'Discovery';
  await project.save();

  let workflow = await Workflow.findOne({ key: DISCOVERY_WORKFLOW_KEY, isTemplate: true });
  if (!workflow) {
    workflow = await Workflow.create({
      key: DISCOVERY_WORKFLOW_KEY,
      name: 'New SEO Project',
      description: 'Crawl → audit → Team Head review → specialist execution → QA → strategy → approval → report.',
      isTemplate: true,
      steps: STEPS.map((s) => ({ key: s.key, name: s.name, kind: s.kind })),
    });
  }

  const auditTask = await Task.create({
    organization: orgId,
    project: project._id,
    kind: 'audit',
    title: 'Full website audit',
    objective: `Crawl ${project.website}, collect technical and on-page signals, record findings with evidence.`,
    assignedAgent: auditAgent._id,
    createdBy: actor,
    priority: 'High',
    status: 'Queued',
    input: { maxPages: 25 },
    expectedOutput: 'Crawl artifact + findings',
    allowedTools: auditAgent.tools,
    isDemo: project.isDemo,
  });

  const workflowRun = await WorkflowRun.create({
    organization: orgId,
    workflow: workflow._id,
    workflowKey: DISCOVERY_WORKFLOW_KEY,
    project: project._id,
    status: 'running',
    currentStep: 'audit',
    steps: STEPS.map((s) => ({
      key: s.key, name: s.name,
      status: s.key === 'audit' ? 'running' : 'pending',
      ...(s.key === 'audit' ? { task: auditTask._id, startedAt: new Date() } : {}),
    })),
  });

  await logActivity({ orgId, actor, action: `Discovery workflow started`, projectId: String(project._id), metadata: { workflowRunId: String(workflowRun._id) }, isDemo: project.isDemo });
  await enqueueJob(orgId, 'run_task', { taskId: String(auditTask._id) });
  return { workflowRunId: String(workflowRun._id), alreadyRunning: false };
}

/** Advance the workflow when tasks complete. Idempotent. */
export async function advanceWorkflow(projectId: string) {
  await dbConnect();
  const run = await WorkflowRun.findOne({ project: projectId, workflowKey: DISCOVERY_WORKFLOW_KEY, status: { $in: ['running', 'waiting_approval'] } }).sort({ createdAt: -1 });
  if (!run) return;
  const orgId = String(run.organization);
  const project = await Project.findById(run.project);
  if (!project) return;

  const step = (key: string) => run.steps.find((s: { key: string; status?: string }) => s.key === key);
  const stepStatus = (key: string) => step(key)?.status;

  const auditTask = step('audit')?.task ? await Task.findById(step('audit')!.task) : null;
  if (run.status === 'running' && ['running', 'failed'].includes(stepStatus('audit') ?? '') && auditTask && auditTask.status === 'Failed') {
    run.status = 'failed';
    run.steps.find((s: { key: string; status?: string }) => s.key === 'audit')!.status = 'failed';
    await run.save();
    await Project.updateOne({ _id: project._id }, { $set: { stage: 'New' } });
    await logActivity({ orgId, actor: { type: 'system', name: 'Workflow Engine' }, action: 'Discovery workflow failed at audit step', projectId, isDemo: project.isDemo });
    return;
  }

  // review step
  if (stepStatus('audit') === 'completed' && stepStatus('review') === 'pending') {
    const teamHead = await agentFor(orgId, 'team_head');
    const task = await Task.create({
      organization: orgId, project: project._id,
      kind: 'teamhead_review', title: 'Review audit & delegate specialists',
      objective: 'Prioritize findings, decide which specialists are needed, create tasks.',
      assignedAgent: teamHead!._id,
      createdBy: { type: 'system', name: 'Workflow Engine' },
      priority: 'High', status: 'Queued', isDemo: project.isDemo,
      dependencies: [auditTask!._id],
      input: { workflowRunId: String(run._id) },
    });
    step('review')!.status = 'running';
    step('review')!.task = task._id;
    step('review')!.startedAt = new Date();
    run.currentStep = 'review';
    await run.save();
    await Project.updateOne({ _id: project._id }, { $set: { stage: 'Strategy' } });
    await enqueueJob(orgId, 'run_task', { taskId: String(task._id) });
    return;
  }

  // specialist_work (virtual): wait for review's child tasks to reach terminal states
  if (stepStatus('review') === 'completed' && stepStatus('specialist_work') === 'pending') {
    step('specialist_work')!.status = 'running';
    step('specialist_work')!.startedAt = new Date();
    run.currentStep = 'specialist_work';
    await run.save();
    // enqueue any created child tasks
    const children = await Task.find({ parentTask: step('review')!.task, status: 'Queued' }).select('_id');
    for (const c of children) await enqueueJob(orgId, 'run_task', { taskId: String(c._id) });
    if (children.length === 0) {
      step('specialist_work')!.status = 'completed';
      step('specialist_work')!.note = 'Team Head decided no specialist tasks were required.';
      step('specialist_work')!.completedAt = new Date();
      await run.save();
    }
    return;
  }

  if (stepStatus('specialist_work') === 'running') {
    const children = await Task.find({ parentTask: step('review')!.task }).select('status');
    const allDone = children.length > 0 && children.every((c) => [...TERMINAL_FOR_PIPELINE, 'Failed'].includes(c.status));
    if (allDone) {
      step('specialist_work')!.status = 'completed';
      step('specialist_work')!.completedAt = new Date();
      await run.save();
    } else {
      return; // keep waiting; completion of each child re-triggers advance
    }
  }

  // QA step — run after specialist work
  if (stepStatus('specialist_work') === 'completed' && stepStatus('qa') === 'pending') {
    const qa = await agentFor(orgId, 'qa');
    const task = await Task.create({
      organization: orgId, project: project._id,
      kind: 'qa_verification', title: 'QA verification of specialist work',
      objective: 'Re-fetch affected pages, verify findings and check specialist outputs.',
      assignedAgent: qa!._id,
      createdBy: { type: 'system', name: 'Workflow Engine' },
      priority: 'High', status: 'Queued', isDemo: project.isDemo,
      input: { workflowRunId: String(run._id) },
    });
    step('qa')!.status = 'running';
    step('qa')!.task = task._id;
    step('qa')!.startedAt = new Date();
    run.currentStep = 'qa';
    await run.save();
    await enqueueJob(orgId, 'run_task', { taskId: String(task._id) });
    return;
  }

  // Strategy step — approval checkpoint
  if (stepStatus('qa') === 'completed' && stepStatus('strategy') === 'pending') {
    const teamHead = await agentFor(orgId, 'team_head');
    const task = await Task.create({
      organization: orgId, project: project._id,
      kind: 'teamhead_strategy', title: 'Build strategy & report',
      objective: 'Compile findings and results into a strategy, generate the discovery report and request owner approval.',
      assignedAgent: teamHead!._id,
      createdBy: { type: 'system', name: 'Workflow Engine' },
      priority: 'Critical', status: 'Queued', isDemo: project.isDemo,
      input: { workflowRunId: String(run._id) },
    });
    step('strategy')!.status = 'running';
    step('strategy')!.task = task._id;
    step('strategy')!.startedAt = new Date();
    run.currentStep = 'strategy';
    await run.save();
    await enqueueJob(orgId, 'run_task', { taskId: String(task._id) });
    return;
  }

  if (['running', 'completed'].includes(stepStatus('strategy') ?? '')) {
    // (the dispatch layer may have already marked the step completed)
    const approval = await Approval.findOne({ workflowRun: String(run._id), actionType: 'strategy_plan' }).sort({ createdAt: -1 })
      ?? await Approval.findOne({ project: project._id, actionType: 'strategy_plan', status: 'Pending' }).sort({ createdAt: -1 });
    if (approval?.status === 'Pending') {
      if (run.status !== 'waiting_approval') {
        run.status = 'waiting_approval';
        await run.save();
        await logActivity({ orgId, actor: { type: 'system', name: 'Workflow Engine' }, action: 'Workflow paused at approval checkpoint (strategy)', projectId, isDemo: project.isDemo });
      }
      return;
    }
    if (approval?.status === 'Approved' || approval?.status === 'Rejected') {
      step('strategy')!.status = 'completed';
      step('strategy')!.completedAt = new Date();
      step('strategy')!.note = approval.status === 'Approved' ? 'Owner approved strategy.' : 'Owner rejected strategy — awaiting direction.';
      run.status = 'completed';
      run.completedAt = new Date();
      await run.save();
      await Project.updateOne({ _id: project._id }, { $set: { stage: approval.status === 'Approved' ? 'Monitoring' : 'Strategy' } });
      await logActivity({ orgId, actor: { type: 'system', name: 'Workflow Engine' }, action: `Discovery workflow completed (strategy ${approval.status.toLowerCase()})`, projectId, isDemo: project.isDemo });
    }
  }
}
