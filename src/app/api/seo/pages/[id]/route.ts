export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { CrawlPage, CrawlLink, SEOIssue } from '@/models';
import { requireAuth } from '../../../_lib';
import { webamazeePageStrength } from '@/server/seo/intelligence';

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) => {
  const session = await requireAuth();
  const { id } = await ctx.params;
  const page = await CrawlPage.findOne({ _id: id, organization: session.orgId }).lean<any>();
  if (!page) throw new ApiError('Page not found', 404);
  const [inlinks, outlinks, issues] = await Promise.all([
    CrawlLink.find({ project: page.project, crawlId: page.crawlId, toUrl: page.finalUrl }).limit(200).lean<any>(),
    CrawlLink.find({ project: page.project, crawlId: page.crawlId, fromUrl: page.finalUrl }).limit(300).lean<any>(),
    SEOIssue.find({ project: page.project, url: page.finalUrl, status: 'open' }).lean<any>(),
  ]);
  const pageStrength = await webamazeePageStrength(session.orgId, String(page.project), page);
  return ok(toId({
    page, inlinks, outlinks, issues, pageStrength,
    collected: { method: 'Webamazee first-party crawler (HTTP fetch, robots-aware)', fetchedAt: page.fetchedAt },
    rawHtmlAvailable: Boolean(page.rawHtmlExcerpt),
    rawHtmlNote: 'Excerpt capped at 30KB at collection time.',
  }));
});
