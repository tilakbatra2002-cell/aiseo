export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Client } from '@/models';
import { readJson, requireAuth } from '../../_lib';

type Params = { params: { id: string } };

export const GET = handler(async (_req: Request, { params }: Params) => {
  const session = await requireAuth();
  await dbConnect();
  const client = await Client.findOne({ _id: params.id, organization: session.orgId }).lean<any>();
  if (!client) throw new ApiError('Client not found', 404);
  return ok(toId(client));
});

export const PATCH = handler(async (req: Request, { params }: Params) => {
  const session = await requireAuth();
  const body = (await readJson(req)) as Record<string, unknown>;
  await dbConnect();
  const allowed = ['name', 'contactName', 'contactEmail', 'industry', 'notes', 'archived'];
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  const client = await Client.findOneAndUpdate({ _id: params.id, organization: session.orgId }, { $set: update }, { new: true }).lean<any>();
  if (!client) throw new ApiError('Client not found', 404);
  return ok(toId(client));
});
