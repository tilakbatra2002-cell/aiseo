/**
 * Webamazee SEO Intelligence — query/aggregation layer.
 * Every returned metric carries its data source; unavailable metrics are labelled,
 * never fabricated.
 */
import { Crawl, CrawlLink, CrawlPage, SEOIssue, SEOChange, SEOSnapshot, Keyword, KeywordObservation, RankingObservation, Competitor, Backlink, BacklinkImport, GSCProperty, GSCMetricSnapshot, GSCQuery, Report, Project } from '@/models';
import type { Types } from 'mongoose';

export const SRC = {
  crawler: 'Crawled by Webamazee',
  gsc: 'Google Search Console',
  ga: 'Google Analytics',
  user: 'User Import',
  ai: 'AI Analysis',
} as const;

export type DataStatus = 'verified' | 'partial' | 'unavailable' | 'requires-integration' | 'not-verified' | 'estimated';

export function metric<T>(value: T | null, source: string, opts?: { status?: DataStatus; note?: string; updatedAt?: Date | string | null }) {
  return {
    value,
    source,
    status: opts?.status ?? (value === null ? 'unavailable' : 'verified'),
    note: opts?.note ?? null,
    updatedAt: opts?.updatedAt ?? null,
  };
}

/* --------------------------- project resolution --------------------------- */
export async function latestSelfCrawl(orgId: string, projectId: string) {
  return Crawl.findOne({ organization: orgId, project: projectId, type: 'self', status: 'completed' })
    .sort({ startedAt: -1 }).lean<Record<string, unknown> | null>();
}

export async function latestCrawlPages(projectId: string, pageCrawlId?: string | null) {
  if (!pageCrawlId) return [] as Record<string, unknown>[];
  return CrawlPage.find({ project: projectId, crawlId: pageCrawlId }).lean<Record<string, unknown>[]>();
}

/* -------------------------------- overview -------------------------------- */
export async function seoOverview(orgId: string, projectId: string) {
  const [crawl, runningCrawl, openIssues, gsc, snapshots, changes, backlinks, competitors] = await Promise.all([
    latestSelfCrawl(orgId, projectId),
    Crawl.findOne({ organization: orgId, project: projectId, status: { $in: ['queued', 'running'] } }).sort({ startedAt: -1 }).lean<Record<string, unknown> | null>(),
    SEOIssue.find({ organization: orgId, project: projectId, status: 'open' }).lean<{ severity: string; category: string }[]>(),
    GSCProperty.findOne({ organization: orgId, project: projectId }).lean<Record<string, unknown> | null>(),
    SEOSnapshot.find({ organization: orgId, project: projectId }).sort({ takenAt: -1 }).limit(30).lean<{ takenAt: Date; metrics: Record<string, unknown> }[]>(),
    SEOChange.find({ organization: orgId, project: projectId }).sort({ detectedAt: -1 }).limit(200).lean<Record<string, unknown>[]>(),
    Backlink.countDocuments({ organization: orgId, project: projectId }),
    Competitor.find({ organization: orgId, project: projectId }).lean<Record<string, unknown>[]>(),
  ]);
  const stats = (crawl?.stats ?? null) as Record<string, unknown> | null;
  const bySev: Record<string, number> = {};
  const byCat: Record<string, number> = {};
  for (const i of openIssues) { bySev[i.severity] = (bySev[i.severity] ?? 0) + 1; byCat[i.category] = (byCat[i.category] ?? 0) + 1; }

  const gscRecent = gsc
    ? await GSCMetricSnapshot.find({ organization: orgId, project: projectId }).sort({ date: -1 }).limit(28).lean<Record<string, unknown>[]>()
    : null;

  return {
    domain: crawl?.domain ?? null,
    crawl,
    runningCrawl,
    health: stats ? {
      technicalHealth: metric(stats.score, SRC.crawler, { note: 'Internal technical health score — not a Google ranking score and does not predict rankings.', updatedAt: crawl?.completedAt as string }),
      scoreFormula: stats.scoreFormula,
      contentHealth: metric(null, SRC.crawler, { status: 'estimated', note: `Derived from measured content issue count: ${byCat.content ?? 0} open.`, updatedAt: crawl?.completedAt as string }),
      indexability: metric(stats.indexable, SRC.crawler, { note: `${stats.noindex ?? 0} noindex of ${stats.pages ?? 0} crawled`, updatedAt: crawl?.completedAt as string }),
      internalLinking: metric({ internalLinks: stats.internalLinks, orphans: stats.orphans }, SRC.crawler, { updatedAt: crawl?.completedAt as string }),
      structuredData: metric(null, SRC.crawler, { status: byCat['structured-data'] ? 'partial' : 'verified', note: `${byCat['structured-data'] ?? 0} open structured-data issue(s)`, updatedAt: crawl?.completedAt as string }),
      performance: metric({ avgTtfbMs: stats.avgTtfbMs, avgWordCount: stats.avgWordCount }, SRC.crawler, { status: 'partial', note: 'Crawler-measured TTFB/HTML only. Core Web Vitals require a field-data source (e.g. CrUX/PSI) — not connected.', updatedAt: crawl?.completedAt as string }),
      gscPerformance: gscRecent
        ? metric(gscRecent[0] ?? null, SRC.gsc, { note: 'Real Search Console daily metrics.', updatedAt: gsc?.lastSyncAt as string })
        : metric(null, SRC.gsc, { status: 'requires-integration', note: 'Connect Google Search Console for clicks/impressions/CTR/position.' }),
    } : null,
    openIssues: { total: openIssues.length, bySeverity: bySev, byCategory: byCat, source: SRC.crawler },
    stats,
    history: snapshots.map((s) => ({ takenAt: s.takenAt, score: (s.metrics as Record<string, unknown>)?.score, pages: (s.metrics as Record<string, unknown>)?.pages, issues: ((s.metrics as Record<string, unknown>)?.issues as Record<string, unknown>)?.total })),
    recentChanges: changes.slice(0, 12),
    changesTotal: changes.length,
    backlinksDiscovered: metric(backlinks, `${SRC.crawler} + imports`, { status: 'partial', note: 'Discovered dataset only — not a complete internet-wide backlink index.' }),
    competitors: competitors.length,
    dataSources: [SRC.crawler, gsc ? SRC.gsc : null].filter(Boolean),
  };
}

/* ------------------------------- site audit ------------------------------- */
export async function siteAudit(orgId: string, projectId: string, opts?: { category?: string; severity?: string; limit?: number; skip?: number }) {
  const filter: Record<string, unknown> = { organization: orgId, project: projectId, status: 'open' };
  if (opts?.category) filter.category = opts.category;
  if (opts?.severity) filter.severity = opts.severity;
  const [issues, total] = await Promise.all([
    SEOIssue.find(filter).sort({ detectedAt: -1 }).skip(opts?.skip ?? 0).limit(opts?.limit ?? 100).lean<Record<string, unknown>[]>(),
    SEOIssue.countDocuments(filter),
  ]);
  return { issues, total };
}

/* ----------------------------- internal links ----------------------------- */
export async function internalLinkAnalysis(orgId: string, projectId: string) {
  const crawl = await latestSelfCrawl(orgId, projectId);
  const pageCrawlId = crawl?.pageCrawlId as string | undefined;
  if (!pageCrawlId) return { available: false as const, reason: 'No completed crawl yet. Run Site Crawl first.' };
  const edges = await CrawlLink.find({ project: projectId, crawlId: pageCrawlId, internal: true }).lean<{ fromUrl: string; toUrl: string; anchor: string }[]>();
  const pages = await CrawlPage.find({ project: projectId, crawlId: pageCrawlId }).select('finalUrl status wordCount depth inlinkCount outlinkCount').lean<Record<string, unknown>[]>();
  // Normalize trailing slashes so link targets (/menu) match crawled final URLs (/menu/).
  const stripSlash = (u: string) => String(u).replace(/\/+$/, '');
  const inMap = new Map<string, { count: number; anchors: Map<string, number>; from: Set<string> }>();
  const outMap = new Map<string, number>();
  for (const e of edges) {
    const t = inMap.get(stripSlash(e.toUrl)) ?? { count: 0, anchors: new Map(), from: new Set() };
    t.count++;
    t.anchors.set(e.anchor || '(empty)', (t.anchors.get(e.anchor || '(empty)') ?? 0) + 1);
    t.from.add(e.fromUrl);
    inMap.set(stripSlash(e.toUrl), t);
    outMap.set(e.fromUrl, (outMap.get(e.fromUrl) ?? 0) + 1);
  }
  const topTargets = [...inMap.entries()].sort((a, b) => b[1].from.size - a[1].from.size).slice(0, 25)
    .map(([url, v]) => ({ url, incomingPages: v.from.size, linkCount: v.count, topAnchors: [...v.anchors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([anchor, n]) => ({ anchor, count: n })) }));
  const okPages = pages.filter((p) => p.status === 200);
  const orphanCandidates = okPages.filter((p) => (p.depth as number) > 0 && ![...(inMap.get(stripSlash(String(p.finalUrl)))?.from ?? [])].length).map((p) => ({ url: p.finalUrl, depth: p.depth, wordCount: p.wordCount }));
  const weakPages = okPages.filter((p) => { const inP = (inMap.get(stripSlash(String(p.finalUrl)))?.from.size ?? 0); return inP > 0 && inP < 2; }).slice(0, 50)
    .map((p) => ({ url: p.finalUrl, incomingPages: inMap.get(stripSlash(String(p.finalUrl)))?.from.size ?? 0 }));
  const excessive = [...outMap.entries()].filter(([, n]) => n > 100).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([url, n]) => ({ url, outgoing: n }));
  const anchors = new Map<string, number>();
  for (const e of edges) anchors.set(e.anchor || '(empty)', (anchors.get(e.anchor || '(empty)') ?? 0) + 1);
  const anchorTop = [...anchors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([anchor, count]) => ({ anchor, count }));
  // distribution for graph viz: top 12 targets + their sources (sampled)
  const graph = {
    nodes: [{ id: 'home', label: String(crawl?.domain ?? 'site'), kind: 'root' as const },
      ...topTargets.slice(0, 11).map((t) => ({ id: t.url, label: t.url.replace(/^https?:\/\//, '').slice(0, 42), kind: 'page' as const }))],
    edges: topTargets.slice(0, 11).map((t, i) => ({ from: i < 2 ? 'home' : t.url, to: t.url, weight: t.incomingPages })),
  };
  graph.edges = graph.edges.map((e, i) => ({ ...e, from: i === 0 ? 'home' : 'home' })); // hub view: all into root's orbit
  return {
    available: true as const,
    crawlId: pageCrawlId,
    totals: { edges: edges.length, pages: pages.length },
    topTargets, orphanCandidates, weakPages, excessive, anchorTop, graph,
    source: SRC.crawler,
    note: 'Graph edges sampled from the largest link hubs for display.',
  };
}

/* -------------------------------- competitors ----------------------------- */
export async function competitorComparison(orgId: string, projectId: string) {
  const selfCrawl = await latestSelfCrawl(orgId, projectId);
  const selfPages = await latestCrawlPages(projectId, selfCrawl?.pageCrawlId as string | undefined);
  const selfHome = selfPages.find((p) => p.depth === 0) ?? selfPages[0];
  const competitors = await Competitor.find({ organization: orgId, project: projectId }).lean<Record<string, unknown>[]>();
  const rows: {
    competitor: Record<string, unknown>; crawled: boolean; pages: number;
    issues: unknown; score: unknown; title: unknown; h1: string | null;
    wordCountHome: unknown; ttfbMsHome: unknown; schemaTypesHome: unknown; topicSegments: string[];
  }[] = [];
  for (const c of competitors) {
    const crawl = c.lastCrawlId
      ? await Crawl.findOne({ pageCrawlId: c.lastCrawlId }).lean<Record<string, unknown> | null>()
      : await Crawl.findOne({ project: projectId, competitor: c._id, status: 'completed', type: 'competitor' }).sort({ startedAt: -1 }).lean<Record<string, unknown> | null>();
    const pcid = (crawl?.pageCrawlId ?? c.lastCrawlId) as string | undefined;
    const pages = pcid ? await CrawlPage.find({ crawlId: pcid }).lean<Record<string, unknown>[]>() : [];
    const home = pages.find((p) => p.depth === 0) ?? pages[0];
    const topics = new Set<string>();
    for (const p of pages) {
      try {
        const seg = new URL(String(p.finalUrl)).pathname.split('/').filter(Boolean)[0];
        if (seg) topics.add(seg.toLowerCase());
      } catch { /* noop */ }
    }
    rows.push({
      competitor: c,
      crawled: Boolean(crawl),
      pages: pages.length,
      issues: (crawl?.stats as Record<string, unknown> | undefined)?.issues ?? null,
      score: (crawl?.stats as Record<string, unknown> | undefined)?.score ?? null,
      title: home?.title ?? null,
      h1: (home?.h1 as string[] | undefined)?.[0] ?? null,
      wordCountHome: home?.wordCount ?? null,
      ttfbMsHome: home?.ttfbMs ?? null,
      schemaTypesHome: home?.structuredDataTypes ?? [],
      topicSegments: [...topics].slice(0, 40),
    });
  }
  const selfTopics = new Set<string>();
  for (const p of selfPages) {
    try {
      const seg = new URL(String(p.finalUrl)).pathname.split('/').filter(Boolean)[0];
      if (seg) selfTopics.add(seg.toLowerCase());
    } catch { /* noop */ }
  }
  return {
    self: {
      pages: selfPages.length,
      score: (selfCrawl?.stats as Record<string, unknown> | undefined)?.score ?? null,
      title: selfHome?.title ?? null,
      wordCountHome: selfHome?.wordCount ?? null,
      schemaTypesHome: selfHome?.structuredDataTypes ?? [],
      topicSegments: [...selfTopics].slice(0, 40),
    },
    competitors: rows,
    source: SRC.crawler,
    note: 'Competitor data from our own crawls of publicly accessible pages. No traffic, backlink-total, volume or revenue metrics are claimed.',
  };
}

/* ------------------------------- content gap ------------------------------ */
export async function contentGap(orgId: string, projectId: string, project: { website?: string; targetKeywords?: string[] }) {
  const comp = await competitorComparison(orgId, projectId);
  const selfTopics = new Set(comp.self.topicSegments);
  const gaps: { topic: string; coveredBy: string[]; basis: 'observed' }[] = [];
  for (const c of comp.competitors) {
    if (!c.crawled) continue;
    for (const t of c.topicSegments) {
      if (!selfTopics.has(t)) {
        const existing = gaps.find((g) => g.topic === t);
        if (existing) existing.coveredBy.push(String(c.competitor.domain));
        else gaps.push({ topic: t, coveredBy: [String(c.competitor.domain)], basis: 'observed' });
      }
    }
  }
  // GSC queries with impressions but no dedicated page → keyword mapping
  const gscGaps: { query: string; impressions: number; basis: 'observed'; note: string }[] = [];
  const gsc = await GSCProperty.findOne({ organization: orgId, project: projectId });
  if (gsc) {
    const rows = await GSCQuery.find({ organization: orgId, project: projectId }).sort({ impressions: -1 }).limit(500).lean<{ query: string; page?: string; impressions: number }[]>();
    const byQuery = new Map<string, { impressions: number; page?: string }>();
    for (const r of rows) {
      const key = r.query.toLowerCase();
      const ex = byQuery.get(key);
      byQuery.set(key, { impressions: (ex?.impressions ?? 0) + (r.impressions ?? 0), page: r.page ?? ex?.page });
    }
    for (const [query, v] of byQuery) {
      const kw = await Keyword.findOne({ organization: orgId, project: projectId, termLower: query }).select('targetUrl');
      if (!kw?.targetUrl) gscGaps.push({ query, impressions: v.impressions, basis: 'observed', note: v.page ? 'Receives impressions; no explicit keyword→page mapping' : 'Receives impressions; no dedicated page observed in GSC page data' });
    }
  }
  const unmappedKeywords = await Keyword.find({ organization: orgId, project: projectId, status: 'active', targetUrl: { $in: [null, ''] } }).select('term').lean<{ term: string }[]>();
  return {
    competitorTopicGaps: gaps,
    gscQueryGaps: gsc && gscGaps.length ? gscGaps.slice(0, 25) : [],
    gscConnected: Boolean(gsc),
    unmappedKeywords: unmappedKeywords.length,
    weakAlignment: project.targetKeywords?.length ?? 0,
    note: 'Items labelled "observed" are computed from crawled URLs / connected GSC data. AI-derived opportunities appear only when an AI provider is enabled and are labelled separately.',
    source: `${SRC.crawler}${gsc ? ' + ' + SRC.gsc : ''}`,
  };
}

/* -------------------------------- backlinks ------------------------------- */
export async function importBacklinksCsv(orgId: string, projectId: string, csv: string, filename?: string) {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines[0]?.toLowerCase().split(',').map((h) => h.trim()) ?? [];
  const idx = {
    source: header.indexOf('source_url'), target: header.indexOf('target_url'),
    anchor: header.indexOf('anchor_text'), rel: header.indexOf('rel'), discoveredAt: header.indexOf('discovered_at'),
  };
  const imp = await BacklinkImport.create({
    organization: orgId, project: projectId, filename: filename?.slice(0, 120), rowsTotal: 0, rowsImported: 0, rowsSkipped: 0,
  });
  let imported = 0; let skipped = 0;
  const rows = (idx.source >= 0 && idx.target >= 0 ? lines.slice(1) : lines).slice(0, 5000);
  for (const line of rows) {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const sourceUrl = idx.source >= 0 ? cols[idx.source] : cols[0];
    const targetUrl = idx.target >= 0 ? cols[idx.target] : cols[1];
    if (!/^https?:\/\//i.test(String(sourceUrl)) || !/^https?:\/\//i.test(String(targetUrl))) { skipped++; continue; }
    const rel = (idx.rel >= 0 ? String(cols[idx.rel] ?? '') : '').toLowerCase().split(/\s+/).filter(Boolean);
    const discoveredAt = idx.discoveredAt >= 0 && cols[idx.discoveredAt] && !isNaN(Date.parse(cols[idx.discoveredAt])) ? new Date(cols[idx.discoveredAt]) : new Date();
    const res = await Backlink.updateOne(
      { project: projectId, sourceUrl, targetUrl },
      {
        $setOnInsert: {
          organization: orgId, anchor: idx.anchor >= 0 ? (cols[idx.anchor] ?? '').slice(0, 200) : '',
          rel, followType: rel.includes('nofollow') ? 'nofollow' : rel.includes('ugc') ? 'ugc' : rel.includes('sponsored') ? 'sponsored' : 'follow',
          source: 'import', status: 'not_checked', firstSeenAt: discoveredAt, importBatch: imp._id,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) imported++; else skipped++;
  }
  await BacklinkImport.updateOne({ _id: imp._id }, { $set: { rowsTotal: rows.length, rowsImported: imported, rowsSkipped: skipped } });
  return { importId: String(imp._id), rowsTotal: rows.length, rowsImported: imported, rowsSkipped: skipped };
}

/* --------------------------------- report --------------------------------- */
export async function generateSeoReport(orgId: string, projectId: string, user: { id: string; name: string }) {
  const project = await Project.findOne({ _id: projectId, organization: orgId }).lean<{ name: string; website: string; isDemo?: boolean }>();
  if (!project) throw new Error('Project not found');
  const [ov, audit, links] = await Promise.all([
    seoOverview(orgId, projectId),
    siteAudit(orgId, projectId, { limit: 200 }),
    internalLinkAnalysis(orgId, projectId),
  ]);
  const open = audit.issues as { title: string; severity: string; category: string; url?: string; description?: string }[];
  const critical = open.filter((i) => i.severity === 'Critical').length;
  const score = (ov.stats?.score as number | undefined) ?? null;
  const report = await Report.create({
    organization: orgId,
    project: projectId,
    title: `${project.name} — SEO Intelligence Report`,
    type: 'seo_intelligence',
    sections: {
      executiveSummary: {
        findingsTotal: open.length,
        critical,
        tasksCompleted: 0,
        tasksFailed: 0,
        agentRuns: 0,
        byStatus: { open: open.length },
        technicalScore: score,
        dataSources: ov.dataSources,
        crawledAt: ov.crawl?.completedAt ?? null,
      },
      problemsDiscovered: open.slice(0, 120).map((i) => ({
        title: i.title, severity: i.severity, category: i.category, url: i.url,
        status: 'Detected', verification: 'verified',
      })),
      internalLinking: links.available ? {
        totals: links.totals, orphanCandidates: links.orphanCandidates.length, weakPages: links.weakPages.length,
        topTargets: links.topTargets.slice(0, 10),
      } : { note: links.reason },
      performanceData: {
        available: Boolean(ov.stats),
        note: `Crawler-measured: avg TTFB ${ov.stats?.avgTtfbMs ?? '—'}ms, avg word count ${ov.stats?.avgWordCount ?? '—'}. Core Web Vitals & search-performance metrics require connected data sources; none are fabricated.`,
      },
      nextPriorities: open.slice(0, 10).map((i, idx) => ({
        title: i.title, severity: i.severity, internalPriorityScore: Math.max(1, 100 - idx * 10),
        recommendedAction: i.description,
      })),
      verificationStatus: { verified: open.length, failed: 0, notVerified: 0 },
      dataProvenance: {
        crawler: 'Webamazee first-party crawler (robots-aware, rate-limited)',
        gsc: ov.health?.gscPerformance?.status === 'verified' ? 'connected' : 'not connected',
        limitations: 'Third-party platforms maintain proprietary keyword/backlink indexes that cannot be fully reproduced without their datasets. Metrics unavailable from our sources are not fabricated.',
      },
    },
    summary: `Self-crawl of ${project.website}: ${(ov.stats?.pages as number) ?? 0} pages, ${open.length} open measured issue(s) (${critical} critical). Webamazee Technical Score ${score ?? '—'}/100 (internal, not a ranking score).`,
    generatedBy: { type: 'user', id: user.id, name: user.name },
    period: { from: ov.crawl?.startedAt as Date | undefined, to: new Date() },
    verificationStatus: 'Measured data — 100% first-party sources',
    isDemo: project.isDemo ?? false,
  });
  return Report.findById(report._id).lean();
}
