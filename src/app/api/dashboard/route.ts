export const dynamic = 'force-dynamic';

import mongoose from 'mongoose';
import { handler, ok, toId } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { ActivityLog, Agent, AgentRun, Approval, Finding, Project, Task } from '@/models';
import { requireAuth } from '../_lib';

export const GET = handler(async () => {
  const session = await requireAuth();
  await dbConnect();
  const org = session.orgId;

  const [
    activeProjects, agents, runningTasks, pendingApprovals, failedTasks,
    completedTasks, criticalIssues, projectsByStage, recentActivity, tasksByStatus,
  ] = await Promise.all([
    Project.countDocuments({ organization: org, stage: { $nin: ['Reporting'] } }),
    Agent.find({ organization: org }).select('name role status specialistKey isTeamHead lastActiveAt').lean<any>(),
    Task.countDocuments({ organization: org, status: 'Running' }),
    Approval.countDocuments({ organization: org, status: 'Pending' }),
    Task.countDocuments({ organization: org, status: 'Failed' }),
    Task.countDocuments({ organization: org, status: 'Completed' }),
    Finding.countDocuments({ organization: org, severity: 'Critical', status: { $in: ['Detected', 'Recommended'] } }),
    Project.aggregate([{ $match: { organization: new mongoose.Types.ObjectId(org) } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
    ActivityLog.find({ organization: org }).sort({ createdAt: -1 }).limit(20).lean<any>(),
    Task.aggregate([{ $match: { organization: new mongoose.Types.ObjectId(org) } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const attentionProjects = await Project.find({ organization: org })
    .select('name stage isDemo client website')
    .populate('client', 'name')
    .sort({ updatedAt: -1 }).limit(6).lean<any>();
  const failedByProject = await Task.aggregate([
    { $match: { organization: new mongoose.Types.ObjectId(org), status: 'Failed' } },
    { $group: { _id: '$project', count: { $sum: 1 } } },
  ]);
  const failedMap = new Map(failedByProject.map((r: { _id: unknown; count: number }) => [String(r._id), r.count]));

  return ok(toId({
    stats: {
      activeProjects,
      activeAgents: agents.filter((a) => a.status === 'Working').length,
      totalAgents: agents.length,
      runningTasks,
      pendingApprovals,
      failedTasks,
      completedTasks,
      criticalIssues,
    },
    workforce: agents.map((a) => ({
      id: a._id, name: a.name, role: a.role, status: a.status,
      specialistKey: a.specialistKey, isTeamHead: a.isTeamHead, lastActiveAt: a.lastActiveAt,
    })),
    projectsByStage,
    tasksByStatus,
    recentActivity,
    projectsNeedingAttention: attentionProjects
      .filter((p) => failedMap.get(String(p._id)))
      .map((p) => ({ ...p, failedTasks: failedMap.get(String(p._id)) })),
    allProjectsPreview: attentionProjects,
  }));
});
