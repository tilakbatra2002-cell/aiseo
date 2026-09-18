export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { Keyword, KeywordObservation, RankingObservation } from '@/models';
import { requireAuth } from '../../../_lib';

export const PATCH = handler(async (req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) => {
  const session = await requireAuth();
  const { id } = await ctx.params;
  const kw = await Keyword.findOne({ _id: id, organization: session.orgId });
  if (!kw) throw new ApiError('Keyword not found', 404);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.targetUrl !== undefined) kw.targetUrl = String(body.targetUrl) || undefined;
  if (body.country !== undefined) kw.country = String(body.country);
  if (body.device !== undefined && ['desktop', 'mobile', 'tablet'].includes(String(body.device))) kw.device = String(body.device) as 'desktop' | 'mobile' | 'tablet';
  if (body.intent !== undefined) kw.intent = String(body.intent);
  if (body.cluster !== undefined) kw.cluster = String(body.cluster);
  if (body.status !== undefined && ['active', 'paused', 'archived'].includes(String(body.status))) kw.status = String(body.status) as 'active';
  await kw.save();
  return ok(toId(kw));
});

export const DELETE = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) => {
  const session = await requireAuth();
  const { id } = await ctx.params;
  const kw = await Keyword.findOne({ _id: id, organization: session.orgId });
  if (!kw) throw new ApiError('Keyword not found', 404);
  await KeywordObservation.deleteMany({ keyword: kw._id });
  await RankingObservation.deleteMany({ keyword: kw._id });
  await kw.deleteOne();
  return ok({ deleted: true });
});
