import bcrypt from 'bcryptjs';
import {
  Agent, AgentTool, Client, Department, Integration, KnowledgeDocument,
  Organization, Project, User, Workflow,
} from '@/models';
import { dbConnect } from '@/lib/db';
import { TOOL_REGISTRY } from '@/server/tools';
import { DISCOVERY_WORKFLOW_KEY } from './engine/workflow';

export const DEMO_OWNER = { email: 'owner@webamazee.com', password: 'Agent0s!Demo123' };

export const AGENTS: {
  name: string; key: string; role: string; isTeamHead?: boolean; skills: string[]; tools: string[];
  description: string; permissions?: Record<string, boolean | string>; qaRequired?: boolean;
}[] = [
  {
    name: 'Sophia Reed', key: 'team_head', role: 'SEO Team Head', isTeamHead: true,
    description: 'Senior SEO Manager. Analyzes projects, delegates specialist work, builds strategy and requests owner approvals.',
    skills: ['Strategy', 'Prioritization', 'Delegation', 'Reporting'],
    tools: ['database', 'file_system', 'search_console', 'analytics', 'keyword_data', 'search'],
    permissions: { canCreateTasks: true, canExecuteInternal: true },
  },
  {
    name: 'Marcus Cole', key: 'seo_audit', role: 'SEO Audit Agent',
    description: 'Runs full website discovery: crawl, sitemap/robots analysis, indexability, content and internal-link audit.',
    skills: ['Site audits', 'Crawl analysis', 'Issue detection'],
    tools: ['website_crawler', 'http_request', 'html_parser', 'sitemap_parser', 'robots_parser', 'page_comparison', 'database', 'file_system', 'code_executor'],
  },
  {
    name: 'Priya Nair', key: 'technical_seo', role: 'Technical SEO Agent',
    description: 'Verifies indexability production issues: status codes, redirects, canonicals, robots, sitemaps, structured data. Executes approved technical changes where write access exists.',
    skills: ['Indexability', 'Status codes', 'Canonicals', 'Schema'],
    tools: ['website_crawler', 'http_request', 'robots_parser', 'sitemap_parser', 'wordpress', 'database', 'file_system'],
    qaRequired: true,
  },
  {
    name: 'Daniel Osei', key: 'keyword_research', role: 'Keyword Research Agent',
    description: 'Discovers keywords from real page content, classifies intent, clusters topics and detects cannibalization.',
    skills: ['Intent classification', 'Clustering', 'Keyword mapping'],
    tools: ['keyword_data', 'http_request', 'database', 'file_system', 'code_executor'],
  },
  {
    name: 'Elena Petrova', key: 'competitor_analysis', role: 'Competitor Analysis Agent',
    description: 'Crawls competitor sites and compares structure, content and technical signals. Never estimates traffic metrics.',
    skills: ['Competitive crawling', 'Gap analysis'],
    tools: ['website_crawler', 'http_request', 'page_comparison', 'backlink_data', 'database', 'file_system'],
  },
  {
    name: 'James Carter', key: 'onpage_seo', role: 'On-Page SEO Agent',
    description: 'Optimizes titles, meta descriptions, headings, alt text and internal anchors. Applies approved changes via connected CMS only.',
    skills: ['Title/meta optimization', 'Heading structure', 'Schema'],
    tools: ['http_request', 'html_parser', 'wordpress', 'database', 'file_system'],
    qaRequired: true,
  },
  {
    name: 'Aisha Khan', key: 'content_seo', role: 'Content SEO Agent',
    description: 'Builds content briefs, detects thin content and gaps. Publishes only through a connected CMS.',
    skills: ['Content briefs', 'Gap analysis', 'Optimization'],
    tools: ['http_request', 'wordpress', 'keyword_data', 'database', 'file_system'],
  },
  {
    name: 'Lucas Meyer', key: 'local_seo', role: 'Local SEO Agent',
    description: 'Local schema, NAP checks, location-page coverage and local landing page guidance.',
    skills: ['Local schema', 'NAP', 'Location pages'],
    tools: ['http_request', 'html_parser', 'database', 'file_system'],
  },
  {
    name: 'Grace Liu', key: 'gbp', role: 'GBP Agent',
    description: 'Google Business Profile analysis, reviews and posts. Requires GBP integration — reports Integration Required otherwise.',
    skills: ['GBP optimization', 'Reviews', 'GBP posts'],
    tools: ['gbp', 'database', 'file_system'],
    permissions: { approvalPolicy: 'always_require' },
  },
  {
    name: 'Omar Hassan', key: 'offpage_seo', role: 'Off-Page SEO Agent',
    description: 'Backlink profile and link-gap analysis via connected providers. Distinguishes discovered opportunities from acquired links.',
    skills: ['Backlink analysis', 'Outreach', 'Link gaps'],
    tools: ['backlink_data', 'http_request', 'email', 'database', 'file_system'],
  },
  {
    name: 'Nina Petrova', key: 'internal_linking', role: 'Internal Linking Agent',
    description: 'Link-graph analysis, orphan detection and linking opportunities. Executes approved CMS changes where supported.',
    skills: ['Link graphs', 'Orphan detection'],
    tools: ['website_crawler', 'http_request', 'wordpress', 'database', 'file_system', 'code_executor'],
  },
  {
    name: 'Tom Becker', key: 'analytics', role: 'Analytics Agent',
    description: 'Reads connected Search Console/Analytics data. Generates no metrics without integrations.',
    skills: ['GSC', 'GA4', 'Reporting'],
    tools: ['search_console', 'analytics', 'database', 'file_system'],
  },
  {
    name: 'Ivy Chen', key: 'qa', role: 'QA Agent',
    description: 'Independently verifies completed work: re-fetches live pages, re-checks rules, flags rework.',
    skills: ['Verification', 'Regression checks'],
    tools: ['http_request', 'html_parser', 'page_comparison', 'screenshot', 'database', 'file_system'],
  },
];

export const SOPS: { title: string; category: string; forAgents: string[]; content: string }[] = [
  { title: 'Technical SEO SOP', category: 'Technical', forAgents: ['technical_seo', 'seo_audit', 'qa'], content: '# Technical SEO SOP\n1. Crawl with rate limits, respect robots.txt.\n2. Verify status codes with fresh requests before reporting broken URLs.\n3. Canonicals: flag mismatches, never mass-change without approval.\n4. Robots/sitemap changes are high-risk: owner approval required.\n5. QA must re-fetch the live page after any fix.' },
  { title: 'Local SEO SOP', category: 'Local', forAgents: ['local_seo', 'gbp'], content: '# Local SEO SOP\n1. Confirm LocalBusiness schema (name, address, phone).\n2. One unique page per target location — no doorway content.\n3. NAP must match the website footer and GBP profile.\n4. GBP changes always require integration + owner approval.' },
  { title: 'GBP SOP', category: 'Local', forAgents: ['gbp'], content: '# GBP SOP\n1. If no GBP integration is connected, stop and report Integration Required.\n2. Never fabricate review counts or ratings.\n3. Posts and service edits require owner approval.\n4. Category recommendations must cite competitor evidence.' },
  { title: 'Content SOP', category: 'Content', forAgents: ['content_seo', 'onpage_seo'], content: '# Content SOP\n1. Briefs must be based on real crawl data or keyword provider data.\n2. Target 800–1200 words for service pages; answer searcher intent.\n3. Publishing requires a connected CMS + approval.\n4. Avoid duplicate intent across pages (cannibalization).' },
  { title: 'Link Building SOP', category: 'Off-Page', forAgents: ['offpage_seo'], content: '# Link Building SOP\n1. Distinguish opportunity discovered vs link acquired — always.\n2. No paid link schemes; relevance first.\n3. Outreach templates stored in knowledge; sending requires email integration.\n4. Never fabricate referring domains.' },
  { title: 'Reporting SOP', category: 'Reporting', forAgents: ['team_head', 'analytics'], content: '# Reporting SOP\n1. Separate Detected / Recommended / Approved / Executed / Verified.\n2. No invented traffic or ranking numbers.\n3. Cite the AgentRun and crawl artifact for every claim.\n4. Include next priorities with internal priority scores.' },
  { title: 'QA SOP', category: 'QA', forAgents: ['qa'], content: '# QA SOP\n1. Re-fetch the live page; do not trust prior crawl cache.\n2. PASS only when the condition verifiably no longer reproduces.\n3. Empty specialist outputs = rework.\n4. Log every verification with timestamp and evidence.' },
];

export const INTEGRATIONS: { provider: string; label: string; status: string }[] = [
  { provider: 'google_search_console', label: 'Google Search Console', status: 'Requires OAuth' },
  { provider: 'google_analytics', label: 'Google Analytics', status: 'Requires OAuth' },
  { provider: 'google_business_profile', label: 'Google Business Profile', status: 'Requires OAuth' },
  { provider: 'wordpress', label: 'WordPress', status: 'Requires API Key' },
  { provider: 'shopify', label: 'Shopify', status: 'Requires API Key' },
  { provider: 'webflow', label: 'Webflow', status: 'Requires API Key' },
  { provider: 'ahrefs', label: 'Ahrefs', status: 'Requires API Key' },
  { provider: 'semrush', label: 'Semrush', status: 'Requires API Key' },
  { provider: 'dataforseo', label: 'DataForSEO', status: 'Requires API Key' },
  { provider: 'slack', label: 'Slack', status: 'Requires API Key' },
  { provider: 'smtp', label: 'Email (SMTP)', status: 'Requires API Key' },
  { provider: 'playwright_worker', label: 'Browser Automation Worker', status: 'Unavailable' },
];

export async function ensureSeeded(): Promise<{ seeded: boolean }> {
  await dbConnect();

  // Tools registry
  for (const t of TOOL_REGISTRY) {
    await AgentTool.updateOne({ key: t.key }, { $set: t }, { upsert: true });
  }

  let org = await Organization.findOne({ slug: 'webamazee' });
  if (!org) {
    org = await Organization.create({ name: 'Webamazee', slug: 'webamazee' });
  }

  let owner = await User.findOne({ email: DEMO_OWNER.email });
  if (!owner) {
    owner = await User.create({
      name: 'Agency Owner',
      email: DEMO_OWNER.email,
      passwordHash: bcrypt.hashSync(process.env.SEED_OWNER_PASSWORD || DEMO_OWNER.password, 12),
      organization: org._id,
      role: 'owner',
    });
  }

  // Department + agent hierarchy
  let dept = await Department.findOne({ organization: org._id, name: 'SEO Department' });
  const createdAgents: any[] = [];
  for (const spec of AGENTS) {
    let agent = await Agent.findOne({ organization: org._id, specialistKey: spec.key });
    if (!agent) {
      agent = await Agent.create({
        organization: org._id,
        name: spec.name,
        role: spec.role,
        specialistKey: spec.key,
        description: spec.description,
        isTeamHead: !!spec.isTeamHead,
        skills: spec.skills,
        tools: spec.tools,
        permissions: spec.permissions ?? {},
        systemInstructions: `You are ${spec.name}, ${spec.role} at Webamazee. ${spec.description}\nRules: never claim an action happened unless it verifiably did. Distinguish Detected > Recommended > Approved > Executed > Verified. Never fabricate metrics.`,
        successCriteria: 'Task completed with structured output, evidence and artifacts stored.',
        qaRequired: !!spec.qaRequired,
        avatar: spec.name.split(' ').map((p) => p[0]).join(''),
      });
    }
    createdAgents.push(agent);
  }
  const teamHead = createdAgents.find((a) => a.specialistKey === 'team_head')!;
  if (!dept) {
    dept = await Department.create({ organization: org._id, name: 'SEO Department', description: 'AI-powered SEO delivery department', teamHead: teamHead._id });
  }
  for (const a of createdAgents) {
    await Agent.updateOne({ _id: a._id }, {
      $set: { department: dept._id, ...(a.isTeamHead ? {} : { parent: teamHead._id }) },
    });
  }

  // Knowledge base
  for (const sop of SOPS) {
    await KnowledgeDocument.updateOne(
      { organization: org._id, title: sop.title },
      { $set: { ...sop, type: 'sop', organization: org._id } },
      { upsert: true },
    );
  }

  // Integrations catalogue
  for (const i of INTEGRATIONS) {
    await Integration.updateOne(
      { organization: org._id, provider: i.provider },
      { $setOnInsert: { organization: org._id, ...i } },
      { upsert: true },
    );
  }

  // Workflow template
  await Workflow.updateOne(
    { key: DISCOVERY_WORKFLOW_KEY },
    {
      $set: {
        key: DISCOVERY_WORKFLOW_KEY, isTemplate: true, name: 'New SEO Project',
        description: 'Crawl → audit → Team Head review → specialist execution → QA → strategy → approval → report.',
        steps: [
          { key: 'audit', name: 'Website Crawl & SEO Audit', kind: 'audit', retries: 2 },
          { key: 'review', name: 'Team Head Review & Delegation', kind: 'teamhead_review' },
          { key: 'specialist_work', name: 'Specialist Execution', kind: '_virtual_wait_children', parallel: true },
          { key: 'qa', name: 'QA Verification', kind: 'qa_verification' },
          { key: 'strategy', name: 'Strategy, Report & Approval', kind: 'teamhead_strategy', approvalCheckpoint: true },
        ],
      },
    },
    { upsert: true },
  );

  // Demo client + demo project (clearly labelled; no fabricated metrics)
  let demoClient = await Client.findOne({ organization: org._id, name: 'Demo Dental Clinic' });
  if (!demoClient) {
    demoClient = await Client.create({
      organization: org._id,
      name: 'Demo Dental Clinic',
      contactName: 'Dr. Demo',
      industry: 'Dental / Local Healthcare',
      isDemo: true,
      notes: 'Demo Data — this client exists to showcase Webamazee AgentOS.',
    });
  }
  let demoProject = await Project.findOne({ organization: org._id, isDemo: true });
  if (!demoProject) {
    demoProject = await Project.create({
      organization: org._id,
      client: demoClient._id,
      name: 'Webamazee AgentOS Demo',
      website: 'https://example.com',
      industry: 'Dental / Local Healthcare',
      country: 'United States',
      targetLocations: ['Austin, TX'],
      businessGoals: ['More appointment bookings', 'Local visibility'],
      competitors: ['https://example.org'],
      targetKeywords: ['dentist austin', 'dental clinic'],
      teamHead: teamHead._id,
      specialists: createdAgents.filter((a) => !a.isTeamHead).map((a) => a._id),
      stage: 'New',
      isDemo: true,
    });
  }

  return { seeded: true };
}

export async function resetDemoData() {
  await dbConnect();
  const demoProject = await Project.findOne({ isDemo: true });
  if (!demoProject) return;
  const pid = demoProject._id;
  const orgId = demoProject.organization;
  const models = await import('@/models');
  await Promise.all([
    models.Task.deleteMany({ project: pid }),
    models.Finding.deleteMany({ project: pid }),
    models.AgentRun.deleteMany({ project: pid }),
    models.CrawlPage.deleteMany({ project: pid }),
    models.WorkflowRun.deleteMany({ project: pid }),
    models.Approval.deleteMany({ project: pid }),
    models.Report.deleteMany({ project: pid }),
    models.ExecutionArtifact.deleteMany({ project: pid }),
    models.ProjectMemory.deleteMany({ project: pid }),
    models.ActivityLog.deleteMany({ project: pid }),
    models.Job.deleteMany({ organization: orgId }),
    models.Project.updateOne({ _id: pid }, { $set: { stage: 'New', strategy: undefined } }),
  ]);
}
