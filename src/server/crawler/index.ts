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

async function fetchPage(url: string, depth: number, retries = 1): Promise<CrawledPage> {
  const started = Date.now();
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      const ttfbMs = Date.now() - started;
      const contentType = res.headers.get('content-type') || '';
      const finalUrl = res.url || url;
      if (!contentType.includes('html')) {
        return {
          url, finalUrl, status: res.status, ok: res.ok, redirected: finalUrl !== url,
          redirectChain: finalUrl !== url ? [url, finalUrl] : [url], depth, ttfbMs, contentType,
        };
      }
      const html = (await res.text()).slice(0, 2_000_000);
      return {
        url, finalUrl, status: res.status, ok: res.ok, redirected: finalUrl !== url,
        redirectChain: finalUrl !== url ? [url, finalUrl] : [url], depth, ttfbMs,
        contentType, parsed: parsePage(html, finalUrl, new URL(finalUrl).host),
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

      const page = await fetchPage(item.url, item.depth);
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
  return fetchPage(url, 0, 2);
}
