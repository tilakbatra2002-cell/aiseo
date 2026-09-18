import * as cheerio from 'cheerio';

export interface ParsedPage {
  title: string;
  titleLength: number;
  metaDescription: string;
  metaDescriptionLength: number;
  canonical: string;
  robotsMeta: string;
  noindex: boolean;
  h1: string[];
  headings: { level: string; text: string }[];
  wordCount: number;
  imagesTotal: number;
  imagesMissingAlt: number;
  internalLinks: string[];
  externalLinks: string[];
  structuredDataTypes: string[];
  hreflang: { lang: string; href: string }[];
  og: Record<string, string>;
}

export function parsePage(html: string, pageUrl: string, siteHost: string): ParsedPage {
  const $ = cheerio.load(html);

  const title = ($('title').first().text() || '').trim();
  const metaDescription = ($('meta[name="description"]').attr('content') || '').trim();
  const canonical = ($('link[rel="canonical"]').attr('href') || '').trim();
  const robotsMeta = ($('meta[name="robots"]').attr('content') || '').trim();
  const noindex = /noindex/i.test(robotsMeta);

  const h1 = $('h1').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean);
  const headings = $('h1,h2,h3')
    .map((_, el) => ({ level: el.tagName.toLowerCase(), text: $(el).text().replace(/\s+/g, ' ').trim() }))
    .get()
    .filter((h) => h.text)
    .slice(0, 120);

  // word count over visible body text
  const text = $('body').clone().find('script,style,noscript').remove().end().text();
  const wordCount = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

  const imgs = $('img').get();
  const imagesTotal = imgs.length;
  const imagesMissingAlt = imgs.filter((el) => {
    const alt = $(el).attr('alt');
    return alt === undefined || alt.trim() === '';
  }).length;

  const internal = new Set<string>();
  const external = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) return;
    try {
      const abs = new URL(href, pageUrl);
      abs.hash = '';
      const s = abs.toString();
      if (abs.host === siteHost) internal.add(s);
      else if (/^https?:$/.test(abs.protocol)) external.add(s);
    } catch {
      /* bad link ignored */
    }
  });

  const structuredDataTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text());
      const items = Array.isArray(data) ? data : data['@graph'] ?? [data];
      for (const item of items as Record<string, unknown>[]) {
        const t = item?.['@type'];
        if (typeof t === 'string') structuredDataTypes.push(t);
        else if (Array.isArray(t)) structuredDataTypes.push(...(t as string[]));
      }
    } catch {
      /* invalid JSON-LD */
    }
  });

  const hreflang = $('link[rel="alternate"][hreflang]')
    .map((_, el) => ({ lang: $(el).attr('hreflang') || '', href: $(el).attr('href') || '' }))
    .get();

  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const p = $(el).attr('property');
    const c = $(el).attr('content');
    if (p && c) og[p] = c.slice(0, 300);
  });

  return {
    title,
    titleLength: title.length,
    metaDescription,
    metaDescriptionLength: metaDescription.length,
    canonical,
    robotsMeta,
    noindex,
    h1,
    headings,
    wordCount,
    imagesTotal,
    imagesMissingAlt,
    internalLinks: [...internal].slice(0, 300),
    externalLinks: [...external].slice(0, 100),
    structuredDataTypes: [...new Set(structuredDataTypes)],
    hreflang,
    og,
  };
}
