'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, PageHeader, SeverityBadge, Spinner, EmptyState } from '@/components/ui';
import { LimitationNote, ProjectPicker, SectionTitle, SourceBadge, cut, useApi, useProjectParam, withProject } from '../_seo-ui';

interface Issue { _id: string; category: string; ruleKey: string; severity: string; url?: string; title: string; description?: string; detectedAt: string }
interface Audit {
  score: number | null; scoreFormula: string | null; scoreLabel: string;
  lastCrawl: { completedAt: string; pages: number } | null;
  issues: Issue[]; total: number; byCategory: { _id: string; count: number }[]; categories: string[];
}

export default function SiteAuditPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const qs = `${category ? `&category=${category}` : ''}${severity ? `&severity=${severity}` : ''}`;
  const { data, loading } = useApi<Audit>(withProject(`/api/seo/audit?limit=150${qs}`, project), [category, severity]);

  if (loading) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  if (!data?.lastCrawl) return (
    <div>
      <PageHeader title="Site Audit" subtitle="Measured issues from our own crawl." actions={<ProjectPicker />} />
      <EmptyState title="No completed crawl" hint="Run Site Crawl from SEO Intelligence → Overview first." />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Site Audit"
        subtitle={<>Every issue below is derived from a measured crawl signal. <SourceBadge source="Crawled by Webamazee" /></>}
        actions={<ProjectPicker />}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-3)' }}>Score</div><div className="mt-1 text-3xl font-extrabold" style={{ color: 'var(--accent)' }}>{data.score ?? '—'}<span className="text-sm" style={{ color: 'var(--text-3)' }}>/100</span></div><div className="mt-1 text-[10px]" style={{ color: 'var(--text-3)' }}>{data.scoreFormula}</div></Card>
        <Card><div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-3)' }}>Open issues</div><div className="mt-1 text-3xl font-extrabold" style={{ color: 'var(--text)' }}>{data.total}</div></Card>
        <Card className="md:col-span-2"><div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-3)' }}>By category</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.categories.map((c) => {
              const n = data.byCategory.find((x) => x._id === c)?.count ?? 0;
              return (
                <button key={c} onClick={() => setCategory(category === c ? '' : c)} className="badge"
                  style={{ background: category === c ? 'var(--accent)' : 'var(--bg-soft)', color: category === c ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)' }}>
                  {c} · {n}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mb-3 flex items-center gap-2">
        {['', 'Critical', 'High', 'Medium', 'Low', 'Informational'].map((s) => (
          <button key={s || 'all'} onClick={() => setSeverity(s)} className="badge"
            style={{ background: severity === s ? 'var(--accent-soft)' : 'transparent', color: severity === s ? 'var(--accent)' : 'var(--text-3)', border: '1px solid var(--border)' }}>
            {s || 'All severities'}
          </button>
        ))}
      </div>

      <Card pad={false}>
        <SectionTitle><span className="px-5 pt-4 block">Detected SEO issues ({data.total})</span><span className="px-5 pt-4"><SourceBadge source="Crawled by Webamazee" /></span></SectionTitle>
        {data.issues.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>No issues match — great, or broaden the filters.</div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {data.issues.map((i) => (
              <li key={i._id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge value={i.severity} />
                  <span className="badge" style={{ background: 'var(--bg-soft)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>{i.category}</span>
                  <span className="min-w-0 flex-1 font-bold" style={{ color: 'var(--text)' }}>{i.title}</span>
                  {i.url && <Link href={`/app/seo/pages`} className="text-[11px] link max-w-[300px] truncate">{cut(i.url, 70)}</Link>}
                </div>
                {i.description && <p className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>{i.description}</p>}
                <p className="mt-0.5 font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>rule: {i.ruleKey} · detected {new Date(i.detectedAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="mt-5"><LimitationNote /></div>
    </div>
  );
}
