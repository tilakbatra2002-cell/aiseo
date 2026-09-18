export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { CrawlPage } from '@/models';
import { requireAuth } from '../../_lib';
import { resolveProject } from '../_seo';
import { latestSelfCrawl } from '@/server/seo/intelligence';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const u = new URL(req.url);
  const crawlId = u.searchParams.get('crawlId');
  let pageCrawlId = crawlId;
  let domain = new URL(req.url).searchParams.get('domain');
  if (!pageCrawlId) {
    const crawl = await latestSelfCrawl(session.orgId, String(project._id));
    pageCrawlId = (crawl?.pageCrawlId as string) ?? null;
    domain = domain ?? (crawl?.domain as string | undefined) ?? null;
  }
  if (!pageCrawlId) return ok({ items: [], total: 0, note: 'No completed crawl yet — run Site Crawl from the Overview page.' });
  const filter: Record<string, unknown> = { organization: session.orgId, project: project._id, crawlId: pageCrawlId };
  const q = (u.searchParams.get('q') ?? '').trim();
  if (q) filter.$or = [{ url: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { title: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }];
  const codeClass = u.searchParams.get('codeClass');
  if (codeClass === '2xx') filter.status = { $gte: 200, $lt: 300 };
  if (codeClass === '4xx') filter.status = { $gte: 400, $lt: 500 };
  if (codeClass === '5xx') filter.status = { $gte: 500 };
  if (u.searchParams.get('noindex') === '1') filter.noindex = true;
  if (u.searchParams.get('thin') === '1') filter.wordCount = { $lt: 300, $gt: 0 };
  if (u.searchParams.get('missingTitle') === '1') filter.$or = [{ title: { $in: [null, ''] } }];
  if (u.searchParams.get('missingMeta') === '1') filter.$or = [{ metaDescription: { $in: [null, ''] } }];
  const limit = Math.min(Number(u.searchParams.get('limit') ?? 50), 200);
  const skip = Number(u.searchParams.get('skip') ?? 0);
  const [items, total] = await Promise.all([
    CrawlPage.find(filter).select('-rawHtmlExcerpt').sort({ depth: 1, fetchedAt: 1 }).skip(skip).limit(limit).lean<any>(),
    CrawlPage.countDocuments(filter),
  ]);
  return ok(toId({ items, total, crawlId: pageCrawlId, domain, source: 'Crawled by Webamazee' }));
});
