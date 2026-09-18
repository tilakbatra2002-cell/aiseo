// Shared enums for Webamazee AgentOS — used by models, APIs and UI.
export const AGENT_STATUSES = ['Idle', 'Working', 'Waiting', 'Paused', 'Needs Approval', 'Error', 'Offline'] as const;
export const TASK_STATUSES = ['Queued', 'Assigned', 'Running', 'Waiting', 'Needs Approval', 'Completed', 'Failed', 'Rejected', 'Needs Rework', 'Cancelled'] as const;
export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Informational'] as const;
export const FINDING_STATUSES = ['Detected', 'Recommended', 'Approved', 'Executing', 'Executed', 'Verified', 'Failed', 'Dismissed'] as const;
export const PROJECT_STAGES = ['New', 'Discovery', 'Audit', 'Strategy', 'Execution', 'QA', 'Monitoring', 'Reporting'] as const;
export const APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected', 'Expired'] as const;
export const APPROVAL_POLICIES = ['always_require', 'auto_approve', 'never_allow'] as const;
export const INTEGRATION_STATES = ['Connected', 'Not Connected', 'Requires OAuth', 'Requires API Key', 'Unavailable'] as const;
export const RUN_STATUSES = ['Queued', 'Running', 'Completed', 'Failed', 'Cancelled'] as const;
export const JOB_STATUSES = ['queued', 'running', 'completed', 'failed', 'waiting_approval', 'cancelled'] as const;
export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type FindingStatus = (typeof FINDING_STATUSES)[number];
export type ProjectStage = (typeof PROJECT_STAGES)[number];
export type Role = (typeof ROLES)[number];

export const SPECIALIST_KEYS = [
  'seo_audit', 'technical_seo', 'keyword_research', 'competitor_analysis',
  'onpage_seo', 'content_seo', 'local_seo', 'gbp', 'offpage_seo',
  'internal_linking', 'analytics', 'qa',
] as const;
export type SpecialistKey = (typeof SPECIALIST_KEYS)[number];
