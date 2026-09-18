import { ActivityLog } from '@/models';

type Actor = { type: 'user' | 'agent' | 'system'; id?: string; name: string };

export async function logActivity(opts: {
  orgId: string;
  actor: Actor;
  action: string;
  projectId?: string;
  taskId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
  isDemo?: boolean;
}) {
  try {
    await ActivityLog.create({
      organization: opts.orgId,
      actorType: opts.actor.type,
      actor: { id: opts.actor.id, name: opts.actor.name },
      action: opts.action,
      project: opts.projectId,
      task: opts.taskId,
      agent: opts.agentId,
      metadata: opts.metadata,
      isDemo: opts.isDemo ?? false,
    });
  } catch (e) {
    console.error('[AgentOS] activity log failed', e);
  }
}
