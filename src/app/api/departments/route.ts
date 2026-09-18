export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { handler, ok, toId } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Agent, Department } from '@/models';
import { parseBody, readJson, requireAuth } from '../_lib';

export const GET = handler(async () => {
  const session = await requireAuth();
  await dbConnect();
  const depts = await Department.find({ organization: session.orgId }).populate('teamHead', 'name status').lean<any>();
  const counts = await Agent.aggregate([{ $group: { _id: '$department', count: { $sum: 1 } } }]);
  const countMap = new Map(counts.map((c: { _id: unknown; count: number }) => [String(c._id), c.count]));
  return ok(toId({ items: depts.map((d) => ({ ...d, agentCount: countMap.get(String(d._id)) ?? 0 })) }));
});

const CreateSchema = z.object({ name: z.string().min(2).max(80), description: z.string().max(400).optional() });

export const POST = handler(async (req: Request) => {
  const session = await requireAuth();
  const body = parseBody(CreateSchema, await readJson(req));
  await dbConnect();
  const dept = await Department.create({ ...body, organization: session.orgId });
  return ok(toId(dept), 201);
});
