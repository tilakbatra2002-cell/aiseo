export interface RobotsInfo {
  exists: boolean;
  raw: string;
  sitemapUrls: string[];
  disallows: string[];
  allows: string[];
  crawlDelayMs?: number;
  blocksAll: boolean;
}

export async function fetchRobots(origin: string): Promise<RobotsInfo> {
  const url = `${origin}/robots.txt`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'user-agent': 'Webamazee-AgentOS-Crawler/1.0 (+https://webamazee.com)' },
      redirect: 'follow',
    });
    if (!res.ok) {
      return { exists: false, raw: '', sitemapUrls: [], disallows: [], allows: [], blocksAll: false };
    }
    const raw = await res.text();
    const sitemapUrls: string[] = [];
    const disallows: string[] = [];
    const allows: string[] = [];
    let blocksAll = false;
    let appliesToUs = true; // naive group handling
    let crawlDelayMs: number | undefined;

    for (const line of raw.split('\n')) {
      const clean = line.replace(/#.*$/, '').trim();
      if (!clean) continue;
      const idx = clean.indexOf(':');
      if (idx < 0) continue;
      const key = clean.slice(0, idx).trim().toLowerCase();
      const value = clean.slice(idx + 1).trim();
      if (key === 'user-agent') {
        appliesToUs = value === '*' || /agentos|webamazee/i.test(value);
      } else if (key === 'sitemap') {
        sitemapUrls.push(value);
      } else if (appliesToUs && key === 'disallow' && value) {
        disallows.push(value);
        if (value === '/') blocksAll = true;
      } else if (appliesToUs && key === 'allow' && value) {
        allows.push(value);
      } else if (appliesToUs && key === 'crawl-delay') {
        const s = Number(value);
        if (!Number.isNaN(s)) crawlDelayMs = Math.min(s * 1000, 5000);
      }
    }
    return { exists: true, raw: raw.slice(0, 8000), sitemapUrls, disallows, allows, crawlDelayMs, blocksAll };
  } catch {
    return { exists: false, raw: '', sitemapUrls: [], disallows: [], allows: [], blocksAll: false };
  }
}

export function isAllowed(robots: RobotsInfo, path: string): boolean {
  if (!robots.exists) return true;
  // longest-match wins; allow beats disallow of same length
  let bestLen = -1;
  let allowed = true;
  for (const rule of robots.disallows) {
    if (rule && path.startsWith(rule) && rule.length > bestLen) {
      bestLen = rule.length;
      allowed = false;
    }
  }
  for (const rule of robots.allows) {
    if (rule && path.startsWith(rule) && rule.length >= bestLen) {
      bestLen = rule.length;
      allowed = true;
    }
  }
  return allowed;
}
