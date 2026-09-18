export const dynamic = 'force-dynamic';

import { handler, ok, ApiError } from '@/lib/http';
import { Competitor, Crawl } from '@/models';
import { requireAuth } from '../../../_lib';

export const DELETE = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) => {
  const session = await requireAuth();
  const { id } = await ctx.params;
  const comp = await Competitor.findOne({ _id: id, organization: session.orgId });
  if (!comp) throw new ApiError('Competitor not found', 404);
  await comp.deleteOne();
  return ok({ deleted: true });
});

export const PATCH = handler(async (req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) => {
  const session = await requireAuth();
  const { id } = await ctx.params;
  const comp = await Competitor.findOne({ _id: id, organization: session.orgId });
  if (!comp) throw new ApiError('Competitor not found', 404);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.name !== undefined) comp.name = String(body.name);
  if (body.notes !== undefined) comp.notes = String(body.notes);
  await comp.save();
  return ok({ saved: true });
});

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) => {
  const session = await requireAuth();
  const { id } = await ctx.params;
  const comp = await Competitor.findOne({ _id: id, organization: session.orgId }).lean<any>();
  if (!comp) throw new ApiError('Competitor not found', 404);
  const crawls = await Crawl.find({ competitor: comp._id }).sort({ startedAt: -1 }).limit(10).lean<any>();
  return ok({ comp, crawls });
});
