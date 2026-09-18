# Webamazee SEO Intelligence — Final Report (§33)

**Date:** 2026-09-18 · **Build:** `next build` ✓ (Next.js 14.2.7, 38 static pages, all routes compiled) · **TypeScript:** `tsc --noEmit` ✓ clean

---

## 1. What was built

**Webamazee SEO Intelligence** — a new major module on the existing AgentOS (strictly additive; no existing module/agent/workflow/auth/UI/deploy was removed, renamed, or regressed).

Own data engine, exactly the specified pipeline:

**Website → Webamazee Crawler → Raw Data → Processing → Intelligence DB → AI → Reports → Agents**

- **Own crawler** (`src/server/crawler/*` + `src/server/seo/crawl-engine.ts`): robots.txt + crawl-delay respected, sitemap discovery (robots `Sitemap:` + `/sitemap.xml`, sitemap_index variants), BFS with URL normalization/dedup, depth limit, redirect chains, TTFB/size capture, content hashing, concurrency/retries/timeout/delay, queue via the existing Job worker (`seo_crawl` job type, dedupeKey, maxAttempts).
- **Incremental crawls**: conditional re-fetch (ETag/If-None-Match, Last-Modified/If-Modified-Since); 304 ⇒ stored row reuse. **Verified live**: 6 of 7 pages returned 304 and the crawl finished in ~0.7s with rows and link graph intact.
- **Processing** (`src/server/seo/issues.ts`): deterministic measured rules → technical, content, performance, links, indexability, structured-data categories; severities Critical/High/Medium/Low/Informational.
- **Webamazee Technical SEO Score**: `100 − (Critical×6 + High×4 + Medium×1.5 + Low×0.5)` over open measured issues, always displayed with the disclaimer that it is an internal score, *not a Google ranking score*.
- **Intelligence DB** (§22): new MongoDB models — `Crawl`, `CrawlLink`, `SEOIssue`, `Keyword`, `KeywordObservation`, `RankingObservation`, `Competitor`, `Backlink`, `BacklinkImport`, `GSCProperty`, `GSCQuery`, `GSCPage`, `GSCMetricSnapshot`, `AnalyticsSnapshot`, `SEOChange`, `SEOSnapshot` (plus existing `CrawlPage` extended additively: etag/lastModified/rawHtmlExcerpt/contentHash/inlinkCount/outlinkCount/moduleData/dataSource). Indexes on project/domain/url/keyword/date/source. `CrawlPage` remains the shared collection AI agents consume.
- **Change detection** (§18): title/canonical/meta-robots/status/H1/schema/content/robots.txt/sitemap/links changes + pages added/removed, per crawl pair (`crawlId`/`vsCrawlId`) — **verified live** (editing the test site title produced a `title_changed` record with before/after values; the crawl-to-crawl delta returned score 74→86→89).
- **Historical snapshots** (§17): immutable `SEOSnapshot` per completed crawl (score, status classes, indexable, links, averages, issues by severity/category).

## 2. AI & agents (§19/20/30/31)

- `runTeamHeadReview` now loads open `SEOIssue`s + last self `Crawl` through `ctx.tool('seo_intelligence', …)` and emits `seoIntelligence` in its task output; its delegation rationale now references measured internal-link/indexability signals. **Verified live**: task result contains `seoIntelligence {openIssues: 7, bySeverity, byCategory, crawl{score: 89, …}}` and plan rationale “…1 internal-linking signal(s) from findings + SEO Intelligence (1 indexability)”.
- Crawl issues are bridged (dedup-capped) into agent `Finding`s, so every existing specialist (audit/onpage/offpage…) sees them through the channel they already consume; `storeCrawl`’s destructive project-wide delete was scoped to the team’s own previous crawl so specialist runs no longer wipe SEO Intelligence rows (and vice versa).
- `seo_intelligence` registered in the tool registry (`Crawl` category).

## 3. API routes (§21) — all org-scoped + auth-guarded

`/api/seo/crawl` (POST enqueue · GET list/id) · `audit` · `pages` + `pages/[id]` · `keywords` + `keywords/[id]` · `competitors` (list/compare/add) + `competitors/[id]` · `content-gap` · `internal-links` · `backlinks` (Explorer + CSV import) · `gsc` (status/auth-url/sync) · `gsc/callback` · `gsc/data` · `analytics` · `history` (snapshots/changes/compare) · `reports` (list + generate → existing `/app/reports/[id]` renderer reused — zero changes to it).

## 4. UI (§28–29) — 16 pages under `/app/seo`

Overview · Site Audit · Site Explorer · Pages · Page detail (+raw-HTML evidence toggle, in/out links, issues) · Keywords · Rankings · Competitors (+measured compare table) · Content Gap (Observed vs AI-derived, AI panel only when an AI provider is enabled) · Internal Links (+radial SVG link graph) · Backlinks (CSV import, **Discovered Backlinks** label + disclaimer) · Search Console · SEO Analytics · History (trend chart + A/B crawl compare) · SEO Reports · index redirect.

- Sidebar gained an **“SEO Intelligence”** group with all 14 items per §28.
- Design system preserved: `var(--*)` colors only (primary `#0F6DFF` via `--accent`, Bricolage Grotesque, existing panel/badge/buttons, light+dark themes — no hardcoded theme colors anywhere in the new UI).
- **Source badges everywhere** (§16): `● Crawled by Webamazee` / `Google Search Console` / `Google Analytics` / `User Import` / `AI Analysis` + status chips `verified / partial / unavailable / requires-integration / estimated / AI-derived`.
- **Limitation note (§27)** shown in-UI (Backlinks, GSC, Analytics): proprietary link indexes and keyword databases (Ahrefs/Semrush etc.) cannot be reproduced with free crawls; every metric is either measured by our own crawler or explicitly labeled.

## 5. Honesty rules (§24) — enforced and verified

- Keyword volume/CPC/difficulty → **`Unavailable`** (never fabricated).
- Rankings → blocked behing GSC connect; position is labeled **Google Search Console Average Position**, never universal rank.
- Backlink counts labeled **Discovered Backlinks** with an explicit partial-dataset disclaimer.
- GSC not configured → UI says “Requires Integration … set GOOGLE_CLIENT_ID/SECRET, no alternative/fake metrics shown”, and the API answers the same.
- GA4 not connected → same pattern.
- AI-derived opportunities only appear when AI is configured, always labelled `AI-derived`, grounded in observed data; `AI_ENABLED=false` by default.
- No paid SEO API exists anywhere in the dependency chain (no Ahrefs/Semrush/DataForSEO/Moz/Majestic client).

## 6. Testing performed (§32) — all live, evidence in DB/API responses

| Test | Result |
|---|---|
| Full crawl of controlled local site (7 pages inc. intentional defects) | ✓ titles/meta/H1/canonical/robots/wordcount/images/schema/hreflang/links/status/size/TTFB/depth/sitemap/robots extracted |
| Issue detection | ✓ 4xx, broken internal links, dup titles, missing meta, thin content, missing alt, noindex, redirects, no structured data — scored 74 |
| Fix site → recrawl | ✓ issues auto-resolved (`resolvedAt` set), score → 86 → 89 |
| Change detection | ✓ `title_changed` (before→after), `content_changed`, `links_changed`, `status_changed`, `robots_changed`, `schema_changed`, `h1_changed`, `page_added` rows |
| Snapshots/history | ✓ 3+ snapshots; A/B compare returns numeric deltas (score/pages/indexable/links/TTFB/words/issues) + change list |
| Incremental crawl | ✓ 304 reuse: 6/7 pages notModified, ~700ms; rows + link edges carried forward |
| Real public crawl (example.com self, example.org competitor) | ✓ real measured data, score 95, competitor compare with “no traffic/backlink/volume claims” note |
| Keywords add/dup-409/cascade delete | ✓ volume `unavailable` |
| Backlinks CSV import | ✓ 2 rows imported, label + disclaimer |
| TeamHead consumption | ✓ `seoIntelligence` block in task output, plan rationale updated |
| Report generation | ✓ `seo_intelligence` report renders in existing `/app/reports/[id]` page |
| Worker/job queue | ✓ 15 `seo_crawl` jobs completed, 0 failures |
| UI routes | ✓ all `/app/seo/*` HTTP 200 |
| `tsc --noEmit` | ✓ clean |
| `next build` | ✓ success (all API + pages registered) |

### Bugs found during testing and fixed before sign-off
1. Aggregates used string orgIds (Mongoose never casts `$match`) → `oid()` helper + fixes in audit/backlinks/gsc-data.
2. Internal-link graph: `/menu` link vs `/menu/` crawled URL → trailing-slash normalization on both sides.
3. **304 pages lost their link edges** → previous edges carried forward when a page is notModified.
4. **Incremental frontier shrink**: link-only pages fell out when all linkers 304 → crawler `seedUrls` (previous pages **and** previous internal edge targets) keeps the frontier stable. Verified: the 404-only page recovered and persists across 304-heavy crawls.
5. `audit` byCategory aggregation: fixed project→session org mismatch.
6. history compare without an exact crawl pair: time-window fallback added.
7. CI hygiene: stray `_e` export on a page, `Th/Td`/`Card` prop typing, dead import.

## 7. Limitations (honest, per §27/33)

- **Not** an Ahrefs/Semrush replacement: no internet-wide backlink index, no keyword-volume database, no SERP-clickstream data.
- GSC/GA sections are real-only: empty “Requires Integration” until OAuth is connected; no stand-in metrics.
- Core Web Vitals are not synthesized; the performance category today uses measured TTFB/HTML size from our own crawl and is labeled as such.
- External-link checking is not yet performed automatically on every crawl (bounded, consent-grade checking is a future addition); broken-external findings only appear for pages actually crawled.

## 8. Deployment / Vercel compatibility

- Queue: API enqueues `seo_crawl`/`gsc_sync` jobs; the worker claims/executes them — this respects serverless route timeouts on Vercel as long as the worker runs as a long-lived process (same as existing background jobs).
- MongoDB production path unchanged: Atlas via `MONGODB_URI` (embedded Mongo is dev-only). New models follow the same patterns/indexes; no MMAP/in-memory reliance.
- New env vars (all optional): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (already listed in `.env.example`).
- No paid-API dependency, no new secrets required for the core crawler engine.

## 9. Additivity statement

Modified existing files (all strictly additive edits): `src/components/sidebar.tsx` (new nav group), `src/components/ui.tsx` (`Card` gained an optional `style` prop), `src/lib/env.ts`, `src/models/index.ts` (+`seo` export), `src/models/work.ts`, `src/server/crawler/index.ts` (optional `seedUrls`), `src/server/engine/process.ts` (+2 job cases), `src/server/engine/specialists-core.ts` (scoped replace delete), `src/server/engine/teamhead.ts` (SEO-intel consumption), `src/server/tools.ts` (registry entry).
Everything else — `src/models/seo.ts`, `src/server/seo/*`, `src/app/api/seo/*` (18 files), `src/app/app/seo/*` (16 pages + shared kit) — is new code.
