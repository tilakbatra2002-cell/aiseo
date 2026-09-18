import { randomUUID } from 'crypto';
import { fetchRobots, isAllowed, type RobotsInfo } from './robots';
import { fetchSitemap, type SitemapInfo } from './sitemap';
import { parsePage } from './parse';
import { env } from '@/lib/env';

const UA = 'Webamazee-AgentOS-Crawler/1.0 (+https://webamazee.com)';

export interface CrawledPage {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  redirected: boolean;
  redirectChain: string[];
  depth: number;
  ttfbMs: number;
  contentType: string;
  error?: string;
  notModified?: boolean;        // 304 — body identical to previous conditional fetch
  etag?: string;
  lastModified?: string;
  pageSizeBytes?: number;
  rawHtml?: string;             // capped; used by SEO intelligence for raw evidence
  parsed?: ReturnType<typeof parsePage>;
}

export interface CrawlResult {
  crawlId: string;
  origin: string;
  host: string;
  startedAt: Date;
  completedAt: Date;
  pages: CrawledPage[];
  robots: RobotsInfo;
  sitemap: SitemapInfo;
  errors: string[];
  pagesRequested: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Incremental-crawl support: previous {url→{etag,lastModified}} enables conditional
 *  re-fetch (HTTP 304 ⇒ body identical); rawCapture stores capped raw HTML evidence. */
export interface FetchOpts {
  conditional?: Map<string, { etag?: string | null; lastModified?: string | null }>;
  rawCapture?: boolean;
  seedUrls?: string[];
}

async function fetchPage(url: string, depth: number, retries = 1, opts?: FetchOpts): Promise<CrawledPage> {
  const started = Date.now();
  const prev = opts?.conditional?.get(new URL(url).toString());
  const headers: Record<string, string> = { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' };
  if (prev?.etag) headers['if-none-match'] = prev.etag;
  if (prev?.lastModified) headers['if-modified-since'] = prev.lastModified;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      const ttfbMs = Date.now() - started;
      const contentType = res.headers.get('content-type') || '';
      const finalUrl = res.url || url;
      const etag = res.headers.get('etag') ?? undefined;
      const lastModified = res.headers.get('last-modified') ?? undefined;
      if (res.status === 304) {
        return { url, finalUrl, status: 304, ok: true, redirected: false, redirectChain: [url], depth, ttfbMs, contentType, notModified: true };
      }
      if (!contentType.includes('html')) {
        return {
          url, finalUrl, status: res.status, ok: res.ok, redirected: finalUrl !== url,
          redirectChain: finalUrl !== url ? [url, finalUrl] : [url], depth, ttfbMs, contentType, etag, lastModified,
        };
      }
      const html = (await res.text()).slice(0, 2_000_000);
      return {
        url, finalUrl, status: res.status, ok: res.ok, redirected: finalUrl !== url,
        redirectChain: finalUrl !== url ? [url, finalUrl] : [url], depth, ttfbMs,
        contentType, etag, lastModified, pageSizeBytes: html.length,
        rawHtml: opts?.rawCapture ? html.slice(0, 30_000) : undefined,
        parsed: parsePage(html, finalUrl, new URL(finalUrl).host),
      };
    } catch (e) {
      if (attempt === retries) {
        return {
          url, finalUrl: url, status: 0, ok: false, redirected: false, redirectChain: [url],
          depth, ttfbMs: Date.now() - started, contentType: '', error: (e as Error).message,
        };
      }
      await sleep(500 * (attempt + 1)); // backoff
    }
  }
  throw new Error('unreachable');
}

/**
 * Real website crawler: BFS from the homepage, seeded with sitemap URLs.
 * Respects robots.txt, rate limits, concurrency limits and timeouts.
 */
export async function crawlSite(website: string, opts?: {
  maxPages?: number;
  concurrency?: number;
  delayMs?: number;
  conditional?: Map<string, { etag?: string | null; lastModified?: string | null }>;
  rawCapture?: boolean;
  /** URLs known from a previous crawl — incremental crawls re-check them even when
   *  all linking pages were 304 (prevents frontier shrink). */
  seedUrls?: string[];
  onPage?: (page: CrawledPage, done: number) => Promise<void> | void;
}): Promise<CrawlResult> {
  const maxPages = Math.min(opts?.maxPages ?? env.CRAWL_MAX_PAGES, 60);
  const concurrency = Math.max(1, opts?.concurrency ?? env.CRAWL_CONCURRENCY);
  const baseDelay = opts?.delayMs ?? env.CRAWL_DELAY_MS;

  const normalized = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const url0 = new URL(normalized);
  const origin = url0.origin;
  const host = url0.host;
  const crawlId = `crawl_${randomUUID().slice(0, 8)}`;
  const startedAt = new Date();
  const errors: string[] = [];

  const robots = await fetchRobots(origin);
  const delay = Math.max(baseDelay, robots.crawlDelayMs ?? 0);
  const sitemap = await fetchSitemap([
    ...robots.sitemapUrls,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/wp-sitemap.xml`,
  ]);

  const queue: { url: string; depth: number }[] = [{ url: origin + '/', depth: 0 }];
  for (const u of sitemap.urls.slice(0, maxPages * 2)) {
    try {
      if (new URL(u).host === host) queue.push({ url: u, depth: 1 });
    } catch { /* ignore */ }
  }
  for (const u of (opts?.seedUrls ?? [])) {
    try {
      if (queue.length < maxPages * 4 && new URL(u).host === host) queue.push({ url: u, depth: 1 });
    } catch { /* ignore */ }
  }

  const seen = new Set<string>();
  const pages: CrawledPage[] = [];
  let idx = 0;

  const norm = (u: string) => {
    try {
      const p = new URL(u);
      p.hash = '';
      let s = p.toString();
      if (s.endsWith('/') && p.pathname !== '/') s = s.slice(0, -1);
      return s;
    } catch {
      return u;
    }
  };

  async function worker() {
    while (idx < queue.length && pages.length < maxPages) {
      const item = queue[idx++];
      if (!item) break;
      const key = norm(item.url);
      if (seen.has(key)) continue;
      seen.add(key);

      let path = '/';
      try { path = new URL(item.url).pathname; } catch { continue; }
      if (!isAllowed(robots, path)) continue;
      if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js|ico|xml)(\?|$)/i.test(path)) continue;

      const page = await fetchPage(item.url, item.depth, 1, { conditional: opts?.conditional, rawCapture: opts?.rawCapture });
      pages.push(page);
      if (opts?.onPage) await opts.onPage(page, pages.length);
      if (page.error) errors.push(`${item.url}: ${page.error}`);

      if (page.ok && page.parsed && item.depth < 4) {
        for (const link of page.parsed.internalLinks) {
          const k = norm(link);
          if (!seen.has(k) && queue.length < maxPages * 3) {
            try {
              if (new URL(link).host === host) queue.push({ url: link, depth: item.depth + 1 });
            } catch { /* ignore */ }
          }
        }
      }
      await sleep(delay);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return {
    crawlId, origin, host, startedAt,
    completedAt: new Date(),
    pages, robots, sitemap,
    errors: errors.slice(0, 25),
    pagesRequested: idx,
  };
}

/** Single-page fetch used by the QA agent for verification. */
export async function fetchSinglePage(url: string): Promise<CrawledPage> {
  return fetchPage(url, 0, 2, { rawCapture: true });
}
