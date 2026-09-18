import * as cheerio from 'cheerio';

export interface SitemapInfo {
  exists: boolean;
  url?: string;
  urls: string[];
  isIndex: boolean;
  error?: string;
}

/** Fetch and parse a sitemap (supports one level of sitemap index). */
export async function fetchSitemap(candidates: string[], maxUrls = 200): Promise<SitemapInfo> {
  for (const candidate of candidates.slice(0, 4)) {
    try {
      const res = await fetch(candidate, {
        signal: AbortSignal.timeout(12_000),
        headers: { 'user-agent': 'Webamazee-AgentOS-Crawler/1.0 (+https://webamazee.com)' },
      });
      if (!res.ok) continue;
      const body = await res.text();
      if (!body.includes('<')) continue;
      const $ = cheerio.load(body, { xmlMode: true });
      const locs = $('url > loc').map((_, el) => $(el).text().trim()).get();
      if (locs.length > 0) {
        return { exists: true, url: candidate, urls: locs.slice(0, maxUrls), isIndex: false };
      }
      const indexes = $('sitemap > loc').map((_, el) => $(el).text().trim()).get();
      if (indexes.length > 0) {
        // Follow the first few child sitemaps
        const all: string[] = [];
        for (const child of indexes.slice(0, 5)) {
          try {
            const r2 = await fetch(child, { signal: AbortSignal.timeout(12_000) });
            if (!r2.ok) continue;
            const b2 = await r2.text();
            const $2 = cheerio.load(b2, { xmlMode: true });
            all.push(...$2('url > loc').map((_, el) => $2(el).text().trim()).get());
            if (all.length >= maxUrls) break;
          } catch {
            /* skip broken child sitemap */
          }
        }
        if (all.length > 0) {
          return { exists: true, url: candidate, urls: all.slice(0, maxUrls), isIndex: true };
        }
      }
    } catch (e) {
      return { exists: false, urls: [], isIndex: false, error: (e as Error).message };
    }
  }
  return { exists: false, urls: [], isIndex: false };
}
