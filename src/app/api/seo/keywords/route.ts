export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { Keyword, RankingObservation, KeywordObservation } from '@/models';
import { requireAuth } from '../../_lib';
import { resolveProject } from '../_seo';
import { firstPartyKeywordCoverage } from '@/server/seo/intelligence';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const items = await Keyword.find({ organization: session.orgId, project: project._id }).sort({ createdAt: -1 }).limit(300).lean<any>();
  const ids = items.map((k) => k._id);
  const [latestRanks, histories] = await Promise.all([
    RankingObservation.aggregate([
      { $match: { project: project._id, keyword: { $in: ids } } },
      { $sort: { date: -1 } },
      { $group: { _id: '$keyword', position: { $first: '$position' }, date: { $first: '$date' }, sourceLabel: { $first: '$sourceLabel' } } },
    ]),
    RankingObservation.aggregate([
      { $match: { project: project._id, keyword: { $in: ids } } },
      { $sort: { date: 1 } },
      { $group: { _id: '$keyword', points: { $push: { date: '$date', position: '$position' } } } },
    ]),
  ]);
  const rankMap = new Map(latestRanks.map((r: { _id: { toString(): string }; position: number; date: string; sourceLabel: string }) => [r._id.toString(), r]));
  const histMap = new Map(histories.map((r: { _id: { toString(): string }; points: { date: string; position: number }[] }) => [r._id.toString(), r.points]));
  const coverage = await firstPartyKeywordCoverage(session.orgId, String(project._id), items);
  return ok(toId({
    items: items.map((k) => ({
      ...k,
      latestRank: rankMap.get(k._id.toString()) ?? null,
      history: histMap.get(k._id.toString()) ?? [],
      lastObservedAt: (rankMap.get(k._id.toString()) as { date?: string } | undefined)?.date ?? null,
      firstParty: coverage[k._id.toString()] ?? null,
    })),
    note: 'Positions shown only from connected Google Search Console data, labelled "Google Search Console Average Position". Search volume / CPC / difficulty are unavailable without proprietary data providers and are not estimated.',
  }));
});

export const POST = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const term = String(body.term ?? '').trim();
  if (!term) throw new ApiError('term is required', 422);
  const exists = await Keyword.findOne({ organization: session.orgId, project: project._id, termLower: term.toLowerCase() });
  if (exists) throw new ApiError(`Keyword already tracked for this project (id ${exists._id})`, 409);
  const kw = await Keyword.create({
    organization: session.orgId,
    project: project._id,
    term,
    termLower: term.toLowerCase(),
    targetUrl: String(body.targetUrl ?? '') || undefined,
    country: String(body.country ?? 'us'),
    device: ['desktop', 'mobile', 'tablet'].includes(String(body.device)) ? String(body.device) : 'desktop',
    source: body.source === 'import' ? 'import' : 'manual',
  });
  return ok(toId(kw), 201);
});
