export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { handler, ok, toId } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { KnowledgeDocument } from '@/models';
import { parseBody, readJson, requireAuth } from '../_lib';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  await dbConnect();
  const u = new URL(req.url);
  const filter: Record<string, unknown> = { organization: session.orgId };
  if (u.searchParams.get('type')) filter.type = u.searchParams.get('type');
  const items = await KnowledgeDocument.find(filter).sort({ createdAt: -1 }).limit(100).lean<any>();
  return ok(toId({ items }));
});

const CreateSchema = z.object({
  title: z.string().min(2).max(160),
  type: z.enum(['sop', 'markdown', 'text', 'url', 'note', 'document']).default('note'),
  category: z.string().max(80).default('General'),
  content: z.string().max(50_000).default(''),
  url: z.string().max(500).optional(),
  tags: z.array(z.string().max(40)).max(10).default([]),
  forAgents: z.array(z.string().max(40)).max(15).default([]),
});

export const POST = handler(async (req: Request) => {
  const session = await requireAuth();
  const body = parseBody(CreateSchema, await readJson(req));
  await dbConnect();
  const doc = await KnowledgeDocument.create({ ...body, organization: session.orgId });
  return ok(toId(doc), 201);
});
