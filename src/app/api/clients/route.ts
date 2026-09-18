export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { handler, ok, toId } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Client, Project } from '@/models';
import { listQuery, parseBody, readJson, requireAuth } from '../_lib';
import { logActivity } from '@/server/activity';

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  industry: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
});

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const { limit, skip, searchParams } = listQuery(req.url);
  await dbConnect();
  const filter: Record<string, unknown> = { organization: session.orgId, archived: { $ne: true } };
  if (searchParams.get('q')) filter.name = { $regex: searchParams.get('q'), $options: 'i' };
  const [items, total] = await Promise.all([
    Client.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean<any>(),
    Client.countDocuments(filter),
  ]);
  const ids = items.map((c) => c._id);
  const counts = await Project.aggregate([
    { $match: { client: { $in: ids } } },
    { $group: { _id: '$client', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c: { _id: unknown; count: number }) => [String(c._id), c.count]));
  return ok({ items: toId(items.map((c) => ({ ...c, projectCount: countMap.get(String(c._id)) ?? 0 }))), total });
});

export const POST = handler(async (req: Request) => {
  const session = await requireAuth();
  const body = parseBody(CreateSchema, await readJson(req));
  await dbConnect();
  const client = await Client.create({ ...body, organization: session.orgId });
  await logActivity({ orgId: session.orgId, actor: { type: 'user', id: session.userId, name: session.name }, action: `Owner created client ${client.name}` });
  return ok(toId(client), 201);
});
