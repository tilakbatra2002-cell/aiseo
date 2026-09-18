export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { handler, ok, toId, ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Agent, Client, Project } from '@/models';
import { listQuery, parseBody, readJson, requireAuth } from '../_lib';
import { logActivity } from '@/server/activity';

const CreateSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1).max(160),
  website: z.string().min(4).max(300),
  industry: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  targetLocations: z.array(z.string().max(120)).max(20).default([]),
  businessGoals: z.array(z.string().max(200)).max(20).default([]),
  competitors: z.array(z.string().max(300)).max(10).default([]),
  targetKeywords: z.array(z.string().max(120)).max(50).default([]),
  startDiscovery: z.boolean().optional(),
});

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const { limit, skip, searchParams } = listQuery(req.url);
  await dbConnect();
  const filter: Record<string, unknown> = { organization: session.orgId };
  if (searchParams.get('client')) filter.client = searchParams.get('client');
  if (searchParams.get('stage')) filter.stage = searchParams.get('stage');
  const [items, total] = await Promise.all([
    Project.find(filter).populate('client', 'name').populate('teamHead', 'name status').sort({ createdAt: -1 }).skip(skip).limit(limit).lean<any>(),
    Project.countDocuments(filter),
  ]);
  return ok({ items: toId(items), total });
});

export const POST = handler(async (req: Request) => {
  const session = await requireAuth();
  const body = parseBody(CreateSchema, await readJson(req));
  await dbConnect();

  const client = await Client.findOne({ _id: body.clientId, organization: session.orgId });
  if (!client) throw new ApiError('Client not found', 404);
  try {
    new URL(/^https?:\/\//.test(body.website) ? body.website : `https://${body.website}`);
  } catch {
    throw new ApiError('Website must be a valid URL or domain', 422);
  }

  const teamHead = await Agent.findOne({ organization: session.orgId, isTeamHead: true });
  if (!teamHead) throw new ApiError('No Team Head configured. Seed the workspace first.', 400);
  const specialists = await Agent.find({ organization: session.orgId, isTeamHead: { $ne: true } }).select('_id');

  const project = await Project.create({
    organization: session.orgId,
    client: client._id,
    name: body.name,
    website: body.website,
    industry: body.industry,
    country: body.country,
    targetLocations: body.targetLocations,
    businessGoals: body.businessGoals,
    competitors: body.competitors,
    targetKeywords: body.targetKeywords,
    teamHead: teamHead._id,
    specialists: specialists.map((s) => s._id),
    stage: 'New',
    onboarding: { ...body, startDiscovery: !!body.startDiscovery },
  });

  await logActivity({
    orgId: session.orgId, actor: { type: 'user', id: session.userId, name: session.name },
    action: `Owner created project ${project.name}`, projectId: String(project._id),
  });

  if (body.startDiscovery) {
    const { startDiscovery } = await import('@/server/engine/workflow');
    await startDiscovery(session.orgId, String(project._id), { type: 'user', id: session.userId, name: session.name });
  }
  return ok(toId(project), 201);
});
