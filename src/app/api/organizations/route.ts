export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Organization } from '@/models';
import { readJson, requireAuth } from '../_lib';

export const GET = handler(async () => {
  const session = await requireAuth();
  await dbConnect();
  const org = await Organization.findById(session.orgId).lean<any>();
  return ok(toId(org));
});

export const PATCH = handler(async (req: Request) => {
  const session = await requireAuth();
  if (session.role !== 'owner') throw new ApiError('Only the owner can change organization settings', 403);
  const body = (await readJson(req)) as { name?: string; settings?: Record<string, unknown> };
  await dbConnect();
  const update: Record<string, unknown> = {};
  if (body.name) update.name = body.name;
  if (body.settings) {
    for (const [k, v] of Object.entries(body.settings)) update[`settings.${k}`] = v;
  }
  const org = await Organization.findByIdAndUpdate(session.orgId, { $set: update }, { new: true }).lean<any>();
  return ok(toId(org));
});
