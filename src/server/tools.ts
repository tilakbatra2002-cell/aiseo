/**
 * Webamazee AgentOS Tool Engine.
 * Tools are real capabilities granted to agents based on their permissions.
 * Tools that depend on external integrations report "integration required"
 * — they never fabricate results.
 */
export interface ToolDef {
  key: string;
  name: string;
  category: string;
  description: string;
  requiresIntegration?: string;
}

export const TOOL_REGISTRY: ToolDef[] = [
  { key: 'website_crawler', name: 'Website Crawler', category: 'Crawl', description: 'Crawls websites collecting SEO data with rate limits and robots.txt compliance.' },
  { key: 'http_request', name: 'HTTP Request', category: 'Network', description: 'Makes HTTP requests to fetch pages and verify URLs.' },
  { key: 'browser_automation', name: 'Browser Automation', category: 'Automation', description: 'Playwright-driven browser automation for JS-rendered pages.', requiresIntegration: 'playwright_worker' },
  { key: 'html_parser', name: 'HTML Parser', category: 'Crawl', description: 'Parses HTML into structured SEO signals.' },
  { key: 'sitemap_parser', name: 'Sitemap Parser', category: 'Crawl', description: 'Fetches and parses XML sitemaps including sitemap indexes.' },
  { key: 'robots_parser', name: 'Robots Parser', category: 'Crawl', description: 'Parses robots.txt: disallows, allows, sitemaps, crawl-delay.' },
  { key: 'screenshot', name: 'Screenshot', category: 'Automation', description: 'Captures page screenshots as evidence.', requiresIntegration: 'playwright_worker' },
  { key: 'page_comparison', name: 'Page Comparison', category: 'Analysis', description: 'Compares two pages or crawls for differences.' },
  { key: 'search', name: 'Search', category: 'Research', description: 'Searches the web for competitor and keyword discovery.', requiresIntegration: 'search_provider' },
  { key: 'keyword_data', name: 'Keyword Data', category: 'Research', description: 'Webamazee-derived keyword intelligence from our own crawl: occurrence in titles/headings/anchors, keyword→page mapping, cannibalization signals. Unmeasurable third-party metrics stay Unavailable.' },
  { key: 'backlink_data', name: 'Backlink Data', category: 'Research', description: 'First-party Discovered Backlinks from our own crawler and user CSV imports — a partial dataset, explicitly not an internet-wide index.' },
  { key: 'search_console', name: 'Search Console', category: 'Google', description: 'Google Search Console API access.', requiresIntegration: 'google_search_console' },
  { key: 'analytics', name: 'Analytics', category: 'Google', description: 'Google Analytics 4 data access.', requiresIntegration: 'google_analytics' },
  { key: 'gbp', name: 'Google Business Profile', category: 'Google', description: 'GBP profile, reviews and posts management.', requiresIntegration: 'google_business_profile' },
  { key: 'wordpress', name: 'WordPress', category: 'CMS', description: 'Read and write WordPress content via REST API.', requiresIntegration: 'wordpress' },
  { key: 'shopify', name: 'Shopify', category: 'CMS', description: 'Shopify Admin API integration.', requiresIntegration: 'shopify' },
  { key: 'webflow', name: 'Webflow', category: 'CMS', description: 'Webflow CMS API integration.', requiresIntegration: 'webflow' },
  { key: 'email', name: 'Email', category: 'Comms', description: 'Sends transactional email via SMTP.', requiresIntegration: 'smtp' },
  { key: 'webhooks', name: 'Webhooks', category: 'Comms', description: 'Delivers event webhooks (e.g. Slack).', requiresIntegration: 'slack' },
  { key: 'seo_intelligence', name: 'SEO Intelligence', category: 'Crawl', description: 'Webamazee own SEO data layer: audits, issues, link graph, crawls, keyword/ranking observations.' },
  { key: 'database', name: 'Database', category: 'Internal', description: 'Reads and writes platform records.' },
  { key: 'file_system', name: 'File System', category: 'Internal', description: 'Stores and retrieves execution artifacts.' },
  { key: 'code_executor', name: 'Code Executor', category: 'Internal', description: 'Runs sandboxed analysis code for data processing.' },
];

export function toolByKey(key: string): ToolDef | undefined {
  return TOOL_REGISTRY.find((t) => t.key === key);
}
