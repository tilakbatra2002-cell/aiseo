import type { Types } from 'mongoose';
import {
  AgentRun, Task, ExecutionArtifact, Finding,
} from '@/models';
import { logActivity } from '../activity';
import type { RawFinding } from '../rules';

export interface RunCtx {
  orgId: string;
  agent: { _id: Types.ObjectId; name: string; specialistKey: string; tools: string[]; permissions: { canExecuteExternal: boolean }; [k: string]: unknown };
  project: { _id: Types.ObjectId; website: string; name: string; competitors: string[]; targetLocations: string[]; targetKeywords: string[]; isDemo: boolean; [k: string]: unknown };
  task: { _id: Types.ObjectId; title: string; kind: string; input?: Record<string, unknown>; [k: string]: unknown };
  run: InstanceType<typeof AgentRun>;
  toolCalls: { tool: string; action: string; startedAt: Date; durationMs: number; ok: boolean; summary: string }[];
  findings: string[];
  artifacts: string[];

  tool<T>(tool: string, action: string, fn: () => Promise<T>, summarize?: (r: T) => string): Promise<T>;
  taskLog(message: string): Promise<void>;
  addFindings(list: RawFinding[]): Promise<number>;
  artifact(type: string, name: string, content: unknown, preview?: string): Promise<void>;
  output(data: Record<string, unknown>): Promise<void>;
  fail(message: string): Promise<never>;
}

export async function createRunCtx(opts: {
  orgId: string;
  agent: RunCtx['agent'];
  project: RunCtx['project'];
  task: RunCtx['task'];
}): Promise<{ ctx: RunCtx; complete: () => Promise<InstanceType<typeof AgentRun>> }> {
  const run = await AgentRun.create({
    organization: opts.orgId,
    agent: opts.agent._id,
    project: opts.project._id,
    task: opts.task._id,
    input: opts.task.input ?? {},
    tools: opts.agent.tools ?? [],
    status: 'Running',
    startedAt: new Date(),
    isDemo: opts.project.isDemo ?? false,
  });

  const ctx: RunCtx = {
    orgId: opts.orgId,
    agent: opts.agent,
    project: opts.project,
    task: opts.task,
    run,
    toolCalls: [],
    findings: [],
    artifacts: [],

    async tool(tool, action, fn, summarize) {
      const startedAt = new Date();
      try {
        const result = await fn();
        ctx.toolCalls.push({
          tool, action, startedAt,
          durationMs: Date.now() - startedAt.getTime(),
          ok: true,
          summary: summarize ? summarize(result).slice(0, 300) : 'ok',
        });
        return result;
      } catch (e) {
        ctx.toolCalls.push({
          tool, action, startedAt,
          durationMs: Date.now() - startedAt.getTime(),
          ok: false,
          summary: (e as Error).message.slice(0, 300),
        });
        throw e;
      }
    },

    async taskLog(message) {
      await Task.updateOne({ _id: opts.task._id }, { $push: { logs: { at: new Date(), message: message.slice(0, 500) } } });
      await logActivity({
        orgId: opts.orgId,
        actor: { type: 'agent', id: String(opts.agent._id), name: opts.agent.name },
        action: message,
        projectId: String(opts.project._id),
        taskId: String(opts.task._id),
        agentId: String(opts.agent._id),
        isDemo: opts.project.isDemo,
      });
    },

    async addFindings(list) {
      let created = 0;
      for (const f of list) {
        // Dedupe: same rule + URL on the same project, still open
        const existing = await Finding.findOne({
          organization: opts.orgId, project: opts.project._id, ruleKey: f.ruleKey, url: f.url ?? null,
          status: { $in: ['Detected', 'Recommended', 'Approved'] },
        }).select('_id');
        if (existing) continue;
        const doc = await Finding.create({
          organization: opts.orgId,
          project: opts.project._id,
          ...f,
          url: f.url ?? null,
          detectedBy: opts.agent._id,
          isDemo: opts.project.isDemo ?? false,
        });
        ctx.findings.push(String(doc._id));
        created++;
      }
      if (created > 0) {
        await logActivity({
          orgId: opts.orgId,
          actor: { type: 'agent', id: String(opts.agent._id), name: opts.agent.name },
          action: `${opts.agent.name} reported ${created} finding(s)`,
          projectId: String(opts.project._id),
          agentId: String(opts.agent._id),
          metadata: { count: created },
          isDemo: opts.project.isDemo,
        });
      }
      return created;
    },

    async artifact(type, name, content, preview) {
      const str = typeof content === 'string' ? content : JSON.stringify(content);
      const doc = await ExecutionArtifact.create({
        organization: opts.orgId,
        project: opts.project._id,
        task: opts.task._id,
        agentRun: run._id,
        type, name,
        content,
        contentPreview: (preview ?? str).slice(0, 280),
        size: str.length,
      });
      ctx.artifacts.push(String(doc._id));
    },

    async output(data) {
      run.output = data;
      await run.save();
    },

    async fail(message): Promise<never> {
      throw new Error(message);
    },
  };

  async function complete() {
    run.toolCalls = ctx.toolCalls as never;
    run.artifacts = ctx.artifacts as never;
    run.status = 'Completed';
    run.completedAt = new Date();
    run.durationMs = run.completedAt.getTime() - (run.startedAt?.getTime() ?? run.completedAt.getTime());
    await run.save();
    return run;
  }

  return { ctx, complete };
}
