import type { CrawlResult, CrawledPage } from './crawler';

export interface RawFinding {
  ruleKey: string;
  category: string;
  title: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
  url?: string;
  evidence: { description: string; data?: Record<string, unknown> };
  recommendedAction: string;
  impact: number;
  effort: number;
  confidence: number;
  risk: number;
}

/**
 * Deterministic SEO audit rules. Every finding is derived from real crawl
 * data and carries verifiable evidence. Nothing is fabricated.
 */
export function analyzeCrawl(crawl: CrawlResult): RawFinding[] {
  const findings: RawFinding[] = [];
  const htmlPages = crawl.pages.filter((p) => p.parsed);
  const origin = crawl.origin;

  /* ---------- Site-level ---------- */
  if (!crawl.robots.exists) {
    findings.push({
      ruleKey: 'robots_missing', category: 'technical', title: 'robots.txt not found',
      severity: 'Low', url: `${origin}/robots.txt`,
      evidence: { description: `GET ${origin}/robots.txt did not return a robots.txt file.` },
      recommendedAction: 'Publish a robots.txt declaring crawl rules and sitemap location.',
      impact: 2, effort: 1, confidence: 5, risk: 1,
    });
  }
  if (crawl.robots.blocksAll) {
    findings.push({
      ruleKey: 'robots_blocks_all', category: 'technical', title: 'robots.txt blocks the entire site',
      severity: 'Critical', url: `${origin}/robots.txt`,
      evidence: { description: 'robots.txt contains "Disallow: /" applying to this crawler.', data: { disallows: crawl.robots.disallows } },
      recommendedAction: 'Review robots.txt immediately; remove the blanket disallow for search crawlers.',
      impact: 5, effort: 1, confidence: 5, risk: 1,
    });
  }
  if (!crawl.sitemap.exists) {
    findings.push({
      ruleKey: 'sitemap_missing', category: 'technical', title: 'XML sitemap not detected',
      severity: 'Medium', url: `${origin}/sitemap.xml`,
      evidence: { description: 'No sitemap found via robots.txt or standard sitemap locations.' },
      recommendedAction: 'Generate an XML sitemap and reference it in robots.txt.',
      impact: 3, effort: 2, confidence: 5, risk: 1,
    });
  }

  const siteHasSchema = htmlPages.some((p) => (p.parsed?.structuredDataTypes.length ?? 0) > 0);
  if (htmlPages.length > 0 && !siteHasSchema) {
    findings.push({
      ruleKey: 'no_structured_data', category: 'technical', title: 'No structured data detected',
      severity: 'Medium', url: htmlPages[0].finalUrl,
      evidence: { description: `None of the ${htmlPages.length} crawled pages expose JSON-LD structured data.` },
      recommendedAction: 'Add Organization/LocalBusiness and page-type schema markup.',
      impact: 3, effort: 3, confidence: 4, risk: 1,
    });
  }

  /* ---------- Per-page rules ---------- */
  const titles = new Map<string, string[]>();
  const metas = new Map<string, string[]>();
  for (const p of htmlPages) {
    const t = p.parsed!.title;
    const m = p.parsed!.metaDescription;
    if (t) titles.set(t, [...(titles.get(t) ?? []), p.finalUrl]);
    if (m) metas.set(m, [...(metas.get(m) ?? []), p.finalUrl]);
  }

  for (const p of crawl.pages) {
    const pz = p.parsed;
    if (p.error || p.status === 0) continue;
    if (p.status >= 400) {
      findings.push({
        ruleKey: 'http_error', category: 'technical',
        title: `Page returns HTTP ${p.status}`, severity: p.status >= 500 ? 'Critical' : 'High', url: p.url,
        evidence: { description: `Crawl of ${p.url} returned HTTP status ${p.status}.`, data: { status: p.status, finalUrl: p.finalUrl } },
        recommendedAction: 'Restore the page or add a 301 redirect to the closest equivalent URL.',
        impact: 5, effort: 2, confidence: 5, risk: 1,
      });
      continue;
    }
    if (!pz) continue;

    if (!pz.title) {
      findings.push({
        ruleKey: 'missing_title', category: 'onpage', title: 'Missing title tag', severity: 'High', url: p.finalUrl,
        evidence: { description: 'No <title> element found in the live HTML.' },
        recommendedAction: 'Add a unique, descriptive title tag (30–60 characters).',
        impact: 4, effort: 1, confidence: 5, risk: 1,
      });
    } else {
      if (pz.titleLength > 60) {
        findings.push({
          ruleKey: 'title_too_long', category: 'onpage', title: `Title too long (${pz.titleLength} chars)`,
          severity: 'Medium', url: p.finalUrl,
          evidence: { description: `Title is ${pz.titleLength} characters: "${pz.title.slice(0, 90)}…"` },
          recommendedAction: 'Shorten the title to under ~60 characters keeping the primary keyword first.',
          impact: 3, effort: 1, confidence: 4, risk: 1,
        });
      }
      if (pz.titleLength > 0 && pz.titleLength < 20) {
        findings.push({
          ruleKey: 'title_too_short', category: 'onpage', title: `Title too short (${pz.titleLength} chars)`,
          severity: 'Low', url: p.finalUrl,
          evidence: { description: `Title "${pz.title}" is only ${pz.titleLength} characters.` },
          recommendedAction: 'Expand the title to describe the page and earn clicks.',
          impact: 2, effort: 1, confidence: 3, risk: 1,
        });
      }
    }

    if (!pz.metaDescription) {
      findings.push({
        ruleKey: 'missing_meta', category: 'onpage', title: 'Missing meta description', severity: 'Medium', url: p.finalUrl,
        evidence: { description: 'No meta[name="description"] found in the live HTML.' },
        recommendedAction: 'Write a compelling 70–160 character meta description.',
        impact: 3, effort: 1, confidence: 5, risk: 1,
      });
    } else if (pz.metaDescriptionLength > 160) {
      findings.push({
        ruleKey: 'meta_too_long', category: 'onpage', title: `Meta description too long (${pz.metaDescriptionLength} chars)`,
        severity: 'Low', url: p.finalUrl,
        evidence: { description: `Meta description is ${pz.metaDescriptionLength} characters.` },
        recommendedAction: 'Trim the meta description to ~160 characters.',
        impact: 2, effort: 1, confidence: 4, risk: 1,
      });
    }

    if (pz.h1.length === 0) {
      findings.push({
        ruleKey: 'missing_h1', category: 'onpage', title: 'Missing H1 heading', severity: 'Medium', url: p.finalUrl,
        evidence: { description: 'No <h1> element found in the live HTML.' },
        recommendedAction: 'Add a single clear H1 that matches the page topic.',
        impact: 3, effort: 1, confidence: 5, risk: 1,
      });
    } else if (pz.h1.length > 1) {
      findings.push({
        ruleKey: 'multiple_h1', category: 'onpage', title: `${pz.h1.length} H1 headings found`, severity: 'Low', url: p.finalUrl,
        evidence: { description: `Found ${pz.h1.length} H1 elements: ${pz.h1.slice(0, 3).map((h) => `"${h.slice(0, 40)}"`).join(', ')}` },
        recommendedAction: 'Keep a single H1 per page; demote the rest to H2.',
        impact: 2, effort: 1, confidence: 4, risk: 1,
      });
    }

    if (!pz.canonical) {
      findings.push({
        ruleKey: 'missing_canonical', category: 'technical', title: 'Missing canonical tag', severity: 'Low', url: p.finalUrl,
        evidence: { description: 'No rel="canonical" found in the live HTML.' },
        recommendedAction: 'Add a self-referencing canonical URL.',
        impact: 2, effort: 1, confidence: 5, risk: 1,
      });
    } else {
      try {
        const cu = new URL(pz.canonical, p.finalUrl);
        if (cu.toString() !== p.finalUrl && cu.pathname.replace(/\/$/, '') !== new URL(p.finalUrl).pathname.replace(/\/$/, '')) {
          findings.push({
            ruleKey: 'canonical_mismatch', category: 'technical', title: 'Canonical points elsewhere', severity: 'Medium', url: p.finalUrl,
            evidence: { description: `Canonical is "${pz.canonical}" but the live URL is "${p.finalUrl}".` },
            recommendedAction: 'Verify this canonicalization is intentional and the canonical target returns 200.',
            impact: 3, effort: 2, confidence: 4, risk: 2,
          });
        }
      } catch { /* bad canonical */ }
    }

    if (pz.noindex) {
      findings.push({
        ruleKey: 'noindex_page', category: 'technical', title: 'Page is noindexed', severity: 'High', url: p.finalUrl,
        evidence: { description: `Meta robots: "${pz.robotsMeta}".` },
        recommendedAction: 'Confirm this page should be excluded from indexing; remove noindex if not.',
        impact: 5, effort: 1, confidence: 5, risk: 1,
      });
    }

    if (pz.wordCount < 200) {
      findings.push({
        ruleKey: 'thin_content', category: 'content', title: `Thin content (${pz.wordCount} words)`, severity: 'Medium', url: p.finalUrl,
        evidence: { description: `Only ~${pz.wordCount} words of visible body text were extracted.` },
        recommendedAction: 'Expand the page with useful, original content addressing searcher intent.',
        impact: 3, effort: 3, confidence: 4, risk: 1,
      });
    }

    if (pz.imagesTotal >= 3 && pz.imagesMissingAlt / Math.max(1, pz.imagesTotal) > 0.5) {
      findings.push({
        ruleKey: 'images_missing_alt', category: 'onpage', title: `${pz.imagesMissingAlt}/${pz.imagesTotal} images missing alt text`,
        severity: 'Low', url: p.finalUrl,
        evidence: { description: `${pz.imagesMissingAlt} of ${pz.imagesTotal} images have empty or missing alt attributes.` },
        recommendedAction: 'Add descriptive alt text to meaningful images.',
        impact: 2, effort: 2, confidence: 5, risk: 1,
      });
    }

    if (p.ttfbMs > 2500) {
      findings.push({
        ruleKey: 'slow_response', category: 'technical', title: `Slow server response (${p.ttfbMs} ms)`, severity: 'Medium', url: p.finalUrl,
        evidence: { description: `Time to first byte measured at ${p.ttfbMs} ms during crawl.` },
        recommendedAction: 'Investigate hosting, caching and server-side performance.',
        impact: 3, effort: 3, confidence: 4, risk: 1,
      });
    }

    if (p.depth > 3) {
      findings.push({
        ruleKey: 'deep_page', category: 'links', title: `Page is ${p.depth} clicks deep`, severity: 'Low', url: p.finalUrl,
        evidence: { description: `Reached at crawl depth ${p.depth} from the homepage.` },
        recommendedAction: 'Link this page from higher-level pages to reduce crawl depth.',
        impact: 2, effort: 2, confidence: 4, risk: 1,
      });
    }
  }

  /* ---------- Cross-page rules ---------- */
  for (const [title, urls] of titles) {
    if (urls.length > 1) {
      findings.push({
        ruleKey: 'duplicate_title', category: 'onpage', title: `Duplicate title on ${urls.length} pages`, severity: 'High', url: origin,
        evidence: { description: `Title "${title.slice(0, 70)}" appears on ${urls.length} pages.`, data: { urls: urls.slice(0, 10) } },
        recommendedAction: 'Give each page a unique title aligned to its primary keyword.',
        impact: 4, effort: 2, confidence: 5, risk: 1,
      });
    }
  }
  for (const [meta, urls] of metas) {
    if (urls.length > 1 && meta.length > 20) {
      findings.push({
        ruleKey: 'duplicate_meta', category: 'onpage', title: `Duplicate meta description on ${urls.length} pages`, severity: 'Medium', url: origin,
        evidence: { description: `The same meta description appears on ${urls.length} pages.`, data: { urls: urls.slice(0, 10) } },
        recommendedAction: 'Write unique meta descriptions per page.',
        impact: 3, effort: 2, confidence: 5, risk: 1,
      });
    }
  }

  // Broken internal links (targets with HTTP errors discovered during crawl)
  const statusByUrl = new Map(crawl.pages.map((p) => [p.finalUrl.replace(/\/$/, ''), p.status]));
  for (const p of htmlPages) {
    for (const link of p.parsed!.internalLinks) {
      const st = statusByUrl.get(link.replace(/\/$/, ''));
      if (st !== undefined && st >= 400) {
        findings.push({
          ruleKey: 'broken_internal_link', category: 'links', title: `Broken internal link (HTTP ${st})`, severity: 'High', url: p.finalUrl,
          evidence: { description: `${p.finalUrl} links to ${link}, which returned HTTP ${st}.`, data: { target: link, status: st } },
          recommendedAction: 'Update or remove the broken link; redirect the dead target if appropriate.',
          impact: 4, effort: 1, confidence: 5, risk: 1,
        });
      }
    }
  }

  // Orphan-ish pages: in sitemap but zero internal inbound links seen in crawl
  const inbound = new Map<string, number>();
  for (const p of htmlPages) {
    for (const link of new Set(p.parsed!.internalLinks)) {
      const k = link.replace(/\/$/, '');
      inbound.set(k, (inbound.get(k) ?? 0) + 1);
    }
  }
  for (const u of crawl.sitemap.urls.slice(0, 100)) {
    const k = u.replace(/\/$/, '');
    if (!inbound.has(k) && statusByUrl.get(k) !== undefined) {
      findings.push({
        ruleKey: 'possible_orphan_page', category: 'links', title: 'Possible orphan page', severity: 'Medium', url: u,
        evidence: { description: `${u} is in the sitemap but no internal links to it were found in the crawl.` },
        recommendedAction: 'Add internal links from relevant parent/category pages.',
        impact: 3, effort: 2, confidence: 3, risk: 1,
      });
    }
  }

  return findings;
}
