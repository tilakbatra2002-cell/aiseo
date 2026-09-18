import mongoose, { Schema, model, models } from 'mongoose';
import { PROJECT_STAGES, ROLES, INTEGRATION_STATES } from '@/lib/enums';

const { ObjectId } = Schema.Types;

/* ------------------------------- User -------------------------------- */
const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    organization: { type: ObjectId, ref: 'Organization', index: true },
    role: { type: String, enum: ROLES, default: 'owner' },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

/* ---------------------------- Organization --------------------------- */
const OrganizationSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true, index: true },
    plan: { type: String, default: 'agency' },
    settings: {
      aiEnabled: { type: Boolean, default: false },
      defaultApprovalPolicy: { type: String, enum: ['always_require', 'auto_approve', 'never_allow'], default: 'always_require' },
      autonomousExecution: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

/* ----------------------------- Department ---------------------------- */
const DepartmentSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true },
    description: String,
    teamHead: { type: ObjectId, ref: 'Agent' },
  },
  { timestamps: true },
);
DepartmentSchema.index({ organization: 1, name: 1 }, { unique: true });

/* -------------------------------- Client ----------------------------- */
const ClientSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true },
    contactName: String,
    contactEmail: String,
    industry: String,
    notes: String,
    isDemo: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);
ClientSchema.index({ organization: 1, name: 1 });

/* -------------------------------- Project ---------------------------- */
const ProjectSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    client: { type: ObjectId, ref: 'Client', required: true, index: true },
    name: { type: String, required: true },
    website: { type: String, required: true },
    industry: String,
    country: String,
    targetLocations: [String],
    businessGoals: [String],
    competitors: [String],
    targetKeywords: [String],
    teamHead: { type: ObjectId, ref: 'Agent' },
    specialists: [{ type: ObjectId, ref: 'Agent' }],
    stage: { type: String, enum: PROJECT_STAGES, default: 'New', index: true },
    isDemo: { type: Boolean, default: false },
    onboarding: { type: Schema.Types.Mixed, default: {} },
    strategy: { type: Schema.Types.Mixed },
    lastActivityAt: Date,
  },
  { timestamps: true },
);
ProjectSchema.index({ organization: 1, stage: 1 });

/* ------------------------------ Integration -------------------------- */
const IntegrationSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    provider: { type: String, required: true }, // google_search_console, wordpress, ...
    label: String,
    status: { type: String, enum: INTEGRATION_STATES, default: 'Not Connected' },
    project: { type: ObjectId, ref: 'Project' },
    // Credentials are encrypted at rest; never returned to the client.
    credentialsEnc: String,
    meta: Schema.Types.Mixed,
    connectedAt: Date,
  },
  { timestamps: true },
);
IntegrationSchema.index({ organization: 1, provider: 1 });

/* --------------------------- KnowledgeDocument ----------------------- */
const KnowledgeDocumentSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['sop', 'markdown', 'text', 'url', 'note', 'document'], default: 'markdown' },
    category: { type: String, default: 'General' },
    content: { type: String, default: '' },
    url: String,
    tags: [String],
    forAgents: [String], // specialist keys that retrieve this doc
  },
  { timestamps: true },
);
KnowledgeDocumentSchema.index({ title: 'text', content: 'text', category: 'text' });

/* ------------------------------ AgentMemory -------------------------- */
const AgentMemorySchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    agent: { type: ObjectId, ref: 'Agent', required: true, index: true },
    scope: { type: String, enum: ['fact', 'preference', 'lesson'], default: 'fact' },
    content: String,
    sourceTask: { type: ObjectId, ref: 'Task' },
  },
  { timestamps: true },
);

/* ----------------------------- ProjectMemory ------------------------- */
const ProjectMemorySchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    key: String,
    value: Schema.Types.Mixed,
    writtenBy: { type: ObjectId, ref: 'Agent' },
  },
  { timestamps: true },
);

/* ------------------------------ ActivityLog -------------------------- */
const ActivityLogSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    actorType: { type: String, enum: ['user', 'agent', 'system'], required: true },
    actor: Schema.Types.Mixed, // { id, name }
    action: { type: String, required: true, index: true },
    project: { type: ObjectId, ref: 'Project', index: true },
    task: { type: ObjectId, ref: 'Task' },
    agent: { type: ObjectId, ref: 'Agent' },
    metadata: Schema.Types.Mixed,
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ActivityLogSchema.index({ organization: 1, createdAt: -1 });

export const User = models.User || model('User', UserSchema);
export const Organization = models.Organization || model('Organization', OrganizationSchema);
export const Department = models.Department || model('Department', DepartmentSchema);
export const Client = models.Client || model('Client', ClientSchema);
export const Project = models.Project || model('Project', ProjectSchema);
export const Integration = models.Integration || model('Integration', IntegrationSchema);
export const KnowledgeDocument = models.KnowledgeDocument || model('KnowledgeDocument', KnowledgeDocumentSchema);
export const AgentMemory = models.AgentMemory || model('AgentMemory', AgentMemorySchema);
export const ProjectMemory = models.ProjectMemory || model('ProjectMemory', ProjectMemorySchema);
export const ActivityLog = models.ActivityLog || model('ActivityLog', ActivityLogSchema);
void mongoose;
