import { CrawlPage, Integration, ProjectMemory } from '@/models';
import { crawlSite, fetchSinglePage, type CrawlResult } from '../crawler';
import { analyzeCrawl } from '../rules';
import type { RunCtx } from './run-context';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function storeCrawl(ctx: RunCtx, crawl: CrawlResult) {
  const docs = crawl.pages.map((p) => ({
    organization: ctx.orgId,
    project: ctx.project._id,
    crawlId: crawl.crawlId,
    url: p.url,
    finalUrl: p.finalUrl,
    status: p.status,
    ok: p.ok,
    redirected: p.redirected,
    redirectChain: p.redirectChain,
    depth: p.depth,
    ttfbMs: p.ttfbMs,
    contentType: p.contentType,
    error: p.error,
    ...(p.parsed ?? {}),
  }));
  await CrawlPage.deleteMany({ project: ctx.project._id });
  if (docs.length) await CrawlPage.insertMany(docs, { ordered: false }).catch(() => undefined);
  await ProjectMemory.findOneAndUpdate(
    { organization: ctx.orgId, project: ctx.project._id, key: 'latest_crawl' },
    { value: { crawlId: crawl.crawlId, pages: crawl.pages.length, completedAt: crawl.completedAt }, writtenBy: ctx.agent._id },
    { upsert: true },
  );
}

export async function latestCrawlId(projectId: string): Promise<string | null> {
  const page = await CrawlPage.findOne({ project: projectId }).sort({ fetchedAt: -1 }).select('crawlId').lean<any>();
  return page?.crawlId ?? null;
}

async function integrationFor(ctx: RunCtx, provider: string) {
  return Integration.findOne({ organization: ctx.orgId, provider, status: 'Connected' }).lean<any>();
}

/* ========================= SEO Audit Agent ========================= */
export async function runAudit(ctx: RunCtx) {
  await ctx.taskLog(`${ctx.agent.name} started full site audit`);
  const homepage = await ctx.tool('http_request', 'reachability check', async () => {
    const res = await fetch(ctx.project.website, { signal: AbortSignal.timeout(15_000), redirect: 'follow' });
    return { status: res.status, ok: res.ok, finalUrl: res.url };
  }, (r) => `HTTP ${r.status} at ${r.finalUrl}`);
  if (homepage.status === 0 || !homepage.ok) {
    if (homepage.status >= 400) {
      await ctx.fail(`Website returned HTTP ${homepage.status}. Discovery cannot continue.`);
    }
  }

  const crawl = await ctx.tool(
    'website_crawler', 'crawl site',
    async () => crawlSite(String(ctx.project.website), {
      maxPages: Number(ctx.task.input?.maxPages ?? 25),
      onPage: async (page, done) => {
        if (done % 5 === 0) await ctx.taskLog(`Crawled ${done} pages…`);
      },
    }),
    (c) => `Crawled ${c.pages.length} pages, ${c.errors.length} errors`,
  );

  await ctx.tool('database', 'store raw crawl', () => storeCrawl(ctx, crawl));
  await ctx.artifact('crawl_result', `Crawl ${crawl.crawlId}`, {
    crawlId: crawl.crawlId,
    pages: crawl.pages.length,
    errors: crawl.errors,
    robots: { exists: crawl.robots.exists, disallows: crawl.robots.disallows, sitemaps: crawl.robots.sitemapUrls, blocksAll: crawl.robots.blocksAll },
    sitemap: { exists: crawl.sitemap.exists, url: crawl.sitemap.url, urls: crawl.sitemap.urls.length, isIndex: crawl.sitemap.isIndex },
    pageSummaries: crawl.pages.map((p) => ({ url: p.finalUrl, status: p.status, title: p.parsed?.title, depth: p.depth })),
  }, `${crawl.pages.length} pages · sitemap ${crawl.sitemap.exists ? 'found' : 'missing'} · robots ${crawl.robots.exists ? 'found' : 'missing'}`);

  const findings = await ctx.tool('code_executor', 'run audit rules', async () => {
    return analyzeCrawl(crawl);
  }, (f) => `${f.length} issue signals detected`);
  const count = await ctx.addFindings(findings);

  const broken = crawl.pages.filter((p) => p.status >= 400).length;
  await ctx.output({
    crawlId: crawl.crawlId,
    pagesCrawled: crawl.pages.length,
    brokenPages: broken,
    findingsCreated: count,
    sitemap: crawl.sitemap.exists,
    robots: crawl.robots.exists,
  });
  await ctx.taskLog(`Audit complete — ${crawl.pages.length} pages crawled, ${count} findings recorded`);
}

/* ======================= Technical SEO Agent ======================= */
export async function runTechnicalAudit(ctx: RunCtx) {
  await ctx.taskLog(`${ctx.agent.name} started technical analysis`);
  const crawlId = await latestCrawlId(String(ctx.project._id));
  if (!crawlId) await ctx.fail('No crawl data found. Run the SEO Audit first.');
  const pages = await ctx.tool('database', 'load crawl pages', async () =>
    CrawlPage.find({ project: ctx.project._id, crawlId }).lean<any>(), (p) => `${p.length} pages loaded`);

  const indexable = pages.filter((p) => p.ok && !p.noindex && p.status === 200);
  const noindexed = pages.filter((p) => p.noindex);
  const errored = pages.filter((p) => p.status >= 400);

  // Verify each errored URL with a fresh request (real verification, not assumption)
  const verifiedBroken: { url: string; status: number }[] = [];
  for (const p of errored.slice(0, 10)) {
    const check = await ctx.tool('http_request', `verify ${p.url}`, async () => {
      const res = await fetch(p.url, { signal: AbortSignal.timeout(12_000), redirect: 'follow' }).catch(() => null);
      return { url: p.url, status: res ? res.status : 0 };
    }, (r) => `still HTTP ${r.status}`);
    if (check.status >= 400 || check.status === 0) verifiedBroken.push(check);
    await sleep(250);
  }

  await ctx.addFindings(verifiedBroken.map((b) => ({
    ruleKey: 'verified_broken_url', category: 'technical',
    title: `Confirmed broken URL (HTTP ${b.status})`,
    severity: (b.status >= 500 ? 'Critical' : 'High') as 'Critical' | 'High',
    url: b.url,
    evidence: { description: `Re-checked ${b.url} with a fresh request: HTTP ${b.status}.` },
    recommendedAction: 'Fix the page or 301-redirect to the nearest equivalent.',
    impact: 5, effort: 2, confidence: 5, risk: 1,
  })));

  await ctx.artifact('json', 'Indexability report', {
    total: pages.length,
    indexable: indexable.length,
    noindexed: noindexed.map((p) => p.finalUrl),
    errors: errored.map((p) => ({ url: p.finalUrl, status: p.status })),
    verifiedBroken,
  });

  await ctx.output({
    pagesAnalyzed: pages.length,
    indexable: indexable.length,
    noindexedCount: noindexed.length,
    errorCount: errored.length,
    verifiedBrokenCount: verifiedBroken.length,
  });
  await ctx.taskLog(`Technical audit done — ${pages.length} pages analyzed, ${verifiedBroken.length} broken URLs re-verified`);
}

/* ====================== Keyword Research Agent ===================== */
const STOPWORDS = new Set(('a,an,the,and,or,of,to,in,for,on,at,by,with,from,as,is,are,was,were,be,been,it,its,this,that,' +
  'we,you,your,our,us,not,all,can,will,just,about,into,over,after,before,between,more,most,other,some,such,no,nor,too,very,' +
  'home,welcome,contact,menu,skip,content,call,today,get,now,us|,|,and&').split(','));

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function classifyIntent(kw: string): string {
  if (/\b(buy|price|cost|cheap|book|order|quote|discount|deal)\b/.test(kw)) return 'Transactional';
  if (/\b(near me|nearby|in [a-z]+)\b/.test(kw)) return 'Local';
  if (/\b(best|top|review|vs|compare|affordable)\b/.test(kw)) return 'Commercial';
  if (/\b(how|what|why|when|guide|tips|learn)\b/.test(kw)) return 'Informational';
  return 'Informational';
}

export async function runKeywordResearch(ctx: RunCtx) {
  await ctx.taskLog(`${ctx.agent.name} started keyword research`);
  const crawlId = await latestCrawlId(String(ctx.project._id));
  const pages = crawlId
    ? await ctx.tool('database', 'load crawl pages', async () => CrawlPage.find({ project: ctx.project._id, crawlId }).lean<any>(), (p) => `${p.length} pages`)
    : [];

  const freq = new Map<string, number>();
  const urlByKeyword = new Map<string, Set<string>>();
  for (const p of pages) {
    const weighted: [string, number][] = [
      ...(p.title ? [tokens(p.title).map((t): [string, number] => [t, 3])] : [[]])[0] as [string, number][],
      ...(p.h1 ?? []).flatMap((h) => tokens(h).map((t): [string, number] => [t, 2])),
      ...((p.headings ?? []) as { text: string }[]).flatMap((h) => tokens(h.text).map((t): [string, number] => [t, 1])),
    ];
    const seenHere = new Set<string>();
    for (const [t, w] of weighted) {
      freq.set(t, (freq.get(t) ?? 0) + w);
      if (!seenHere.has(t)) {
        seenHere.add(t);
        const s = urlByKeyword.get(t) ?? new Set<string>();
        s.add(p.finalUrl);
        urlByKeyword.set(t, s);
      }
    }
    // bigrams from title + h1
    const phraseSource = `${p.title ?? ''} ${(p.h1 ?? []).join(' ')}`;
    const tk = tokens(phraseSource);
    for (let i = 0; i < tk.length - 1; i++) {
      const bg = `${tk[i]} ${tk[i + 1]}`;
      freq.set(bg, (freq.get(bg) ?? 0) + 4);
      const s = urlByKeyword.get(bg) ?? new Set<string>();
      s.add(p.finalUrl);
      urlByKeyword.set(bg, s);
    }
  }

  // seed keywords from project input get a boost
  for (const kw of ctx.project.targetKeywords ?? []) {
    const k = kw.toLowerCase().trim();
    if (k) freq.set(k, (freq.get(k) ?? 0) + 10);
    if (!urlByKeyword.has(k)) urlByKeyword.set(k, new Set());
  }

  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([keyword, score]) => {
      const urls = [...(urlByKeyword.get(keyword) ?? [])];
      return {
        keyword,
        score,
        intent: classifyIntent(keyword),
        cluster: keyword.split(' ')[0],
        mappedUrls: urls.slice(0, 8),
        source: urlByKeyword.get(keyword)?.size ? 'crawl' : 'project input',
      };
    });

  const cannibalized = keywords.filter((k) => k.mappedUrls.length > 2 && !k.keyword.includes(' '));
  const clusters = [...new Set(keywords.map((k) => k.cluster))].slice(0, 12).map((c) => ({
    cluster: c,
    keywords: keywords.filter((k) => k.cluster === c).slice(0, 10).map((k) => k.keyword),
  }));

  if (cannibalized.length) {
    await ctx.addFindings(cannibalized.map((c) => ({
      ruleKey: 'keyword_cannibalization', category: 'content',
      title: `Possible cannibalization: "${c.keyword}"`,
      severity: 'Medium' as const,
      url: ctx.project.website,
      evidence: { description: `"${c.keyword}" appears prominently on ${c.mappedUrls.length} different pages.`, data: { urls: c.mappedUrls } },
      recommendedAction: 'Consolidate or differentiate targeting so one page owns the term.',
      impact: 3, effort: 3, confidence: 3, risk: 1,
    })));
  }

  await ctx.artifact('json', 'Keyword map', { keywords: keywords.slice(0, 40), clusters });
  await ctx.output({
    keywordsDiscovered: keywords.length,
    clusters: clusters.length,
    cannibalizationSignals: cannibalized.length,
    note: 'Keyword metrics are derived from crawled on-page content. Search volume requires a keyword data provider integration.',
  });
  await ctx.taskLog(`Keyword research complete — ${keywords.length} keywords in ${clusters.length} clusters`);
}

/* ==================== Competitor Analysis Agent ==================== */
export async function runCompetitorAnalysis(ctx: RunCtx) {
  const competitors = ctx.project.competitors ?? [];
  if (!competitors.length) {
    await ctx.output({ skipped: true, reason: 'No competitors configured on the project.' });
    await ctx.taskLog('No competitors configured — skipping competitor analysis');
    return;
  }
  await ctx.taskLog(`${ctx.agent.name} analyzing ${competitors.length} competitor(s)`);

  const crawlId = await latestCrawlId(String(ctx.project._id));
  const ourPages = crawlId ? await CrawlPage.find({ project: ctx.project._id, crawlId }).lean<any>() : [];
  const ourHome = ourPages.find((p) => p.depth === 0) ?? ourPages[0];
  const ourTerms = new Set(tokens(`${ourHome?.title ?? ''} ${(ourHome?.h1 ?? []).join(' ')}`));

  const comparisons: any[] = [];
  for (const comp of competitors.slice(0, 5)) {
    const url = /^https?:\/\//.test(comp) ? comp : `https://${comp}`;
    const page = await ctx.tool('website_crawler', `crawl ${url}`, () => fetchSinglePage(url), (p) => `HTTP ${p.status}`);
    if (!page.ok || !page.parsed) {
      comparisons.push({ competitor: comp, reachable: false, status: page.status });
      continue;
    }
    const theirTerms = new Set(tokens(`${page.parsed.title} ${page.parsed.h1.join(' ')}`));
    const gapTerms = [...theirTerms].filter((t) => !ourTerms.has(t)).slice(0, 15);
    comparisons.push({
      competitor: comp,
      reachable: true,
      status: page.status,
      title: page.parsed.title,
      metaDescription: page.parsed.metaDescription.slice(0, 160),
      h1: page.parsed.h1.slice(0, 3),
      wordCountTtfb: { words: page.parsed.wordCount, ttfbMs: page.ttfbMs },
      structuredData: page.parsed.structuredDataTypes,
      contentGapTerms: gapTerms,
      ourWordCount: ourHome?.wordCount ?? null,
    });
    await sleep(400);
  }

  const gaps = comparisons.flatMap((c) => (c.reachable ? c.contentGapTerms ?? [] : []));
  if (gaps.length) {
    await ctx.addFindings([{
      ruleKey: 'competitor_content_gap', category: 'content',
      title: 'Competitor topics not covered on your site',
      severity: 'Informational',
      url: ctx.project.website,
      evidence: { description: `Terms prominent on competitor homepages but absent from yours: ${gaps.slice(0, 10).join(', ')}` },
      recommendedAction: 'Evaluate these topics for new content or improved homepage copy.',
      impact: 3, effort: 3, confidence: 3, risk: 1,
    }]);
  }

  await ctx.artifact('json', 'Competitor comparison', comparisons);
  await ctx.output({
    competitorsAnalyzed: comparisons.filter((c) => c.reachable).length,
    competitorsUnreachable: comparisons.filter((c) => !c.reachable).length,
    contentGapTerms: gaps.slice(0, 15),
    note: 'Traffic/backlink metrics require a data provider integration and were not estimated.',
  });
  await ctx.taskLog(`Competitor analysis complete — ${comparisons.filter((c) => c.reachable).length}/${comparisons.length} competitors analyzed`);
}
