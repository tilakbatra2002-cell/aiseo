import mongoose, { Schema, model, models } from 'mongoose';

const { ObjectId } = Schema.Types;

/* -------------------------------- Crawl ------------------------------ */
// A Webamazee-owned crawl session (self site or competitor).
const CrawlSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    domain: { type: String, required: true, index: true },
    type: { type: String, enum: ['self', 'competitor'], default: 'self', index: true },
    competitor: { type: ObjectId, ref: 'Competitor' },
    status: { type: String, enum: ['queued', 'running', 'completed', 'failed', 'cancelled'], default: 'queued', index: true },
    pageCrawlId: { type: String, index: true }, // CrawlPage.crawlId value used by this run's rows
    settings: { maxPages: Number, concurrency: Number, delayMs: Number, incremental: Boolean },
    robots: { exists: Boolean, blocksAll: Boolean, disallows: Number, sitemaps: Number, hash: String },
    sitemap: { exists: Boolean, url: String, urlsTotal: Number, hash: String },
    progress: { pagesDone: { type: Number, default: 0 }, pagesQueued: { type: Number, default: 0 }, currentUrl: String },
    incremental: { checked: { type: Number, default: 0 }, notModified: { type: Number, default: 0 } },
    stats: Schema.Types.Mixed, // computed at completion (pages, statusCode classes, links, issues by severity, score...)
    error: String,
    startedAt: Date,
    completedAt: Date,
    source: { type: String, default: 'webamazee_crawler' }, // provenance label for UI
  },
  { timestamps: true },
);
CrawlSchema.index({ project: 1, domain: 1, status: 1, startedAt: -1 });

/* ------------------------------ CrawlLink ---------------------------- */
// Link edge discovered by our crawler (internal & external), with anchor.
const CrawlLinkSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    crawlId: { type: String, required: true, index: true },
    domain: { type: String, index: true },
    fromUrl: { type: String, required: true },
    toUrl: { type: String, required: true },
    anchor: { type: String, default: '' },
    rel: [String],
    followType: { type: String, enum: ['follow', 'nofollow', 'ugc', 'sponsored'], default: 'follow' },
    internal: { type: Boolean, required: true, index: true },
  },
  { timestamps: false },
);
CrawlLinkSchema.index({ project: 1, crawlId: 1, fromUrl: 1, toUrl: 1 });
CrawlLinkSchema.index({ project: 1, crawlId: 1, toUrl: 1 });

/* ------------------------------- SEOIssue ---------------------------- */
// Intelligence-layer issue store (distinct from agent Finding, bridged separately).
const SEOIssueSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    crawlId: { type: String, index: true },
    category: { type: String, required: true, index: true }, // technical|content|performance|links|indexability|structured-data
    ruleKey: { type: String, required: true },
    severity: { type: String, enum: ['Critical', 'High', 'Medium', 'Low', 'Informational'], default: 'Medium', index: true },
    url: String,
    title: { type: String, required: true },
    description: String,
    evidence: Schema.Types.Mixed, // measured values only
    status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open', index: true },
    detectedAt: { type: Date, default: () => new Date() },
    resolvedAt: Date,
    resolvedInCrawlId: String,
    source: { type: String, default: 'webamazee_crawler' },
  },
  { timestamps: true },
);
SEOIssueSchema.index({ project: 1, ruleKey: 1, url: 1, status: 1 });

/* ------------------------------- Keyword ------------------------------ */
const KeywordSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    term: { type: String, required: true },
    termLower: { type: String, required: true },
    targetUrl: String,
    country: { type: String, default: 'us' },
    device: { type: String, enum: ['desktop', 'mobile', 'tablet'], default: 'desktop' },
    intent: String, // classified from observed data
    cluster: String,
    source: { type: String, enum: ['manual', 'gsc', 'crawl', 'import'], default: 'manual' },
    volume: { type: String, default: 'unavailable' }, // never fabricated — label only
    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active' },
  },
  { timestamps: true },
);
KeywordSchema.index({ project: 1, termLower: 1 }, { unique: false });

/* ------------------------- KeywordObservation ------------------------- */
// Observed keyword performance — only from real sources (GSC).
const KeywordObservationSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    keyword: { type: ObjectId, ref: 'Keyword', index: true },
    term: { type: String, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    source: { type: String, enum: ['gsc'], required: true },
    clicks: Number,
    impressions: Number,
    ctr: Number,
    position: Number, // GSC average position — labelled in UI
    page: String,
    country: String,
    device: String,
  },
  { timestamps: false },
);
KeywordObservationSchema.index({ project: 1, term: 1, date: 1 }, { unique: true });

/* ------------------------- RankingObservation ------------------------- */
const RankingObservationSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    keyword: { type: ObjectId, ref: 'Keyword', index: true },
    term: String,
    date: { type: String, required: true },
    position: { type: Number, required: true },
    source: { type: String, enum: ['gsc'], required: true }, // labelled "GSC Average Position"
    sourceLabel: { type: String, default: 'Google Search Console Average Position' },
    targetUrl: String,
    country: String,
    device: String,
  },
  { timestamps: false },
);
RankingObservationSchema.index({ project: 1, keyword: 1, date: 1 });

/* ------------------------------ Competitor ---------------------------- */
const CompetitorSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    domain: { type: String, required: true },
    name: String,
    lastCrawlId: String,
    notes: String,
  },
  { timestamps: true },
);
CompetitorSchema.index({ project: 1, domain: 1 }, { unique: true });
// NOTE: competitor pages are stored as CrawlPage rows under the competitor's
// crawlId (single page schema — avoids duplicating huge raw datasets).

/* ------------------------------- Backlink ----------------------------- */
// "Discovered Backlinks" — never claimed as a complete internet index.
const BacklinkSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    sourceUrl: { type: String, required: true },
    targetUrl: { type: String, required: true },
    anchor: { type: String, default: '' },
    rel: [String],
    followType: { type: String, enum: ['follow', 'nofollow', 'ugc', 'sponsored'], default: 'follow' },
    firstSeenAt: { type: Date, default: () => new Date() },
    lastCheckedAt: Date,
    status: { type: String, enum: ['active', 'not_found', 'not_checked'], default: 'not_checked' },
    source: { type: String, enum: ['crawler', 'import', 'gsc'], required: true },
    importBatch: { type: ObjectId, ref: 'BacklinkImport' },
  },
  { timestamps: true },
);
BacklinkSchema.index({ project: 1, sourceUrl: 1, targetUrl: 1 });

const BacklinkImportSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    filename: String,
    rowsTotal: Number,
    rowsImported: Number,
    rowsSkipped: Number,
    note: String,
  },
  { timestamps: true },
);

/* ------------------------------ GSC Property -------------------------- */
const GSCPropertySchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    siteUrl: { type: String, required: true },
    status: { type: String, enum: ['connected', 'expired', 'error'], default: 'connected' },
    integration: { type: ObjectId, ref: 'Integration' }, // tokens live encrypted on Integration
    lastSyncAt: Date,
    lastSyncRows: Number,
    connectedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);
GSCPropertySchema.index({ project: 1, siteUrl: 1 }, { unique: true });

const GSCQuerySchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    siteUrl: String,
    date: { type: String, required: true, index: true },
    query: { type: String, required: true },
    page: String,
    country: String,
    device: String,
    clicks: Number,
    impressions: Number,
    ctr: Number,
    position: Number,
  },
  { timestamps: false },
);
GSCQuerySchema.index({ project: 1, query: 1, date: 1 });

const GSCPageSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    siteUrl: String,
    date: { type: String, required: true, index: true },
    page: { type: String, required: true },
    clicks: Number,
    impressions: Number,
    ctr: Number,
    position: Number,
  },
  { timestamps: false },
);
GSCPageSchema.index({ project: 1, page: 1, date: 1 });

const GSCMetricSnapshotSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    siteUrl: String,
    date: { type: String, required: true },
    clicks: Number,
    impressions: Number,
    ctr: Number,
    position: Number,
  },
  { timestamps: false },
);
GSCMetricSnapshotSchema.index({ project: 1, siteUrl: 1, date: 1 }, { unique: true });

/* --------------------------- AnalyticsSnapshot ------------------------- */
// GA4 where connected; rows only contain real API data. Absence = Requires Integration.
const AnalyticsSnapshotSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    propertyId: String,
    date: { type: String, required: true, index: true },
    sessions: Number,
    users: Number,
    newUsers: Number,
    pageviews: Number,
    engagementRate: Number,
    conversions: Number,
    source: { type: String, default: 'google_analytics_4' },
    landingPage: String,
    channelGroup: String,
  },
  { timestamps: false },
);
AnalyticsSnapshotSchema.index({ project: 1, date: 1, landingPage: 1 });

/* ------------------------------- SEOChange ---------------------------- */
const SEOChangeSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    domain: String,
    crawlId: { type: String, required: true, index: true },
    vsCrawlId: String,
    changeType: { type: String, required: true, index: true }, // page_added|page_removed|title_changed|canonical_changed|status_changed|robots_changed|h1_changed|links_changed|schema_changed|content_changed|sitemap_changed|robots_txt_changed
    url: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    detectedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);
SEOChangeSchema.index({ project: 1, detectedAt: -1 });

/* ------------------------------ SEOSnapshot --------------------------- */
const SEOSnapshotSchema = new Schema(
  {
    organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    crawlId: { type: String, required: true, index: true },
    domain: String,
    takenAt: { type: Date, default: () => new Date(), index: true },
    metrics: Schema.Types.Mixed, // pages, status classes, indexable, links, issues by severity/category, score, avgTtfb, orphans, backlinksDiscovered
  },
  { timestamps: false },
);

export const Crawl = models.Crawl || model('Crawl', CrawlSchema);
export const CrawlLink = models.CrawlLink || model('CrawlLink', CrawlLinkSchema);
export const SEOIssue = models.SEOIssue || model('SEOIssue', SEOIssueSchema);
export const Keyword = models.Keyword || model('Keyword', KeywordSchema);
export const KeywordObservation = models.KeywordObservation || model('KeywordObservation', KeywordObservationSchema);
export const RankingObservation = models.RankingObservation || model('RankingObservation', RankingObservationSchema);
export const Competitor = models.Competitor || model('Competitor', CompetitorSchema);
export const Backlink = models.Backlink || model('Backlink', BacklinkSchema);
export const BacklinkImport = models.BacklinkImport || model('BacklinkImport', BacklinkImportSchema);
export const GSCProperty = models.GSCProperty || model('GSCProperty', GSCPropertySchema);
export const GSCQuery = models.GSCQuery || model('GSCQuery', GSCQuerySchema);
export const GSCPage = models.GSCPage || model('GSCPage', GSCPageSchema);
export const GSCMetricSnapshot = models.GSCMetricSnapshot || model('GSCMetricSnapshot', GSCMetricSnapshotSchema);
export const AnalyticsSnapshot = models.AnalyticsSnapshot || model('AnalyticsSnapshot', AnalyticsSnapshotSchema);
export const SEOChange = models.SEOChange || model('SEOChange', SEOChangeSchema);
export const SEOSnapshot = models.SEOSnapshot || model('SEOSnapshot', SEOSnapshotSchema);
void mongoose;
