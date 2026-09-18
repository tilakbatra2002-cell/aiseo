/**
 * Webamazee SEO Intelligence — crawl engine runner.
 * Own crawler, own data. Incremental via conditional re-fetch (304 ⇒ reuse stored parse).
 * Persists: Crawl + CrawlPage (shared collection used by AI agents) + CrawlLink edges
 * + SEOIssue (+ bridge to agent Findings) + SEOChange + SEOSnapshot + discovered Backlinks.
 */
import * as cheerio from 'cheerio';
import { Types } from 'mongoose';
import { Crawl, CrawlLink, CrawlPage, SEOIssue, SEOChange, SEOSnapshot, Finding, Backlink, Project, Competitor } from '@/models';
import { crawlSite, type CrawledPage } from '../crawler';
import { sha1, detectIssues, computeScore, type PageFacts } from './issues';

const normUrl = (u: string) => {
  try {
    const x = new URL(u);
    x.hash = '';
    let s = x.toString();
    if (s.endsWith('/') && x.pathname !== '/') s = s.slice(0, -1);
    return s;
  } catch { return u; }
};

type Edge = { fromUrl: string; toUrl: string; anchor: string; rel: string[]; internal: boolean };

function extractEdges(html: string, pageUrl: string, host: string): Edge[] {
  const $ = cheerio.load(html);
  const edges: Edge[] = [];
  const seen = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:|data:)/i.test(href)) return;
    try {
      const abs = new URL(href, pageUrl);
      abs.hash = '';
      if (!/^https?:$/.test(abs.protocol)) return;
      const to = abs.toString();
      const key = to;
      const anchor = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 200);
      const rel = ($(el).attr('rel') || '').toLowerCase().split(/\s+/).filter(Boolean);
      const internal = abs.host === host;
      if (seen.has(key + anchor)) return;
      seen.add(key + anchor);
      edges.push({ fromUrl: pageUrl, toUrl: to, anchor, rel, internal });
    } catch { /* bad link */ }
  });
  return edges.slice(0, 500);
}

const followTypeOf = (rel: string[]): 'follow' | 'nofollow' | 'ugc' | 'sponsored' =>
  rel.includes('nofollow') ? 'nofollow' : rel.includes('ugc') ? 'ugc' : rel.includes('sponsored') ? 'sponsored' : 'follow';

export async function runSeoCrawl(crawlId: string): Promise<{ ok: boolean; error?: string }> {
  const crawl = await Crawl.findById(crawlId);
  if (!crawl) return { ok: false, error: 'Crawl not found' };
  const project = await Project.findById(crawl.project).lean<{ website: string; isDemo?: boolean; organization: Types.ObjectId }>();
  if (!project) return { ok: false, error: 'Project not found' };

  const orgId = String(crawl.organization);
  const projectId = String(crawl.project);
  const domain = String(crawl.domain);
  const startedAt = new Date();
  await Crawl.updateOne({ _id: crawl._id }, { $set: { status: 'running', startedAt } });

  // ---- previous state (incremental) ----
  const prevCrawl = await Crawl.findOne({
    project: crawl.project, domain, type: crawl.type, status: 'completed',
    startedAt: { $lt: startedAt }, _id: { $ne: crawl._id },
  }).sort({ startedAt: -1 }).lean<{ pageCrawlId?: string; robots?: { hash?: string }; sitemap?: { hash?: string } }>();
  const prevPageCrawlId = prevCrawl?.pageCrawlId ?? null;
  const prevPages = prevPageCrawlId
    ? await CrawlPage.find({ project: crawl.project, crawlId: prevPageCrawlId }).lean<Record<string, unknown>[]>()
    : [];
  const prevByUrl = new Map(prevPages.map((p) => [normUrl(String(p.finalUrl ?? p.url)), p]));
  // Seed targets from the previous crawl's internal links as well as its pages:
  // a page whose only linker returns 304 would otherwise leave the frontier forever.
  const prevEdgeTargets = prevPageCrawlId
    ? await CrawlLink.distinct('toUrl', { project: crawl.project, crawlId: prevPageCrawlId, internal: true })
    : [];
  const conditional = new Map<string, { etag?: string | null; lastModified?: string | null }>();
  for (const p of prevPages) {
    if (p.etag || p.lastModified) {
      const v = { etag: p.etag as string | null, lastModified: p.lastModified as string | null };
      // Key by request URL as well as final URL: the frontier requests e.g. /menu
      // while the stored page is its redirect target /menu/.
      if (p.url) conditional.set(String(p.url), v);
      if (p.finalUrl) conditional.set(String(p.finalUrl), v);
    }
  }

  const newCrawlId = `seo_${crawl._id.toString().slice(-8)}_${Date.now().toString(36)}`;
  const edges: Edge[] = [];
  const notModifiedUrls = new Set<string>();
  let notModified = 0;

  try {
    await CrawlPage.deleteMany({ project: crawl.project, crawlId: newCrawlId });
    await CrawlLink.deleteMany({ project: crawl.project, crawlId: newCrawlId });

    const host = new URL(/^https?:\/\//i.test(String(crawl.domain)) ? String(crawl.domain) : `https://${crawl.domain}`).host;

    const result = await crawlSite(String(crawl.domain), {
      maxPages: crawl.settings?.maxPages,
      concurrency: crawl.settings?.concurrency,
      delayMs: crawl.settings?.delayMs,
      conditional,
      // Incremental safety: re-request everything we knew before (pages + the targets
      // of the links we recorded), so pages reachable only via links stay in the
      // frontier even when every linking page 304s.
      seedUrls: [...new Set([
        ...prevPages.map((p) => String(p.url ?? p.finalUrl ?? '')).filter(Boolean),
        ...prevEdgeTargets.map((u) => String(u)),
      ])],
      rawCapture: true,
      onPage: async (page: CrawledPage, done: number) => {
        // ---- persist page row (shared CrawlPage collection — AI agents consume this) ----
        if (done % 3 === 0 || done === 1) {
          await Crawl.updateOne({ _id: crawl._id }, { $set: { 'progress.pagesDone': done, 'progress.currentUrl': page.finalUrl, 'progress.pagesQueued': Math.max(done, crawl.progress?.pagesQueued ?? 0) } });
        }
        if (page.notModified) {
          notModified++;
          const prev = prevByUrl.get(normUrl(page.finalUrl)) ?? prevByUrl.get(normUrl(page.url));
          if (prev) {
            await CrawlPage.create({ ...stripId(prev), crawlId: newCrawlId, fetchedAt: new Date() });
            notModifiedUrls.add(String(prev.finalUrl ?? prev.url));
          }
          return;
        }
        const parsed = page.parsed;
        const contentHash = page.rawHtml ? sha1(page.rawHtml.replace(/\s+/g, ' ')) : prevByUrl.get(normUrl(page.finalUrl))?.contentHash ?? null;
        await CrawlPage.create({
          organization: crawl.organization,
          project: crawl.project,
          crawlId: newCrawlId,
          url: page.url,
          finalUrl: page.finalUrl,
          status: page.status,
          ok: page.ok,
          redirected: page.redirected,
          redirectChain: page.redirectChain,
          depth: page.depth,
          ttfbMs: page.ttfbMs,
          contentType: page.contentType,
          error: page.error,
          ...(parsed ?? {}),
          etag: page.etag ?? null,
          lastModified: page.lastModified ?? null,
          pageSizeBytes: page.pageSizeBytes ?? null,
          rawHtmlExcerpt: page.rawHtml ?? null,
          contentHash,
          indexable: Boolean(page.ok && page.status === 200 && !parsed?.noindex),
          dataSource: 'webamazee_crawler',
        });
        if (page.rawHtml) edges.push(...extractEdges(page.rawHtml, page.finalUrl, host));
      },
    });

    // ---- link edges ----
    // 304 pages: no fresh HTML, so carry their previous outbound edges forward.
    if (notModifiedUrls.size && prevPageCrawlId) {
      const prevEdges = await CrawlLink.find({
        project: crawl.project, crawlId: prevPageCrawlId, fromUrl: { $in: [...notModifiedUrls] },
      }).lean<{ fromUrl: string; toUrl: string; anchor: string; rel: string[]; internal: boolean }[]>();
      for (const e of prevEdges) edges.push({ fromUrl: e.fromUrl, toUrl: e.toUrl, anchor: e.anchor, rel: e.rel ?? [], internal: e.internal });
    }
    if (edges.length) {
      await CrawlLink.insertMany(
        edges.map((e) => ({
          organization: crawl.organization, project: crawl.project, crawlId: newCrawlId, domain,
          fromUrl: e.fromUrl, toUrl: e.toUrl, anchor: e.anchor, rel: e.rel, followType: followTypeOf(e.rel), internal: e.internal,
        })),
        { ordered: false },
      ).catch(() => undefined);
    }

    // ---- inlink counts ----
    const pagesNow = await CrawlPage.find({ project: crawl.project, crawlId: newCrawlId }).lean<PageFacts[]>();
    const inlinks = new Map<string, Set<string>>();
    const outlinks = new Map<string, number>();
    for (const e of edges.filter((x) => x.internal)) {
      const s = inlinks.get(normUrl(e.toUrl)) ?? new Set<string>();
      s.add(normUrl(e.fromUrl));
      inlinks.set(normUrl(e.toUrl), s);
      outlinks.set(normUrl(e.fromUrl), (outlinks.get(normUrl(e.fromUrl)) ?? 0) + 1);
    }
    for (const p of pagesNow) {
      const inC = inlinks.get(normUrl(p.finalUrl))?.size ?? 0;
      const outC = outlinks.get(normUrl(p.finalUrl)) ?? 0;
      await CrawlPage.updateOne({ _id: (p as unknown as { _id: Types.ObjectId })._id }, { $set: { inlinkCount: inC, outlinkCount: outC } });
      p.inlinkCount = inC;
    }

    // ---- discovered backlinks (external sites linking TO our project domain) ----
    let ownHost = '';
    try { ownHost = new URL(/^https?:\/\//i.test(project.website) ? project.website : `https://${project.website}`).host; } catch { /* noop */ }
    let backlinksFound = 0;
    if (crawl.type === 'competitor' && ownHost) {
      const ours = edges.filter((e) => !e.internal && normHost(e.toUrl) === ownHost);
      for (const e of ours) {
        const updated = await Backlink.updateOne(
          { project: crawl.project, sourceUrl: e.fromUrl, targetUrl: e.toUrl },
          {
            $setOnInsert: { organization: crawl.organization, anchor: e.anchor, rel: e.rel, followType: followTypeOf(e.rel), source: 'crawler', status: 'not_checked', firstSeenAt: new Date() },
            $set: { lastCheckedAt: undefined },
          },
          { upsert: true },
        );
        if (updated.upsertedCount) backlinksFound++;
      }
    }

    // ---- issues (measured) ----
    const drafts = detectIssues(pagesNow.map((p) => ({ ...p, inlinkCount: p.inlinkCount })), {
      robots: { exists: result.robots.exists, blocksAll: (result.robots as { blocksAll?: boolean }).blocksAll ?? false },
      sitemap: { exists: result.sitemap.exists, urlsTotal: result.sitemap.urls.length },
      externalLinkStatus: [], // bounded external checking is done lazily by the backlink/verification flows
    });
    const { score, formula } = computeScore(drafts);

    // upsert+resolve issues
    const seenKeys = new Set(drafts.map((d) => `${d.ruleKey}|${d.url ?? ''}`));
    for (const d of drafts) {
      await SEOIssue.updateOne(
        { project: crawl.project, ruleKey: d.ruleKey, url: d.url ?? null, status: 'open' },
        {
          $setOnInsert: { organization: crawl.organization, category: d.category, severity: d.severity, title: d.title, detectedAt: new Date() },
          $set: { crawlId: newCrawlId, description: d.description, evidence: d.evidence, source: 'webamazee_crawler' },
        },
        { upsert: true },
      );
    }
    // resolve earlier opens that no longer reproduce
    const stillOpen = await SEOIssue.find({ project: crawl.project, status: 'open' }).select('ruleKey url').lean<{ ruleKey: string; url?: string }[]>();
    for (const o of stillOpen) {
      if (!seenKeys.has(`${o.ruleKey}|${o.url ?? ''}`)) {
        await SEOIssue.updateOne({ _id: (o as unknown as { _id: Types.ObjectId })._id }, { $set: { status: 'resolved', resolvedAt: new Date(), resolvedInCrawlId: newCrawlId } });
      }
    }

    // bridge open issues → agent Findings (agents consume Findings by category today)
    const catMap: Record<string, string> = { technical: 'technical', content: 'content', performance: 'performance', links: 'links', indexability: 'technical', 'structured-data': 'technical' };
    let bridged = 0;
    for (const d of drafts.slice(0, 120)) {
      const existing = await Finding.findOne({ project: crawl.project, ruleKey: `seo:${d.ruleKey}`, url: d.url ?? null, status: { $in: ['Detected', 'Recommended', 'Approved'] } }).select('_id');
      if (existing) continue;
      await Finding.create({
        organization: crawl.organization,
        project: crawl.project,
        category: catMap[d.category] ?? 'technical',
        ruleKey: `seo:${d.ruleKey}`,
        title: d.title,
        severity: d.severity,
        url: d.url ?? null,
        evidence: { description: d.description, data: d.evidence, source: 'Webamazee SEO Crawler' },
        detectedAt: new Date(),
        recommendedAction: 'Review in SEO Intelligence → Site Audit.',
        isDemo: project.isDemo ?? false,
      });
      bridged++;
    }

    // ---- change detection vs previous crawl ----
    const changes: { changeType: string; url?: string; before?: unknown; after?: unknown }[] = [];
    const nowByUrl = new Map(pagesNow.map((p) => [normUrl(p.finalUrl), p]));
    if (prevCrawl && prevPageCrawlId) {
      for (const [u, p] of nowByUrl) {
        const prev = prevByUrl.get(u) as (Record<string, unknown> | undefined);
        if (!prev) { changes.push({ changeType: 'page_added', url: u, after: { status: p.status, title: p.title } }); continue; }
        if (String(prev.status) !== String(p.status)) changes.push({ changeType: 'status_changed', url: u, before: prev.status, after: p.status });
        if ((prev.title ?? '') !== (p.title ?? '')) changes.push({ changeType: 'title_changed', url: u, before: prev.title, after: p.title });
        if ((prev.canonical ?? '') !== (p.canonical ?? '')) changes.push({ changeType: 'canonical_changed', url: u, before: prev.canonical, after: p.canonical });
        if ((prev.robotsMeta ?? '') !== (p.robotsMeta ?? '')) changes.push({ changeType: 'robots_changed', url: u, before: prev.robotsMeta, after: p.robotsMeta });
        if (JSON.stringify(prev.h1 ?? []) !== JSON.stringify(p.h1 ?? [])) changes.push({ changeType: 'h1_changed', url: u, before: prev.h1, after: p.h1 });
        if (JSON.stringify([...(prev.structuredDataTypes as string[] ?? [])].sort()) !== JSON.stringify([...(p.structuredDataTypes ?? [])].sort())) changes.push({ changeType: 'schema_changed', url: u, before: prev.structuredDataTypes, after: p.structuredDataTypes });
        if (prev.contentHash && p.contentHash && prev.contentHash !== p.contentHash) changes.push({ changeType: 'content_changed', url: u, before: prev.contentHash, after: p.contentHash });
        const prevIn = (prev.inlinkCount as number) ?? 0;
        if (prevIn !== (p.inlinkCount ?? 0)) changes.push({ changeType: 'links_changed', url: u, before: prevIn, after: p.inlinkCount ?? 0 });
      }
      for (const [u, p] of prevByUrl) {
        if (!nowByUrl.has(u)) changes.push({ changeType: 'page_removed', url: u, before: { status: (p as { status?: number }).status, title: (p as { title?: string }).title } });
      }
      const robotsHash = sha1(JSON.stringify({ d: result.robots.disallows, a: (result.robots as { allowed?: string[] }).allowed ?? [], s: result.robots.sitemapUrls }));
      if (prevCrawl.robots?.hash && prevCrawl.robots.hash !== robotsHash) changes.push({ changeType: 'robots_txt_changed', before: prevCrawl.robots.hash, after: robotsHash });
      const sitemapHash = sha1(JSON.stringify(result.sitemap.urls.slice(0, 2000).sort()));
      if (prevCrawl.sitemap?.hash && prevCrawl.sitemap.hash !== sitemapHash) changes.push({ changeType: 'sitemap_changed', before: prevCrawl.sitemap.hash, after: sitemapHash });
      await Crawl.updateOne({ _id: crawl._id }, { $set: { 'robots.hash': robotsHash, 'sitemap.hash': sitemapHash } });
      if (changes.length) {
        await SEOChange.insertMany(changes.slice(0, 500).map((c) => ({
          organization: crawl.organization, project: crawl.project, domain, crawlId: newCrawlId, vsCrawlId: prevPageCrawlId,
          changeType: c.changeType, url: c.url, before: c.before, after: c.after, detectedAt: new Date(),
        })), { ordered: false }).catch(() => undefined);
      }
    } else {
      await Crawl.updateOne({ _id: crawl._id }, {
        $set: {
          'robots.hash': sha1(JSON.stringify({ d: result.robots.disallows, s: result.robots.sitemapUrls })),
          'sitemap.hash': sha1(JSON.stringify(result.sitemap.urls.slice(0, 2000).sort())),
        },
      });
    }

    // ---- stats + snapshot ----
    const bySeverity: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const d of drafts) { bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1; byCategory[d.category] = (byCategory[d.category] ?? 0) + 1; }
    const stats = {
      score,
      scoreFormula: formula,
      pages: pagesNow.length,
      pagesOk: pagesNow.filter((p) => p.ok && p.status === 200).length,
      statusClasses: {
        '2xx': pagesNow.filter((p) => p.status >= 200 && p.status < 300).length,
        '3xx': pagesNow.filter((p) => p.redirected).length,
        '4xx': pagesNow.filter((p) => p.status >= 400 && p.status < 500).length,
        '5xx': pagesNow.filter((p) => p.status >= 500).length,
        errors: pagesNow.filter((p) => p.status === 0 || p.error).length,
      },
      indexable: pagesNow.filter((p) => (p as unknown as { indexable?: boolean }).indexable).length,
      noindex: pagesNow.filter((p) => p.noindex).length,
      internalLinks: edges.filter((e) => e.internal).length,
      externalLinks: edges.filter((e) => !e.internal).length,
      issues: { total: drafts.length, bySeverity, byCategory },
      orphans: pagesNow.filter((p) => p.ok && p.status === 200 && p.depth > 0 && (p.inlinkCount ?? 0) === 0).length,
      avgTtfbMs: pagesNow.length ? Math.round(pagesNow.reduce((a, p) => a + (p.ttfbMs ?? 0), 0) / pagesNow.length) : 0,
      avgWordCount: pagesNow.length ? Math.round(pagesNow.reduce((a, p) => a + (p.wordCount ?? 0), 0) / pagesNow.length) : 0,
      backlinksDiscovered: backlinksFound,
      changes: changes.length,
      bridgedFindings: bridged,
    };

    await SEOSnapshot.create({
      organization: crawl.organization, project: crawl.project, crawlId: newCrawlId, domain,
      takenAt: new Date(), metrics: stats,
    });

    await Crawl.updateOne({ _id: crawl._id }, {
      $set: {
        status: 'completed',
        completedAt: new Date(),
        pageCrawlId: newCrawlId,
        'robots.exists': result.robots.exists,
        'robots.sitemaps': result.robots.sitemapUrls.length,
        'robots.disallows': result.robots.disallows.length,
        'sitemap.exists': result.sitemap.exists,
        'sitemap.url': result.sitemap.url ?? null,
        'sitemap.urlsTotal': result.sitemap.urls.length,
        'incremental.checked': conditional.size,
        'incremental.notModified': notModified,
        stats,
        'progress.pagesDone': pagesNow.length,
        'progress.pagesQueued': result.pagesRequested,
      },
      $unset: { error: '' },
    });
    if (crawl.type === 'competitor' && crawl.competitor) {
      await Competitor.updateOne({ _id: crawl.competitor }, { $set: { lastCrawlId: newCrawlId } });
    }
    return { ok: true };
  } catch (e) {
    await Crawl.updateOne({ _id: crawl._id }, { $set: { status: 'failed', completedAt: new Date(), error: (e as Error).message.slice(0, 500) } });
    return { ok: false, error: (e as Error).message };
  }
}

function stripId(p: Record<string, unknown>) {
  const { _id, ...rest } = p;
  void _id;
  return rest;
}
const normHost = (u: string) => { try { return new URL(u).host; } catch { return ''; } };
