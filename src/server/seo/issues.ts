/**
 * Webamazee SEO Intelligence — rule engine.
 * All issues are derived from measured crawl data only. No estimates.
 */
import { createHash } from 'crypto';
import type { Types } from 'mongoose';

export const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

export interface PageFacts {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  redirected: boolean;
  error?: string | null;
  depth: number;
  ttfbMs: number;
  pageSizeBytes?: number | null;
  title?: string;
  metaDescription?: string;
  canonical?: string;
  robotsMeta?: string;
  noindex?: boolean;
  h1?: string[];
  headings?: { level: string; text: string }[];
  wordCount?: number;
  imagesTotal?: number;
  imagesMissingAlt?: number;
  internalLinks?: string[];
  externalLinks?: string[];
  structuredDataTypes?: string[];
  hreflang?: { lang: string; href: string }[];
  contentHash?: string | null;
  inlinkCount?: number;
}

export interface IssueDraft {
  category: 'technical' | 'content' | 'performance' | 'links' | 'indexability' | 'structured-data';
  ruleKey: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
  url?: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
}

const THIN_WORDS = 300;
const SLOW_TTFB = 2000;
const DEEP_LEVEL = 3;
const BIG_HTML = 150_000;

/** Pure functions: page facts + site facts → issue drafts. Deterministic. */
export function detectIssues(pages: PageFacts[], ctx: {
  robots: { exists: boolean; blocksAll?: boolean };
  sitemap: { exists: boolean; urlsTotal?: number };
  externalLinkStatus: { url: string; status: number }[];
}): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const push = (i: IssueDraft) => issues.push(i);
  const okPages = pages.filter((p) => p.ok && p.status === 200);
  const norm = (u?: string) => {
    try { const x = new URL(String(u)); x.hash = ''; return x.toString().replace(/\/$/, ''); } catch { return String(u ?? ''); }
  };

  /* ---- site-level technical ---- */
  if (!ctx.robots.exists) push({ category: 'technical', ruleKey: 'robots_txt_missing', severity: 'Low', title: 'robots.txt not found', description: 'No robots.txt was retrievable. Search engines crawl without policy guidance.', evidence: { measured: 'robots.txt fetch did not return a parseable file' } });
  if (ctx.robots.blocksAll) push({ category: 'indexability', ruleKey: 'robots_blocks_all', severity: 'Critical', title: 'robots.txt disallows the entire site', description: 'The robots policy blocks all crawling, making the site invisible to engines that respect it.', evidence: { measured: 'Disallow: /' } });
  if (!ctx.sitemap.exists) push({ category: 'technical', ruleKey: 'sitemap_missing', severity: 'Medium', title: 'XML sitemap not detected', description: 'No sitemap.xml, sitemap index, or robots-referenced sitemap was found.', evidence: { checked: ['robots sitemap references', '/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml'] } });

  /* ---- status classes ---- */
  const broken = pages.filter((p) => p.status >= 400);
  if (broken.length) for (const p of broken) {
    push({ category: 'technical', ruleKey: p.status >= 500 ? 'page_5xx' : 'page_4xx', severity: p.status >= 500 ? 'Critical' : 'High', url: p.finalUrl, title: `Page returns HTTP ${p.status}`, description: 'The URL responded with an error status code during our crawl.', evidence: { status: p.status, url: p.finalUrl } });
  }
  const redirectHits = pages.filter((p) => p.redirected && p.ok);
  if (redirectHits.length >= 2) {
    push({ category: 'technical', ruleKey: 'redirected_urls', severity: 'Low', title: `${redirectHits.length} crawled URL(s) redirect`, description: 'Redirects add crawl overhead. Internal links should point to final destinations.', evidence: { urls: redirectHits.slice(0, 10).map((p) => p.url) } });
  }

  /* ---- metadata ---- */
  const missingTitle = okPages.filter((p) => !p.title);
  const titleByText = new Map<string, string[]>();
  for (const p of okPages) if (p.title) {
    const k = p.title.trim().toLowerCase();
    titleByText.set(k, [...(titleByText.get(k) ?? []), p.finalUrl]);
  }
  if (missingTitle.length) push({ category: 'technical', ruleKey: 'missing_title', severity: 'High', title: `${missingTitle.length} page(s) missing a <title>`, description: 'Titles are a primary relevance and SERP display signal.', evidence: { urls: missingTitle.slice(0, 20).map((p) => p.finalUrl) } });
  const dupTitles = [...titleByText.entries()].filter(([t, urls]) => t && urls.length > 1);
  if (dupTitles.length) push({ category: 'technical', ruleKey: 'duplicate_title', severity: 'Medium', title: `${dupTitles.length} duplicate title group(s)`, description: 'Identical titles on different URLs confuse relevance signals.', evidence: { groups: dupTitles.slice(0, 10).map(([title, urls]) => ({ title: title.slice(0, 80), urls })) } });

  const missingMeta = okPages.filter((p) => !p.metaDescription);
  const metaByText = new Map<string, string[]>();
  for (const p of okPages) if (p.metaDescription) {
    const k = p.metaDescription.trim().toLowerCase();
    metaByText.set(k, [...(metaByText.get(k) ?? []), p.finalUrl]);
  }
  if (missingMeta.length) push({ category: 'technical', ruleKey: 'missing_meta_description', severity: 'Medium', title: `${missingMeta.length} page(s) missing meta description`, description: 'Meta descriptions influence click-through from SERPs.', evidence: { urls: missingMeta.slice(0, 20).map((p) => p.finalUrl) } });
  const dupMeta = [...metaByText.entries()].filter(([, urls]) => urls.length > 1);
  if (dupMeta.length) push({ category: 'technical', ruleKey: 'duplicate_meta_description', severity: 'Low', title: `${dupMeta.length} duplicate meta description group(s)`, description: 'Same description reused across different pages.', evidence: { groups: dupMeta.slice(0, 10).map(([t, urls]) => ({ text: t.slice(0, 80), urls })) } });

  /* ---- headings ---- */
  const missingH1 = okPages.filter((p) => !(p.h1 ?? []).length);
  const multiH1 = okPages.filter((p) => (p.h1 ?? []).length > 1);
  if (missingH1.length) push({ category: 'content', ruleKey: 'missing_h1', severity: 'Medium', title: `${missingH1.length} page(s) missing an H1`, description: 'Every indexable page should declare one primary heading.', evidence: { urls: missingH1.slice(0, 20).map((p) => p.finalUrl) } });
  if (multiH1.length) push({ category: 'content', ruleKey: 'multiple_h1', severity: 'Low', title: `${multiH1.length} page(s) with multiple H1s`, description: 'Multiple H1s dilute the primary topic signal.', evidence: { urls: multiH1.slice(0, 20).map((p) => p.finalUrl) } });

  /* ---- canonical / indexability ---- */
  const noindexPages = pages.filter((p) => p.noindex);
  if (noindexPages.length) push({ category: 'indexability', ruleKey: 'noindex_pages', severity: 'Informational', title: `${noindexPages.length} page(s) carry noindex`, description: 'These pages are intentionally excluded from indexing — verify this is deliberate.', evidence: { urls: noindexPages.map((p) => p.finalUrl) } });
  const canonMismatch = okPages.filter((p) => p.canonical && norm(p.canonical) !== norm(p.finalUrl));
  if (canonMismatch.length) push({ category: 'indexability', ruleKey: 'canonical_mismatch', severity: 'Medium', title: `${canonMismatch.length} page(s) canonicalize to a different URL`, description: 'Canonical points away from the crawled URL — correct if consolidating, harmful if accidental.', evidence: { pages: canonMismatch.slice(0, 20).map((p) => ({ url: p.finalUrl, canonical: p.canonical })) } });

  /* ---- content ---- */
  const thin = okPages.filter((p) => (p.wordCount ?? 0) > 0 && (p.wordCount ?? 0) < THIN_WORDS);
  const empty = okPages.filter((p) => (p.wordCount ?? 0) === 0);
  if (thin.length) push({ category: 'content', ruleKey: 'thin_content', severity: 'Medium', title: `${thin.length} page(s) with thin content (<${THIN_WORDS} words)`, description: 'Thin pages struggle to satisfy search intent.', evidence: { measured: 'visible-body word count', urls: thin.slice(0, 20).map((p) => ({ url: p.finalUrl, words: p.wordCount })) } });
  if (empty.length) push({ category: 'content', ruleKey: 'empty_body', severity: 'High', title: `${empty.length} page(s) render no readable text`, description: 'No visible body text could be measured by our crawler.', evidence: { urls: empty.slice(0, 20).map((p) => p.finalUrl) } });

  const hashGroups = new Map<string, string[]>();
  for (const p of okPages) if (p.contentHash) hashGroups.set(p.contentHash, [...(hashGroups.get(p.contentHash) ?? []), p.finalUrl]);
  const dupContent = [...hashGroups.values()].filter((urls) => urls.length > 1);
  if (dupContent.length) push({ category: 'content', ruleKey: 'duplicate_content_signal', severity: 'High', title: `${dupContent.length} duplicate-content group(s) (identical body hash)`, description: 'Pages with byte-identical normalized content — measured, not inferred.', evidence: { method: 'sha1 of normalized html', groups: dupContent.slice(0, 10) } });

  /* ---- links ---- */
  const internalOk = new Map(okPages.map((p) => [norm(p.finalUrl), p]));
  const internalTargetsBroken: { from: string; to: string }[] = [];
  for (const p of pages) {
    for (const to of p.internalLinks ?? []) {
      const target = pages.find((x) => norm(x.finalUrl) === norm(to) || norm(x.url) === norm(to));
      if (target && target.status >= 400) internalTargetsBroken.push({ from: p.finalUrl, to });
    }
  }
  if (internalTargetsBroken.length) push({ category: 'links', ruleKey: 'broken_internal_link', severity: 'High', title: `${internalTargetsBroken.length} internal link(s) point to error pages`, description: 'Links to 4xx/5xx waste crawl budget and harm UX.', evidence: { samples: internalTargetsBroken.slice(0, 15) } });

  const deadExternal = ctx.externalLinkStatus.filter((e) => e.status >= 400 || e.status === 0);
  if (deadExternal.length) push({ category: 'links', ruleKey: 'broken_external_link', severity: 'Medium', title: `${deadExternal.length} external link(s) unreachable`, description: 'Outbound links checked live by our crawler returned errors.', evidence: { checkedLive: true, samples: deadExternal.slice(0, 15) } });

  /* ---- orphans & depth ---- */
  const orphans = okPages.filter((p) => p.depth > 0 && (p.inlinkCount ?? 0) === 0 && !p.redirected);
  if (orphans.length) push({ category: 'links', ruleKey: 'orphan_candidates', severity: 'Medium', title: `${orphans.length} orphan-signal page(s)`, description: 'Pages reachable via sitemap/crawl with zero discovered internal inlinks.', evidence: { method: 'inlink count over discovered link graph', urls: orphans.slice(0, 20).map((p) => p.finalUrl) } });
  const deep = okPages.filter((p) => p.depth > DEEP_LEVEL);
  if (deep.length) push({ category: 'links', ruleKey: 'deep_pages', severity: 'Low', title: `${deep.length} page(s) deeper than ${DEEP_LEVEL} clicks`, description: 'Deep pages receive less link equity and crawl attention.', evidence: { maxDepthFound: Math.max(...okPages.map((p) => p.depth ?? 0)), urls: deep.slice(0, 15).map((p) => p.finalUrl) } });

  /* ---- structured data / images ---- */
  const noSchema = okPages.filter((p) => !(p.structuredDataTypes ?? []).length);
  if (noSchema.length && okPages.length) push({ category: 'structured-data', ruleKey: 'no_structured_data', severity: 'Low', title: 'No structured data detected on crawled pages', description: 'JSON-LD schema improves eligibility for rich results.', evidence: { pagesWithout: noSchema.length, pagesCrawled: okPages.length } });
  const badHreflang = okPages.filter((p) => (p.hreflang ?? []).some((h) => !/^[a-z]{2}(-[a-zA-Z]{2})?$|x-default/.test(h.lang)));
  if (badHreflang.length) push({ category: 'structured-data', ruleKey: 'invalid_hreflang', severity: 'Medium', title: `${badHreflang.length} page(s) with malformed hreflang values`, description: 'hreflang language codes failed format validation.', evidence: { urls: badHreflang.slice(0, 10).map((p) => p.finalUrl) } });
  const missingAlt = okPages.filter((p) => (p.imagesMissingAlt ?? 0) > 0);
  if (missingAlt.length) push({ category: 'content', ruleKey: 'images_missing_alt', severity: 'Low', title: `${missingAlt.length} page(s) have images without alt text`, description: 'Measured count of <img> tags with empty or missing alt attributes.', evidence: { samples: missingAlt.slice(0, 15).map((p) => ({ url: p.finalUrl, missingAlt: p.imagesMissingAlt, imagesTotal: p.imagesTotal })) } });

  /* ---- performance (measured only) ---- */
  const slow = okPages.filter((p) => (p.ttfbMs ?? 0) > SLOW_TTFB);
  if (slow.length) push({ category: 'performance', ruleKey: 'slow_response', severity: 'Medium', title: `${slow.length} page(s) with TTFB over ${SLOW_TTFB}ms`, description: 'Time-to-first-byte measured directly by our crawler.', evidence: { measured: 'TTFB (ms), HTML fetch only', pages: slow.slice(0, 15).map((p) => ({ url: p.finalUrl, ttfbMs: p.ttfbMs })) } });
  const heavy = okPages.filter((p) => (p.pageSizeBytes ?? 0) > BIG_HTML);
  if (heavy.length) push({ category: 'performance', ruleKey: 'large_html', severity: 'Low', title: `${heavy.length} page(s) with HTML over ${Math.round(BIG_HTML / 1000)}KB`, description: 'Large HTML documents slow parsing and rendering.', evidence: { measured: 'HTML bytes fetched', pages: heavy.slice(0, 15).map((p) => ({ url: p.finalUrl, bytes: p.pageSizeBytes })) } });

  return issues;
}

/** Webamazee Technical SEO Score — transparent formula over open-issue severities.
 *  NOT a Google ranking score. */
export function computeScore(issues: { severity: string }[]): { score: number; formula: string } {
  const W: Record<string, number> = { Critical: 6, High: 4, Medium: 1.5, Low: 0.5, Informational: 0 };
  const penalty = issues.reduce((a, i) => a + (W[i.severity] ?? 0), 0);
  return { score: Math.max(0, Math.round(100 - penalty)), formula: '100 − (Critical×6 + High×4 + Medium×1.5 + Low×0.5) over open measured issues' };
}

export const _ids = { orgId: null as unknown as Types.ObjectId }; // type helper (no runtime use)
