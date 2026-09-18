import mongoose, { Schema, model, models } from 'mongoose';
import { TASK_STATUSES, FINDING_STATUSES, SEVERITIES, APPROVAL_STATUSES, JOB_STATUSES, RUN_STATUSES } from '@/lib/enums';

const { ObjectId } = Schema.Types;

/* -------------------------------- Task ------------------------------- */
const TaskSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    parentTask: { type: ObjectId, ref: 'Task' },
    kind: { type: String, required: true, index: true }, // audit, technical_fix, keyword_research, qa_verify, ...
    title: { type: String, required: true },
    objective: String,
    instructions: String,
    assignedAgent: { type: ObjectId, ref: 'Agent', index: true },
    createdBy: Schema.Types.Mixed, // { type: 'user'|'agent'|'system', id, name }
    priority: { type: String, enum: ['Critical', 'High', 'Medium', 'Low'], default: 'Medium', index: true },
    priorityScore: { type: Number, default: 0 },
    status: { type: String, enum: TASK_STATUSES, default: 'Queued', index: true },
    dependencies: [{ type: ObjectId, ref: 'Task' }],
    input: Schema.Types.Mixed,
    expectedOutput: String,
    allowedTools: [String],
    requiresApproval: { type: Boolean, default: false },
    approval: { type: ObjectId, ref: 'Approval' },
    deadline: Date,
    logs: [{ at: { type: Date, default: Date.now }, message: String }],
    result: Schema.Types.Mixed,
    evidence: [Schema.Types.Mixed],
    qaStatus: { type: String, enum: ['not_required', 'pending', 'passed', 'failed', 'rework'], default: 'not_required' },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 2 },
    runAfter: { type: Date, default: () => new Date() },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
TaskSchema.index({ organization: 1, status: 1, runAfter: 1 });

/* ---------------------------- TaskDependency ------------------------- */
const TaskDependencySchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    task: { type: ObjectId, ref: 'Task', required: true, index: true },
    dependsOn: { type: ObjectId, ref: 'Task', required: true },
  },
  { timestamps: true },
);

/* ------------------------------- Workflow ---------------------------- */
const WorkflowSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', index: true }, // null = built-in template
    key: { type: String, required: true },
    name: String,
    description: String,
    isTemplate: { type: Boolean, default: false },
    steps: [
      {
        key: String,
        name: String,
        kind: String, // task kind
        specialistKey: String,
        parallel: { type: Boolean, default: false },
        dependsOn: [String],
        condition: String, // e.g. "project.competitors.length>0"
        approvalCheckpoint: { type: Boolean, default: false },
        timeoutMs: Number,
        retries: Number,
        fallbackSpecialist: String,
      },
    ],
  },
  { timestamps: true },
);
WorkflowSchema.index({ key: 1 });

/* ------------------------------ WorkflowRun -------------------------- */
const WorkflowRunSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    workflow: { type: ObjectId, ref: 'Workflow', required: true },
    workflowKey: String,
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    status: { type: String, enum: ['running', 'waiting_approval', 'completed', 'failed', 'cancelled'], default: 'running' },
    currentStep: String,
    steps: [
      {
        key: String,
        name: String,
        status: String,
        task: { type: ObjectId, ref: 'Task' },
        startedAt: Date,
        completedAt: Date,
        note: String,
      },
    ],
    startedAt: { type: Date, default: () => new Date() },
    completedAt: Date,
  },
  { timestamps: true },
);

/* -------------------------------- Finding ---------------------------- */
const FindingSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    category: { type: String, required: true, index: true }, // technical, onpage, content, local, offpage, links, performance
    ruleKey: String,
    title: { type: String, required: true },
    severity: { type: String, enum: SEVERITIES, default: 'Medium', index: true },
    url: String,
    evidence: Schema.Types.Mixed, // { description, data } — never fabricated
    detectedBy: { type: ObjectId, ref: 'Agent' },
    detectedAt: { type: Date, default: () => new Date() },
    recommendedAction: String,
    actualAction: String,
    assignedTask: { type: ObjectId, ref: 'Task' },
    status: { type: String, enum: FINDING_STATUSES, default: 'Detected', index: true },
    verification: {
      status: { type: String, enum: ['not_verified', 'verified', 'failed'], default: 'not_verified' },
      verifiedAt: Date,
      verifiedBy: { type: ObjectId, ref: 'Agent' },
      note: String,
    },
    impact: { type: Number, default: 3 }, // 1-5 internal priority inputs
    effort: { type: Number, default: 3 },
    confidence: { type: Number, default: 3 },
    risk: { type: Number, default: 1 },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
FindingSchema.index({ organization: 1, project: 1, ruleKey: 1, url: 1 });
FindingSchema.index({ organization: 1, severity: 1, status: 1 });

/* ------------------------------- Approval ---------------------------- */
const ApprovalSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', index: true },
    task: { type: ObjectId, ref: 'Task' },
    workflowRun: { type: ObjectId, ref: 'WorkflowRun' },
    requestedBy: Schema.Types.Mixed,
    actionType: { type: String, required: true }, // publish_cms_change, robots_change, gbp_post, strategy_plan, ...
    title: { type: String, required: true },
    description: String,
    risk: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    payload: Schema.Types.Mixed, // proposed change details
    status: { type: String, enum: APPROVAL_STATUSES, default: 'Pending', index: true },
    decidedBy: Schema.Types.Mixed,
    decisionNote: String,
    decidedAt: Date,
  },
  { timestamps: true },
);
ApprovalSchema.index({ organization: 1, status: 1, createdAt: -1 });

/* -------------------------------- Report ----------------------------- */
const ReportSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    title: String,
    type: { type: String, enum: ['discovery', 'strategy', 'execution', 'monthly', 'seo_intelligence'], default: 'discovery' },
    sections: Schema.Types.Mixed,
    summary: String,
    generatedBy: Schema.Types.Mixed,
    period: { from: Date, to: Date },
    verificationStatus: String,
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

/* -------------------------- ExecutionArtifact ------------------------ */
const ExecutionArtifactSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', index: true },
    task: { type: ObjectId, ref: 'Task', index: true },
    agentRun: { type: ObjectId, ref: 'AgentRun', index: true },
    type: { type: String, required: true }, // crawl_result, html_snapshot, report, csv, json, content_draft, cms_change, api_response, log
    name: String,
    content: Schema.Types.Mixed, // small payloads inline
    contentPreview: String,
    size: Number,
  },
  { timestamps: true },
);

/* --------------------------------- Job ------------------------------- */
// Internal queue. On Vercel, jobs are created by API routes and claimed by the
// worker entrypoint (api/jobs/process) or a persistent worker process.
const JobSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    type: { type: String, required: true, index: true }, // run_task, execute_workflow_step, qa_verify, generate_report
    payload: Schema.Types.Mixed,
    status: { type: String, enum: JOB_STATUSES, default: 'queued', index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    runAfter: { type: Date, default: () => new Date(), index: true },
    lockedAt: Date,
    lastError: String,
    dedupeKey: { type: String, index: true },
  },
  { timestamps: true },
);
JobSchema.index({ status: 1, runAfter: 1 });

/* ------------------------------- CrawlPage --------------------------- */
// Raw crawl data — stored separately from AI-generated findings.
const CrawlPageSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    crawlId: { type: String, required: true, index: true },
    url: { type: String, required: true },
    finalUrl: String,
    status: Number,
    ok: Boolean,
    redirected: Boolean,
    redirectChain: [String],
    depth: Number,
    ttfbMs: Number,
    contentType: String,
    title: String,
    titleLength: Number,
    metaDescription: String,
    metaDescriptionLength: Number,
    canonical: String,
    robotsMeta: String,
    noindex: Boolean,
    h1: [String],
    headings: [{ level: String, text: String }],
    wordCount: Number,
    imagesTotal: Number,
    imagesMissingAlt: Number,
    internalLinks: [String],
    externalLinks: [String],
    structuredDataTypes: [String],
    hreflang: [{ lang: String, href: String }],
    og: Schema.Types.Mixed,
    error: String,
    fetchedAt: { type: Date, default: () => new Date() },
    // ---- Webamazee SEO Intelligence (additive; unset for old audit crawls) ----
    contentHash: String,        // sha1 of normalized html — powers change detection & dedupe
    etag: String,               // for conditional re-fetch (incremental crawls)
    lastModified: String,
    pageSizeBytes: Number,
    rawHtmlExcerpt: String,     // capped at 30_000 chars — page-level raw evidence
    inlinkCount: Number,
    outlinkCount: Number,
    indexable: Boolean,         // computed: ok && status 200 && !noindex
    dataSource: String,         // 'webamazee_crawler' when produced by the SEO engine
  },
  { timestamps: false },
);
CrawlPageSchema.index({ project: 1, crawlId: 1, url: 1 }, { unique: true });

export const Task = models.Task || model('Task', TaskSchema);
export const TaskDependency = models.TaskDependency || model('TaskDependency', TaskDependencySchema);
export const Workflow = models.Workflow || model('Workflow', WorkflowSchema);
export const WorkflowRun = models.WorkflowRun || model('WorkflowRun', WorkflowRunSchema);
export const Finding = models.Finding || model('Finding', FindingSchema);
export const Approval = models.Approval || model('Approval', ApprovalSchema);
export const Report = models.Report || model('Report', ReportSchema);
export const ExecutionArtifact = models.ExecutionArtifact || model('ExecutionArtifact', ExecutionArtifactSchema);
export const Job = models.Job || model('Job', JobSchema);
export const CrawlPage = models.CrawlPage || model('CrawlPage', CrawlPageSchema);
void mongoose;
