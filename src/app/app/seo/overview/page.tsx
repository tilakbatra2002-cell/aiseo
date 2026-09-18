'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { LimitationNote, Metric, MiniBars, ProjectPicker, SectionTitle, SourceBadge, Sparkline, Unavailable, useApi, withProject, useProjectParam } from '../_seo-ui';

interface Audit {
  score: number | null; scoreFormula: string | null; scoreLabel: string;
  lastCrawl: { completedAt: string; pages: number } | null;
  total: number; byCategory: { _id: string; count: number }[];
}
interface CrawlItem { _id: string; status: string; type: string; domain: string; startedAt?: string; progress?: { pagesDone: number; pagesQueued: number; currentUrl?: string }; stats?: Record<string, unknown> }
interface HistorySnap { metrics: Record<string, number | Record<string, number>>; takenAt: string }

export default function SeoOverviewPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const [starting, setStarting] = useState(false);
  const [msg, setMsg] = useState('');
  const audit = useApi<Audit>(withProject('/api/seo/audit?limit=0', project), []);
  const crawls = useApi<{ items: CrawlItem[] }>(withProject('/api/seo/crawl', project), []);
  const hist = useApi<{ snapshots: HistorySnap[] }>(withProject('/api/seo/history', project), []);

  const startCrawl = async () => {
    setStarting(true); setMsg('');
    try {
      await api<{ crawlId: string }>(withProject('/api/seo/crawl', project), { method: 'POST', body: JSON.stringify({}) });
      setMsg('Crawl queued — the worker is processing it. This page refreshes on reload.');
      crawls.reload();
    } catch (e) { setMsg((e as Error).message); }
    setStarting(false);
  };

  if (audit.loading) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  const d = audit.data;
  const running = (crawls.data?.items ?? []).find((c) => c.status === 'running' || c.status === 'queued');
  const historyPoints = (hist.data?.snapshots ?? []).map((s) => Number(s.metrics.score ?? 0));
  const issuePoints = (hist.data?.snapshots ?? []).map((s) => Number((s.metrics.issues as Record<string, number> | undefined)?.total ?? 0));

  return (
    <div>
      <PageHeader
        title="SEO Intelligence"
        subtitle="Your own SEO data engine — first-party crawl data, connected Google data, imports. Nothing is fabricated."
        actions={
          <>
            <ProjectPicker />
            <button className="btn-primary" onClick={startCrawl} disabled={starting || Boolean(running)}>
              {starting ? 'Queuing…' : running ? 'Crawl running…' : '⟳ Start Site Crawl'}
            </button>
          </>
        }
      />
      {msg && <Card className="mb-4 p-3 text-xs font-bold" style={{ color: 'var(--accent)' }}>{msg}</Card>}

      {running && (
        <Card className="mb-5">
          <SectionTitle right={<SourceBadge source="Crawled by Webamazee" />}>Crawl in progress — {running.domain}</SectionTitle>
          <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>{running.progress?.pagesDone ?? 0}/{(running.progress?.pagesQueued ?? 0) || '…'} pages</div>
          <div className="mt-1 max-w-full truncate text-xs" style={{ color: 'var(--text-3)' }}>{running.progress?.currentUrl}</div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((running.progress?.pagesDone ?? 0) / Math.max(1, running.progress?.pagesQueued ?? 1)) * 100)}%`, background: 'var(--accent)' }} />
          </div>
        </Card>
      )}

      {!d?.lastCrawl ? (
        <EmptyState
          title="No crawl data yet"
          hint="Start your first Site Crawl. Webamazee's own crawler collects titles, metas, links, schema, status codes, response times — stored with full data provenance."
          action={<button className="btn-primary" onClick={startCrawl} disabled={starting}>Start Site Crawl</button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Webamazee Technical SEO Score" value={d.score ?? '—'} source="Crawled by Webamazee" status="verified" updatedAt={d.lastCrawl.completedAt} note={d.scoreLabel} />
            <Metric label="Pages Crawled" value={d.lastCrawl.pages ?? '—'} source="Crawled by Webamazee" status="verified" updatedAt={d.lastCrawl.completedAt} />
            <Metric label="Open Measured Issues" value={d.total} source="Crawled by Webamazee" status="verified" updatedAt={d.lastCrawl.completedAt} note={(d.byCategory ?? []).map((c) => `${c._id}: ${c.count}`).join(' · ')} />
            <Metric label="Last Crawled" value={new Date(d.lastCrawl.completedAt).toLocaleString()} source="Crawled by Webamazee" status="verified" />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card>
              <SectionTitle right={<SourceBadge source="Crawled by Webamazee" />}>Technical score across crawls</SectionTitle>
              <Sparkline points={historyPoints} />
              {historyPoints.length < 2 && <div className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Run another crawl to build history.</div>}
            </Card>
            <Card>
              <SectionTitle right={<SourceBadge source="Crawled by Webamazee" />}>Open issues across crawls</SectionTitle>
              <MiniBars points={issuePoints} />
            </Card>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Metric label="GSC Performance" value="—" source="Google Search Console" status="requires-integration" note="Connect Search Console on the GSC page for real clicks/impressions/CTR/average position." />
            <Metric label="Analytics" value="—" source="Google Analytics" status="requires-integration" note="Connect Google Analytics 4 for real sessions/users/engagement." />
            <Unavailable label="Search Volume & Keyword Difficulty" reason="Requires proprietary third-party datasets. Shown as Unavailable instead of an invented estimate." />
          </div>

          <div className="mt-5"><LimitationNote /></div>
        </>
      )}
    </div>
  );
}
