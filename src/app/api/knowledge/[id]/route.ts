export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { KnowledgeDocument } from '@/models';
import { readJson, requireAuth } from '../../_lib';

type Params = { params: { id: string } };

export const PATCH = handler(async (req: Request, { params }: Params) => {
  const session = await requireAuth();
  const body = (await readJson(req)) as Record<string, unknown>;
  await dbConnect();
  const allowed = ['title', 'type', 'category', 'content', 'url', 'tags', 'forAgents'];
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  const doc = await KnowledgeDocument.findOneAndUpdate({ _id: params.id, organization: session.orgId }, { $set: update }, { new: true }).lean<any>();
  if (!doc) throw new ApiError('Document not found', 404);
  return ok(toId(doc));
});

export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const session = await requireAuth();
  await dbConnect();
  await KnowledgeDocument.deleteOne({ _id: params.id, organization: session.orgId });
  return ok({ deleted: true });
});
