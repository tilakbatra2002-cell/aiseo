import { Agent, Approval, Finding, Project, Report, Task } from '@/models';
import { priorityScore, scoreToPriority } from '../priority';
import { aiComplete } from '../ai';
import { logActivity } from '../activity';
import type { RunCtx } from './run-context';

const SEV_WEIGHT: Record<string, number> = { Critical: 5, High: 4, Medium: 3, Low: 2, Informational: 1 };

function aggImpact(findings: { severity: string }[]): number {
  if (!findings.length) return 2;
  const max = Math.max(...findings.map((f: any) => SEV_WEIGHT[f.severity] ?? 2));
  return Math.max(2, Math.min(5, max + (findings.length > 5 ? 1 : 0)));
}

/* ============= Team Head: review findings → delegate ============= */
export async function runTeamHeadReview(ctx: RunCtx) {
  await ctx.taskLog(`${ctx.agent.name} reviewing audit results`);
  const findings = await Finding.find({
    project: ctx.project._id,
    status: { $in: ['Detected'] },
  }).lean<any>();

  // ---- SEO Intelligence consumption (own data layer; additive) ----
  const { SEOIssue, Crawl: SEOSiteCrawl } = await import('@/models');
  const seoIntel = await ctx.tool('seo_intelligence', 'read SEO Intelligence layer', async () => {
    const [openIssues, lastCrawl] = await Promise.all([
      SEOIssue.find({ project: ctx.project._id, status: 'open' }).select('severity category ruleKey url').lean<any>(),
      SEOSiteCrawl.findOne({ project: ctx.project._id, type: 'self', status: 'completed' }).sort({ startedAt: -1 }).select('stats completedAt progress').lean<any>(),
    ]);
    const bySev: Record<string, number> = {};
    const byCat: Record<string, number> = {};
    for (const i of openIssues) { bySev[i.severity] = (bySev[i.severity] ?? 0) + 1; byCat[i.category] = (byCat[i.category] ?? 0) + 1; }
    return { openIssues: openIssues.length, bySeverity: bySev, byCategory: byCat, crawl: lastCrawl ? { completedAt: lastCrawl.completedAt, stats: lastCrawl.stats } : null };
  }, (r) => `SEO Intelligence: ${r.openIssues} open measured issue(s)${r.crawl ? ' from first-party crawl' : ''}`);

  const byCategory = new Map<string, typeof findings>();
  for (const f of findings) {
    const list = byCategory.get(f.category) ?? [];
    list.push(f);
    byCategory.set(f.category, list);
  }

  const specialists = await Agent.find({
    organization: ctx.orgId, department: ctx.agent.department, isTeamHead: { $ne: true },
  }).lean<any>();
  const byKey = new Map<string, any>(specialists.map((a) => [a.specialistKey, a]));

  // Dynamic, conditional delegation — not every project uses every agent.
  const plan: { specialistKey: string; kind: string; title: string; objective: string; rationale: string; input?: Record<string, unknown> }[] = [];

  if ((byCategory.get('technical')?.length ?? 0) > 0) {
    plan.push({
      specialistKey: 'technical_seo', kind: 'technical_audit', title: 'Technical verification pass',
      objective: 'Verify indexability and re-confirm error URLs from the audit evidence.',
      rationale: `${byCategory.get('technical')!.length} technical finding(s) need verification.`,
    });
  }
  if ((byCategory.get('onpage')?.length ?? 0) > 0) {
    plan.push({
      specialistKey: 'onpage_seo', kind: 'onpage_optimization', title: 'On-page optimization drafts',
      objective: 'Draft corrected titles and meta descriptions for approved implementation.',
      rationale: `${byCategory.get('onpage')!.length} on-page finding(s) can be fixed quickly.`,
    });
  }
  plan.push({
    specialistKey: 'keyword_research', kind: 'keyword_research', title: 'Keyword discovery & clustering',
    objective: 'Extract keywords from crawled content, classify intent and detect cannibalization.',
    rationale: 'Baseline keyword map informs all downstream strategy.',
  });
  if ((ctx.project.competitors ?? []).length > 0) {
    plan.push({
      specialistKey: 'competitor_analysis', kind: 'competitor_analysis', title: 'Competitor comparison',
      objective: 'Compare structure, content and technical signals vs configured competitors.',
      rationale: `${ctx.project.competitors.length} competitor(s) configured.`,
      input: { competitors: ctx.project.competitors },
    });
  }
  if ((byCategory.get('content')?.length ?? 0) > 0 || (byCategory.get('onpage')?.length ?? 0) > 0) {
    plan.push({
      specialistKey: 'content_seo', kind: 'content_analysis', title: 'Content expansion briefs',
      objective: 'Create content briefs for thin pages and content gaps.',
      rationale: 'Content findings detected in the audit.',
    });
  }
  if ((byCategory.get('links')?.length ?? 0) > 0 || (seoIntel.byCategory.links ?? 0) > 0 || (seoIntel.byCategory.indexability ?? 0) > 0) {
    plan.push({
      specialistKey: 'internal_linking', kind: 'internal_linking', title: 'Internal linking improvements',
      objective: 'Map the link graph and surface orphan/weakly-linked pages.',
      rationale: `${(byCategory.get('links')?.length ?? 0) + (seoIntel.byCategory.links ?? 0)} internal-linking signal(s) from findings + SEO Intelligence (${seoIntel.byCategory.indexability ?? 0} indexability).`,
    });
  }
  if ((ctx.project.targetLocations ?? []).length > 0) {
    plan.push({
      specialistKey: 'local_seo', kind: 'local_seo', title: 'Local SEO coverage check',
      objective: 'Verify local schema and location page coverage for target locations.',
      rationale: `${ctx.project.targetLocations.length} target location(s) configured.`,
    });
    plan.push({
      specialistKey: 'gbp', kind: 'gbp_analysis', title: 'Google Business Profile review',
      objective: 'Assess GBP presence (requires GBP integration).',
      rationale: 'Local business — GBP is a core lever.',
    });
  }
  plan.push({
    specialistKey: 'offpage_seo', kind: 'offpage_analysis', title: 'Off-page & backlink assessment',
    objective: 'Assess backlink profile (requires backlink data provider).',
    rationale: 'Authority baseline needed for strategy.',
  });
  plan.push({
    specialistKey: 'analytics', kind: 'analytics_review', title: 'Analytics & Search Console check',
    objective: 'Review connected analytics (requires integrations).',
    rationale: 'Performance baseline needed for strategy.',
  });

  const created: string[] = [];
  for (const item of plan) {
    const agent = byKey.get(item.specialistKey);
    if (!agent) continue;
    const catFindings = byCategory.get(
      item.specialistKey === 'technical_seo' ? 'technical'
        : item.specialistKey === 'onpage_seo' ? 'onpage'
        : item.specialistKey === 'content_seo' ? 'content'
        : item.specialistKey === 'internal_linking' ? 'links' : '') ?? [];
    const score = priorityScore({ impact: aggImpact(catFindings), effort: 3, confidence: 4, risk: 1 });
    const task = await Task.create({
      organization: ctx.orgId,
      project: ctx.project._id,
      parentTask: ctx.task._id,
      kind: item.kind,
      title: item.title,
      objective: item.objective,
      instructions: `${item.objective}\nContext: ${item.rationale}`,
      assignedAgent: agent._id,
      createdBy: { type: 'agent', id: ctx.agent._id, name: ctx.agent.name },
      priority: scoreToPriority(score),
      priorityScore: score,
      status: 'Queued',
      dependencies: item.specialistKey === 'onpage_seo' ? [] : [],
      input: item.input ?? {},
      expectedOutput: 'Structured result JSON stored on the task and AgentRun.',
      allowedTools: agent.tools,
      requiresApproval: false,
      qaStatus: 'pending',
      isDemo: ctx.project.isDemo,
    });
    created.push(String(task._id));
  }

  // Memory: record the plan so later tasks see the rationale (project memory §27)
  const { ProjectMemory } = await import('@/models');
  await ProjectMemory.findOneAndUpdate(
    { organization: ctx.orgId, project: ctx.project._id, key: 'teamhead_plan' },
    { value: { plan: plan.map((p) => ({ key: p.specialistKey, title: p.title, rationale: p.rationale })), createdAt: new Date() }, writtenBy: ctx.agent._id },
    { upsert: true },
  );

  await Project.updateOne({ _id: ctx.project._id }, { $set: { stage: 'Execution' } });
  await ctx.output({
    findingsReviewed: findings.length,
    tasksCreated: plan.length,
    seoIntelligence: seoIntel,
    plan: plan.map((p) => ({ specialist: p.specialistKey, title: p.title, rationale: p.rationale })),
    createdTaskIds: created,
  });
  await logActivity({
    orgId: ctx.orgId,
    actor: { type: 'agent', id: String(ctx.agent._id), name: ctx.agent.name },
    action: `${ctx.agent.name} created ${plan.length} specialist task(s)`,
    projectId: String(ctx.project._id),
    metadata: { tasks: plan.map((p) => p.title) },
    isDemo: ctx.project.isDemo,
  });
  await ctx.taskLog(`${ctx.agent.name} delegated ${plan.length} tasks to specialists`);
}

/* ============ Team Head: strategy + report + approval ============ */
export async function runTeamHeadStrategy(ctx: RunCtx, generateReport: (ctx: RunCtx, strategy: Record<string, unknown>) => Promise<string>) {
  await ctx.taskLog(`${ctx.agent.name} building strategy`);

  const [findingsByStatus, severityCounts, tasks] = await Promise.all([
    Finding.aggregate([{ $match: { project: ctx.project._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Finding.aggregate([{ $match: { project: ctx.project._id } }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
    Task.find({ project: ctx.project._id, _id: { $ne: ctx.task._id } }).select('title kind status priority result').lean<any>(),
  ]);

  const strategy: Record<string, unknown> = {
    generatedAt: new Date(),
    findingsByStatus: Object.fromEntries(findingsByStatus.map((r: { _id: string; count: number }) => [r._id, r.count])),
    severityCounts: Object.fromEntries(severityCounts.map((r: { _id: string; count: number }) => [r._id, r.count])),
    workSummary: tasks.map((t) => ({ title: t.title, kind: t.kind, status: t.status, priority: t.priority })),
    priorities: [] as unknown[],
    aiNarrative: null as unknown,
  };

  const openFindings = await Finding.find({ project: ctx.project._id, status: { $in: ['Detected', 'Recommended'] } })
    .sort({ severity: 1 }).limit(10).lean<any>();
  strategy.priorities = openFindings.map((f) => ({
    title: f.title, severity: f.severity, url: f.url,
    internalPriorityScore: priorityScore({ impact: f.impact, effort: f.effort, confidence: f.confidence, risk: f.risk }),
    recommendedAction: f.recommendedAction,
  }));

  // Optional AI narrative (labelled; deterministic fallback otherwise)
  const ai = await aiComplete([
    { role: 'system', content: 'You are a Senior SEO Manager summarizing audit results for an agency owner. Be factual, concise, never invent metrics.' },
    { role: 'user', content: JSON.stringify({ findingsByStatus: strategy.findingsByStatus, severityCounts: strategy.severityCounts, priorities: (strategy.priorities as unknown[]).slice(0, 5) }) },
  ]);
  strategy.aiNarrative = ai ? { text: ai.text, provider: ai.provider, model: ai.model, aiGenerated: true } : null;

  await Project.updateOne({ _id: ctx.project._id }, { $set: { strategy, stage: 'QA' } });
  const reportId = await generateReport(ctx, strategy);

  const approval = await Approval.create({
    organization: ctx.orgId,
    project: ctx.project._id,
    task: ctx.task._id,
    workflowRun: ctx.task.input?.workflowRunId ?? undefined,
    requestedBy: { type: 'agent', id: ctx.agent._id, name: ctx.agent.name },
    actionType: 'strategy_plan',
    title: 'Approve SEO strategy & execution plan',
    description: 'Team Head has completed discovery, delegated specialist work and generated a report. Approve the strategy to move the project to Monitoring/Reporting.',
    risk: 'Medium',
    payload: { reportId, priorityCount: (strategy.priorities as unknown[]).length },
  });

  await Task.updateOne({ _id: ctx.task._id }, { $set: { approval: approval._id } });
  await ctx.output({ strategyId: 'project.strategy', reportId, approvalId: String(approval._id) });
  await logActivity({
    orgId: ctx.orgId,
    actor: { type: 'agent', id: String(ctx.agent._id), name: ctx.agent.name },
    action: `${ctx.agent.name} requested strategy approval`,
    projectId: String(ctx.project._id),
    metadata: { approvalId: String(approval._id) },
    isDemo: ctx.project.isDemo,
  });
  await ctx.taskLog(`${ctx.agent.name} submitted strategy for owner approval`);
}

/* ================== Report generation (data-driven) ================= */
export async function buildReport(ctx: RunCtx, strategy: Record<string, unknown>): Promise<string> {
  const projectId = ctx.project._id;
  const [findings, tasks, runs, approvals] = (await Promise.all([
    Finding.find({ project: projectId }).select('category severity status title url verification recommendedAction ruleKey').lean<any>(),
    Task.find({ project: projectId }).select('title kind status priority createdAt').lean<any>(),
    (await import('@/models')).AgentRun.find({ project: projectId }).select('status durationMs').lean<any>(),
    Approval.find({ project: projectId }).select('title status actionType').lean<any>(),
  ])) as any[];

  const count = <T,>(arr: T[], pred: (x: T) => boolean) => arr.filter(pred).length;
  const sections = {
    executiveSummary: {
      findingsTotal: findings.length,
      critical: count(findings, (f: any) => f.severity === 'Critical'),
      byStatus: strategy.findingsByStatus,
      tasksCompleted: count(tasks, (t: any) => t.status === 'Completed'),
      tasksFailed: count(tasks, (t: any) => t.status === 'Failed'),
      agentRuns: runs.length,
      aiNarrative: strategy.aiNarrative ?? null,
    },
    workCompleted: tasks.filter((t: any) => t.status === 'Completed').map((t) => ({ title: t.title, kind: t.kind })),
    problemsDiscovered: findings.map((f: any) => ({
      title: f.title, severity: f.severity, category: f.category, url: f.url,
      status: f.status, verification: f.verification?.status ?? 'not_verified',
    })),
    problemsFixed: findings.filter((f: any) => ['Executed', 'Verified'].includes(f.status)),
    pendingWork: tasks.filter((t: any) => !['Completed', 'Cancelled', 'Rejected'].includes(t.status)).map((t) => ({ title: t.title, status: t.status, priority: t.priority })),
    technicalSeo: findings.filter((f: any) => f.category === 'technical'),
    onPageSeo: findings.filter((f: any) => f.category === 'onpage'),
    content: findings.filter((f: any) => f.category === 'content'),
    localSeo: findings.filter((f: any) => f.category === 'local'),
    offPageSeo: findings.filter((f: any) => f.category === 'offpage'),
    competitorInsights: findings.filter((f: any) => f.ruleKey === 'competitor_content_gap'),
    performanceData: { note: 'No analytics integration connected — performance data unavailable; nothing fabricated.', available: false },
    nextPriorities: strategy.priorities ?? [],
    verificationStatus: {
      verified: count(findings, (f: any) => f.verification?.status === 'verified'),
      failed: count(findings, (f: any) => f.verification?.status === 'failed'),
      notVerified: count(findings, (f: any) => !f.verification || f.verification.status === 'not_verified'),
    },
    approvals: approvals.map((a: any) => ({ title: a.title, status: a.status, actionType: a.actionType })),
  };

  const verifiedPct = findings.length
    ? Math.round((sections.verificationStatus.verified / findings.length) * 100)
    : 100;

  const report = await Report.create({
    organization: ctx.orgId,
    project: projectId,
    title: `${ctx.project.name} — Discovery Report`,
    type: 'discovery',
    sections,
    summary: `Audit found ${findings.length} issue(s): ${sections.executiveSummary.critical} critical. ${sections.workCompleted.length} specialist work items completed. ${verifiedPct}% of findings QA-verified.`,
    generatedBy: { type: 'agent', id: ctx.agent._id, name: ctx.agent.name },
    period: { from: ctx.run.startedAt ?? new Date(), to: new Date() },
    verificationStatus: `${verifiedPct}% verified`,
    isDemo: ctx.project.isDemo ?? false,
  });
  await ctx.artifact('report', report.title, { reportId: String(report._id), summary: report.summary });
  return String(report._id);
}
