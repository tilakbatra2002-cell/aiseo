import { Approval, CrawlPage, Finding, Task } from '@/models';
import { fetchSinglePage } from '../crawler';
import type { RunCtx } from './run-context';
import { latestCrawlId } from './specialists-core';
import { enqueueJob } from './queue';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hasIntegration(ctx: RunCtx, provider: string): Promise<boolean> {
  const integ = await (await import('@/models')).Integration.findOne({
    organization: ctx.orgId, provider, status: 'Connected',
  }).lean<any>();
  return !!integ;
}

function titleCase(s: string) {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));
}

/* ======================== On-Page SEO Agent ======================== */
export async function runOnPageOptimization(ctx: RunCtx) {
  await ctx.taskLog(`${ctx.agent.name} started on-page optimization`);
  const crawlId = await latestCrawlId(String(ctx.project._id));
  if (!crawlId) await ctx.fail('No crawl data found. Run the SEO Audit first.');
  const pages = await ctx.tool('database', 'load crawl pages', async () =>
    CrawlPage.find({ project: ctx.project._id, crawlId, ok: true, noindex: { $ne: true } }).lean<any>(), (p) => `${p.length} pages`);

  const proposedChanges: { url: string; field: string; current: string; proposed: string; rationale: string }[] = [];
  for (const p of pages.slice(0, 20)) {
    const slug = p.finalUrl.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') ?? '';
    if (!p.title) {
      const base = p.h1?.[0] || titleCase(slug) || ctx.project.name;
      proposedChanges.push({
        url: p.finalUrl, field: 'title', current: '',
        proposed: `${base.slice(0, 52)} | ${ctx.project.name}`.slice(0, 60),
        rationale: 'Page has no title tag; draft built from H1/slug plus brand.',
      });
    } else if ((p.titleLength ?? 0) > 60) {
      proposedChanges.push({
        url: p.finalUrl, field: 'title', current: p.title,
        proposed: p.title.slice(0, 57).replace(/\s+\S*$/, '') + '…',
        rationale: `Title is ${p.titleLength} chars; trimmed to display-safe length.`,
      });
    }
    if (!p.metaDescription) {
      const h2 = (p.headings ?? []).find((h) => h.level === 'h2')?.text;
      const desc = h2
        ? `${h2} — learn more at ${ctx.project.name}.`.slice(0, 158)
        : `${p.title || titleCase(slug)} — services and information from ${ctx.project.name}.`.slice(0, 158);
      proposedChanges.push({
        url: p.finalUrl, field: 'meta_description', current: '', proposed: desc,
        rationale: 'Missing meta description; draft derived from on-page headings.',
      });
    }
  }

  const cmsConnected = await hasIntegration(ctx, 'wordpress');
  const limited = proposedChanges.slice(0, 12);
  await ctx.artifact('content_draft', 'Proposed on-page changes', limited, `${limited.length} proposed changes`);

  /* Update related findings → Recommended */
  const urls = limited.map((c) => c.url);
  await Finding.updateMany(
    { project: ctx.project._id, url: { $in: urls }, ruleKey: { $in: ['missing_title', 'title_too_long', 'missing_meta'] }, status: 'Detected' },
    { $set: { status: 'Recommended', recommendedAction: 'Apply the proposed on-page change (see task artifacts).' } },
  );

  if (limited.length === 0) {
    await ctx.output({ proposedChanges: 0, message: 'No on-page title/meta improvements needed on crawled pages.' });
    return;
  }

  // On-page changes modify the live site → owner approval required
  // unless this agent is configured for auto-approve.
  const policy = (ctx.agent.permissions as { approvalPolicy?: string }).approvalPolicy ?? 'always_require';
  if (policy === 'never_allow') {
    await ctx.output({ proposedChanges: limited.length, blocked: 'Agent policy is Never Allow for execution. Drafts saved as artifacts.' });
    return;
  }

  const approval = await Approval.create({
    organization: ctx.orgId,
    project: ctx.project._id,
    task: ctx.task._id,
    requestedBy: { type: 'agent', id: ctx.agent._id, name: ctx.agent.name },
    actionType: 'onpage_change',
    title: `Apply ${limited.length} on-page change(s)`,
    description: cmsConnected
      ? 'The On-Page SEO agent will push these title/meta changes to WordPress after approval.'
      : 'No CMS integration is connected. Approving records your sign-off; implementation must be done in your CMS manually or by connecting WordPress.',
    risk: 'Low',
    payload: { changes: limited, cmsConnected, executed: false },
  });

  await Task.updateOne({ _id: ctx.task._id }, { $set: { status: 'Needs Approval', approval: approval._id } });
  await ctx.output({ proposedChanges: limited.length, approvalId: String(approval._id), cmsConnected, executed: false });
  await ctx.taskLog(`${ctx.agent.name} drafted ${limited.length} changes — awaiting owner approval`);
}

/* ====================== Internal Linking Agent ===================== */
export async function runInternalLinking(ctx: RunCtx) {
  await ctx.taskLog(`${ctx.agent.name} analyzing internal link structure`);
  const crawlId = await latestCrawlId(String(ctx.project._id));
  if (!crawlId) await ctx.fail('No crawl data found. Run the SEO Audit first.');
  const pages = await ctx.tool('database', 'load crawl pages', async () =>
    CrawlPage.find({ project: ctx.project._id, crawlId }).lean<any>(), (p) => `${p.length} pages`);

  const inbound = new Map<string, number>();
  for (const p of pages) {
    for (const link of new Set((p.internalLinks ?? []) as string[])) {
      const k = link.replace(/\/$/, '');
      inbound.set(k, (inbound.get(k) ?? 0) + 1);
    }
  }
  const weak = pages
    .filter((p) => p.ok && p.depth > 0 && (inbound.get(p.finalUrl.replace(/\/$/, '')) ?? 0) < 2)
    .map((p) => ({
      url: p.finalUrl,
      inboundLinks: inbound.get(p.finalUrl.replace(/\/$/, '')) ?? 0,
      title: p.title,
      wordCount: p.wordCount,
    }));

  if (weak.length) {
    await ctx.addFindings(weak.slice(0, 15).map((w) => ({
      ruleKey: 'weak_internal_links', category: 'links',
      title: `Few internal links point here (${w.inboundLinks})`,
      severity: 'Low' as const, url: w.url,
      evidence: { description: `Only ${w.inboundLinks} internal inbound link(s) detected during crawl.` },
      recommendedAction: 'Add contextual links from thematically related pages.',
      impact: 2, effort: 2, confidence: 4, risk: 1,
    })));
  }

  await ctx.artifact('json', 'Internal link analysis', {
    pagesAnalyzed: pages.length,
    weakPages: weak.slice(0, 30),
  });
  await ctx.output({ pagesAnalyzed: pages.length, weakPages: weak.length, executed: false, note: 'Link insertions require CMS access or manual implementation.' });
  await ctx.taskLog(`Internal linking analysis done — ${weak.length} weakly-linked pages identified`);
}

/* ========================= Content SEO Agent ======================= */
export async function runContentAnalysis(ctx: RunCtx) {
  await ctx.taskLog(`${ctx.agent.name} started content analysis`);
  const crawlId = await latestCrawlId(String(ctx.project._id));
  if (!crawlId) await ctx.fail('No crawl data found. Run the SEO Audit first.');
  const pages = await ctx.tool('database', 'load crawl pages', async () =>
    CrawlPage.find({ project: ctx.project._id, crawlId, ok: true }).lean<any>(), (p) => `${p.length} pages`);

  const thin = pages.filter((p) => (p.wordCount ?? 0) < 200 && p.depth <= 2 && !p.noindex);
  const briefs = thin.slice(0, 6).map((p) => ({
    url: p.finalUrl,
    currentWords: p.wordCount,
    existingHeadings: (p.headings ?? []).slice(0, 8).map((h) => h.text),
    brief: {
      objective: `Expand ${p.finalUrl} to comprehensively cover its topic`,
      suggestedWordCount: '800–1200',
      suggestedSections: ['Problem / need', 'How the service works', 'Pricing or process', 'FAQs', 'Local relevance', 'Call to action'],
      internalLinksToAdd: 'Link from homepage/services overview.',
    },
  }));

  await ctx.artifact('content_draft', 'Content briefs', briefs, `${briefs.length} content briefs`);
  await ctx.output({
    thinPages: thin.length,
    briefsCreated: briefs.length,
    note: 'Briefs are derived from real crawl data. Publishing requires a connected CMS.',
  });
  await ctx.taskLog(`Content analysis complete — ${briefs.length} content brief(s) created`);
}

/* ========================== Local SEO Agent ======================== */
export async function runLocalSeo(ctx: RunCtx) {
  await ctx.taskLog(`${ctx.agent.name} started local SEO analysis`);
  const crawlId = await latestCrawlId(String(ctx.project._id));
  if (!crawlId) await ctx.fail('No crawl data found. Run the SEO Audit first.');
  const pages = await ctx.tool('database', 'load crawl pages', async () =>
    CrawlPage.find({ project: ctx.project._id, crawlId, ok: true }).lean<any>(), (p) => `${p.length} pages`);

  const hasLocalSchema = pages.some((p) =>
    (p.structuredDataTypes ?? []).some((t) => /LocalBusiness|Dentist|Restaurant|Store|Plumber|LegalService|MedicalBusiness/i.test(t)));
  const locations = ctx.project.targetLocations ?? [];

  if (!hasLocalSchema) {
    await ctx.addFindings([{
      ruleKey: 'missing_local_schema', category: 'local',
      title: 'No LocalBusiness structured data detected', severity: 'High', url: ctx.project.website,
      evidence: { description: `None of the ${pages.length} crawled pages expose LocalBusiness-type JSON-LD.` },
      recommendedAction: 'Add LocalBusiness schema with NAP, opening hours and geo data.',
      impact: 4, effort: 2, confidence: 4, risk: 1,
    }]);
  }

  const locationCoverage = locations.map((loc) => {
    const slug = loc.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const term = loc.toLowerCase();
    const page = pages.find((p) =>
      p.finalUrl.toLowerCase().includes(slug)
      || (p.title ?? '').toLowerCase().includes(term)
      || (p.h1 ?? []).some((h) => h.toLowerCase().includes(term)));
    return { location: loc, hasPage: !!page, url: page?.finalUrl ?? null };
  });

  for (const lc of locationCoverage.filter((l) => !l.hasPage)) {
    await ctx.addFindings([{
      ruleKey: 'missing_location_page', category: 'local',
      title: `No landing page detected for ${lc.location}`, severity: 'Medium', url: ctx.project.website,
      evidence: { description: `No crawled page URL, title or H1 references "${lc.location}".` },
      recommendedAction: `Create a dedicated, unique landing page for ${lc.location}.`,
      impact: 4, effort: 4, confidence: 4, risk: 1,
    }]);
  }

  await ctx.artifact('json', 'Local SEO analysis', { hasLocalSchema, locationCoverage });
  await ctx.output({ localSchema: hasLocalSchema, locationsChecked: locationCoverage.length, locationsCovered: locationCoverage.filter((l) => l.hasPage).length });
  await ctx.taskLog(`Local SEO analysis complete — ${locationCoverage.filter((l) => l.hasPage).length}/${locationCoverage.length} target locations covered`);
}

/* ============================== GBP Agent ========================== */
export async function runGbpAnalysis(ctx: RunCtx) {
  await ctx.taskLog(`${ctx.agent.name} checking Google Business Profile integration`);
  const connected = await hasIntegration(ctx, 'google_business_profile');
  if (!connected) {
    await ctx.output({
      integrationRequired: 'google_business_profile',
      message: 'Google Business Profile integration is not connected. GBP data, reviews and posts cannot be accessed — no data was fabricated.',
      plannedWorkOnceConnected: ['Profile completeness audit', 'Category analysis', 'Services analysis', 'Review analysis', 'Post scheduling (with approval)'],
    });
    await ctx.taskLog('GBP analysis blocked — Integration Required: Google Business Profile');
    return;
  }
  await ctx.output({ message: 'GBP integration connected; live GBP fetch is executed by the integration service.' });
}

/* ========================= Off-Page SEO Agent ====================== */
export async function runOffPageAnalysis(ctx: RunCtx) {
  await ctx.taskLog(`${ctx.agent.name} checking backlink data providers`);
  const providers = ['dataforseo', 'ahrefs', 'semrush'];
  let connectedProvider: string | null = null;
  for (const p of providers) {
    if (await hasIntegration(ctx, p)) { connectedProvider = p; break; }
  }
  if (!connectedProvider) {
    await ctx.output({
      integrationRequired: 'backlink_provider (Ahrefs / Semrush / DataForSEO)',
      message: 'No backlink data provider is connected. Backlink counts, referring domains and link gaps were NOT estimated or fabricated.',
      plannedWorkOnceConnected: ['Backlink profile analysis', 'Referring domain quality review', 'Competitor link gap', 'Outreach prospect list'],
    });
    await ctx.taskLog('Off-page analysis blocked — Integration Required: backlink data provider');
    return;
  }
  await ctx.output({ message: `Backlink provider ${connectedProvider} connected; live queries execute via the integration service.` });
}

/* ========================== Analytics Agent ======================== */
export async function runAnalyticsReview(ctx: RunCtx) {
  await ctx.taskLog(`${ctx.agent.name} checking analytics integrations`);
  const gsc = await hasIntegration(ctx, 'google_search_console');
  const ga = await hasIntegration(ctx, 'google_analytics');
  if (!gsc && !ga) {
    await ctx.output({
      integrationRequired: 'google_search_console / google_analytics',
      message: 'No analytics or Search Console integration is connected. No traffic metrics were generated or estimated.',
    });
    await ctx.taskLog('Analytics review blocked — Integration Required: Search Console / Analytics');
    return;
  }
  await ctx.output({ message: 'Analytics integration connected; metric pulls execute via the integration service.' });
}

/* ============================= QA Agent ============================ */
export async function runQaVerification(ctx: RunCtx) {
  await ctx.taskLog(`${ctx.agent.name} started QA verification`);

  // Verify a sample of open findings by re-fetching the live page.
  const findings = await ctx.tool('database', 'load open findings', async () =>
    Finding.find({ project: ctx.project._id, status: { $in: ['Detected', 'Recommended'] }, url: { $ne: null } })
      .sort({ severity: 1 })
      .limit(10)
      .lean<any>(), (f) => `${f.length} findings to verify`);

  let verified = 0, failed = 0;
  for (const f of findings) {
    const url = f.url as string;
    if (!/^https?:\/\//.test(url)) continue;
    try {
      const page = await ctx.tool('http_request', `verify ${url}`, () => fetchSinglePage(url), (p) => `HTTP ${p.status}`);
      let stillPresent: boolean | null = null;
      if (page.parsed) {
        switch (f.ruleKey) {
          case 'missing_title': stillPresent = !page.parsed.title; break;
          case 'title_too_long': stillPresent = page.parsed.titleLength > 60; break;
          case 'missing_meta': stillPresent = !page.parsed.metaDescription; break;
          case 'missing_h1': stillPresent = page.parsed.h1.length === 0; break;
          case 'missing_canonical': stillPresent = !page.parsed.canonical; break;
          case 'noindex_page': stillPresent = page.parsed.noindex; break;
          default: stillPresent = null;
        }
      }
      const note = stillPresent === null
        ? 'Re-fetched the live page; rule could not be re-evaluated automatically.'
        : stillPresent
          ? 'QA re-fetched the live page and confirmed the issue is still present.'
          : 'QA re-fetched the live page and the issue no longer reproduces.';
      await Finding.updateOne({ _id: f._id }, {
        $set: {
          verification: {
            status: stillPresent === false ? 'failed' : 'verified',
            verifiedAt: new Date(),
            verifiedBy: ctx.agent._id,
            note,
          },
        },
      });
      if (stillPresent === false) { verified++; }
      else { failed++; }
      await sleep(300);
    } catch {
      await Finding.updateOne({ _id: f._id }, {
        $set: { 'verification.status': 'failed', 'verification.verifiedAt': new Date(), 'verification.verifiedBy': ctx.agent._id, 'verification.note': 'QA could not fetch the page to verify.' },
      });
    }
  }

  // Format-QA any completed specialist tasks that required QA
  const qaTasks = await Task.find({ project: ctx.project._id, qaStatus: 'pending', status: 'Completed', _id: { $ne: ctx.task._id } }).lean<any>();
  const qaResults: { task: string; verdict: string }[] = [];
  for (const t of qaTasks.slice(0, 15)) {
    const hasOutput = !!t.result && Object.keys(t.result as object).length > 0;
    await Task.updateOne({ _id: t._id }, { $set: { qaStatus: hasOutput ? 'passed' : 'rework' } });
    qaResults.push({ task: t.title, verdict: hasOutput ? 'PASS' : 'NEEDS REWORK (empty result)' });
    if (!hasOutput) {
      const rework = await Task.create({
        organization: ctx.orgId, project: ctx.project._id, parentTask: t._id,
        kind: t.kind, title: `Rework: ${t.title}`, objective: t.objective,
        assignedAgent: t.assignedAgent, createdBy: { type: 'agent', id: ctx.agent._id, name: ctx.agent.name },
        priority: t.priority, status: 'Queued', input: t.input, expectedOutput: t.expectedOutput,
        allowedTools: t.allowedTools, requiresApproval: t.requiresApproval,
      });
      await enqueueJob(ctx.orgId, 'run_task', { taskId: String(rework._id) });
    }
  }

  await ctx.output({
    findingsVerified: verified,
    findingsStillOpen: failed,
    tasksQaPassed: qaResults.filter((r) => r.verdict === 'PASS').length,
    tasksRework: qaResults.filter((r) => r.verdict !== 'PASS').length,
    details: qaResults,
  });
  await ctx.taskLog(`QA complete — ${verified} finding checks passed, ${qaResults.length} task(s) format-checked`);
}
