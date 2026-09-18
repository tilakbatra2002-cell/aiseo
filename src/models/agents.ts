import mongoose, { Schema, model, models } from 'mongoose';
import { AGENT_STATUSES, RUN_STATUSES, APPROVAL_POLICIES, SPECIALIST_KEYS } from '@/lib/enums';

const { ObjectId } = Schema.Types;

/* -------------------------------- Agent ------------------------------ */
const AgentSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true },
    avatar: { type: String, default: '' }, // initials-based hue key
    role: { type: String, required: true },
    specialistKey: { type: String, enum: [...SPECIALIST_KEYS, 'team_head'], required: true, index: true },
    description: String,
    department: { type: ObjectId, ref: 'Department', index: true },
    parent: { type: ObjectId, ref: 'Agent' },
    isTeamHead: { type: Boolean, default: false },
    systemInstructions: { type: String, default: '' },
    skills: [String],
    tools: [String], // tool keys from the Tool Engine
    permissions: {
      canCrawl: { type: Boolean, default: true },
      canCreateTasks: { type: Boolean, default: false },
      canExecuteInternal: { type: Boolean, default: true },
      canExecuteExternal: { type: Boolean, default: false },
      canPublish: { type: Boolean, default: false },
      approvalPolicy: { type: String, enum: APPROVAL_POLICIES, default: 'always_require' },
    },
    ai: {
      provider: { type: String, default: 'inherit' },
      model: { type: String, default: 'inherit' },
      temperature: { type: Number, default: 0.2 },
    },
    status: { type: String, enum: AGENT_STATUSES, default: 'Idle', index: true },
    knowledge: [{ type: ObjectId, ref: 'KnowledgeDocument' }],
    successCriteria: String,
    qaRequired: { type: Boolean, default: false },
    lastActiveAt: Date,
  },
  { timestamps: true },
);
AgentSchema.index({ organization: 1, specialistKey: 1 });

/* ------------------------------ AgentTool ---------------------------- */
const AgentToolSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: String,
    category: String,
    description: String,
    enabled: { type: Boolean, default: true },
    requiresIntegration: String, // provider key, if any
  },
  { timestamps: true },
);

/* ------------------------------- AgentRun ---------------------------- */
const AgentRunSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    agent: { type: ObjectId, ref: 'Agent', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', index: true },
    task: { type: ObjectId, ref: 'Task', index: true },
    input: Schema.Types.Mixed,
    tools: [String],
    toolCalls: [
      {
        tool: String,
        action: String,
        startedAt: Date,
        durationMs: Number,
        ok: Boolean,
        summary: String,
      },
    ],
    status: { type: String, enum: RUN_STATUSES, default: 'Queued', index: true },
    startedAt: Date,
    completedAt: Date,
    durationMs: Number,
    output: Schema.Types.Mixed,
    errors: [String],
    evidence: [Schema.Types.Mixed],
    artifacts: [{ type: ObjectId, ref: 'ExecutionArtifact' }],
    retryCount: { type: Number, default: 0 },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, suppressReservedKeysWarning: true },
);
AgentRunSchema.index({ organization: 1, createdAt: -1 });

export const Agent = models.Agent || model('Agent', AgentSchema);
export const AgentTool = models.AgentTool || model('AgentTool', AgentToolSchema);
export const AgentRun = models.AgentRun || model('AgentRun', AgentRunSchema);
void mongoose;
