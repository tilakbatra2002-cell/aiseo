import { Agent, Department, Integration, KnowledgeDocument } from '@/models';
import { dbConnect } from '@/lib/db';
import { AGENTS, SOPS, INTEGRATIONS } from './seed';

/** Provision a full AI workforce for a brand-new organization. */
export async function provisionOrganization(orgId: string) {
  await dbConnect();

  const teamHeadSpec = AGENTS.find((a) => a.isTeamHead)!;
  const teamHead = await Agent.create({
    organization: orgId,
    name: teamHeadSpec.name,
    role: teamHeadSpec.role,
    specialistKey: teamHeadSpec.key,
    description: teamHeadSpec.description,
    isTeamHead: true,
    skills: teamHeadSpec.skills,
    tools: teamHeadSpec.tools,
    permissions: teamHeadSpec.permissions ?? {},
    systemInstructions: `You are ${teamHeadSpec.name}, ${teamHeadSpec.role} at Webamazee. ${teamHeadSpec.description}\nRules: never claim an action happened unless it verifiably did. Distinguish Detected > Recommended > Approved > Executed > Verified. Never fabricate metrics.`,
    avatar: teamHeadSpec.name.split(' ').map((p) => p[0]).join(''),
  });

  const dept = await Department.create({
    organization: orgId,
    name: 'SEO Department',
    description: 'AI-powered SEO delivery department',
    teamHead: teamHead._id,
  });
  await Agent.updateOne({ _id: teamHead._id }, { $set: { department: dept._id } });

  for (const spec of AGENTS.filter((a) => !a.isTeamHead)) {
    await Agent.create({
      organization: orgId,
      name: spec.name,
      role: spec.role,
      specialistKey: spec.key,
      description: spec.description,
      department: dept._id,
      parent: teamHead._id,
      isTeamHead: false,
      skills: spec.skills,
      tools: spec.tools,
      permissions: spec.permissions ?? {},
      systemInstructions: `You are ${spec.name}, ${spec.role} at Webamazee. ${spec.description}\nRules: never claim an action happened unless it verifiably did. Distinguish Detected > Recommended > Approved > Executed > Verified. Never fabricate metrics.`,
      successCriteria: 'Task completed with structured output, evidence and artifacts stored.',
      qaRequired: !!spec.qaRequired,
      avatar: spec.name.split(' ').map((p) => p[0]).join(''),
    });
  }

  await KnowledgeDocument.insertMany(
    SOPS.map((s) => ({ ...s, organization: orgId, type: 'sop' })),
  );
  await Integration.insertMany(
    INTEGRATIONS.map((i) => ({ ...i, organization: orgId })),
  );
}
