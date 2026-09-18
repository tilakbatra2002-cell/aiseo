'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, EmptyState, PageHeader, Spinner, Tag } from '@/components/ui';
import { ProjectPicker, SectionTitle, SourceBadge, Sparkline, Td, Th, cut, useApi, useProjectParam, withProject } from '../_seo-ui';

interface Snap { crawlId: string; takenAt: string; metrics: Record<string, number | Record<string, number>> }
interface Change { _id: string; changeType: string; url?: string; before?: unknown; after?: unknown; detectedAt: string; crawlId: string }
interface Compare {
  a: { crawlId: string; takenAt: string }; b: { crawlId: string; takenAt: string };
  delta: Record<string, { from: number; to: number; diff: number }>;
  changes: Change[];
}

const CHANGE_LABEL: Record<string, string> = {
  page_added: 'New page discovered', page_removed: 'Page disappeared', title_changed: 'Title changed',
  canonical_changed: 'Canonical changed', status_changed: 'Status changed', robots_changed: 'Meta robots changed',
  robots_txt_changed: 'robots.txt changed', sitemap_changed: 'Sitemap changed', h1_changed: 'H1 changed',
  links_changed: 'Internal links changed', schema_changed: 'Schema changed', content_changed: 'Content changed',
};

export default function HistoryPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const { data, loading } = useApi<{ snapshots: Snap[]; changes: Change[]; crawls: { pageCrawlId?: string; domain: string; startedAt: string; stats?: Record<string, unknown> }[] }>(withProject('/api/seo/history', project), [project]);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [cmp, setCmp] = useState<Compare | null>(null);
  const [busy, setBusy] = useState(false);

  const compare = async () => {
    if (!a || !b) return;
    setBusy(true);
    try { setCmp(await api<Compare>(withProject(`/api/seo/history?a=${a}&b=${b}`, project))); } catch { setCmp(null); }
    setBusy(false);
  };

  if (loading) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  const snaps = data?.snapshots ?? [];
  const options = snaps.map((s) => ({ id: s.crawlId, label: new Date(s.takenAt).toLocaleString() }));

  return (
    <div>
      <PageHeader title="History & Change Detection" subtitle={<>Crawl-over-crawl diffs — titles, canonicals, statuses, links, sitemap, robots. <SourceBadge source="Crawled by Webamazee" /></>} actions={<ProjectPicker />} />

      {snaps.length < 2 ? (
        <EmptyState title="Build history with repeat crawls" hint="Each crawl stores an immutable snapshot. From the second crawl onward, automatic change detection and comparisons become available." />
      ) : (
        <>
          <Card className="mb-4">
            <SectionTitle right={<SourceBadge source="Crawled by Webamazee" />}>Technical score trend</SectionTitle>
            <Sparkline points={snaps.map((s) => Number(s.metrics.score ?? 0))} height={64} />
          </Card>

          <Card className="mb-4">
            <SectionTitle>Compare crawls</SectionTitle>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input" style={{ maxWidth: 260 }} value={a} onChange={(e) => setA(e.target.value)}>
                <option value="">From crawl…</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <span style={{ color: 'var(--text-3)' }}>vs</span>
              <select className="input" style={{ maxWidth: 260 }} value={b} onChange={(e) => setB(e.target.value)}>
                <option value="">To crawl…</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <button className="btn-primary" disabled={!a || !b || busy} onClick={compare}>{busy ? 'Comparing…' : 'Compare'}</button>
            </div>
            {cmp && (
              <div className="mt-4">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(cmp.delta).map(([k, d]) => (
                    <span key={k} className="badge" style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      {k}: <b className="ml-1" style={{ color: 'var(--text)' }}>{d.from} → {d.to}</b>
                      <b className="ml-1" style={{ color: d.diff > 0 ? (k === 'issues' || k === 'avgTtfbMs' ? '#dc2626' : '#059669') : d.diff < 0 ? (k === 'issues' || k === 'avgTtfbMs' ? '#059669' : '#dc2626') : 'var(--text-3)' }}>({d.diff > 0 ? '+' : ''}{d.diff})</b>
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>{cmp.changes.length} detected change(s) between {new Date(cmp.a.takenAt).toLocaleString()} and {new Date(cmp.b.takenAt).toLocaleString()}, measured from the two crawls.</p>
              </div>
            )}
          </Card>
        </>
      )}

      <Card pad={false}>
        <div className="px-5 pt-4"><SectionTitle right={<SourceBadge source="Crawled by Webamazee" />}>Change history ({(data?.changes ?? []).length})</SectionTitle></div>
        {(data?.changes ?? []).length === 0 ? (
          <div className="p-6 text-sm" style={{ color: 'var(--text-3)' }}>No changes detected yet. Re-run Site Crawl after making site edits to see measured diffs.</div>
        ) : (
          <table className="w-full">
            <thead><tr><Th>Change</Th><Th>URL</Th><Th>From → To</Th><Th>Detected</Th></tr></thead>
            <tbody>
              {(data?.changes ?? []).slice(0, 60).map((c) => (
                <tr key={c._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <Td><Tag tone="blue">{CHANGE_LABEL[c.changeType] ?? c.changeType}</Tag></Td>
                  <Td style={{ color: 'var(--text-2)' }}>{cut(c.url?.replace(/^https?:\/\//, '') ?? '(site-level)', 46)}</Td>
                  <Td className="text-[11px]" style={{ color: 'var(--text-3)' }}>{shortVal(c.before)} → {shortVal(c.after)}</Td>
                  <Td style={{ color: 'var(--text-3)' }}>{new Date(c.detectedAt).toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function shortVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}
