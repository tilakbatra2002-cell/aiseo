'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Card, EmptyState, PageHeader, Spinner, Tag } from '@/components/ui';
import { ProjectPicker, SectionTitle, SourceBadge, useApi, useProjectParam, withProject } from '../_seo-ui';

interface Item { _id: string; title: string; summary?: string; createdAt: string; verificationStatus?: string; generatedBy?: { name?: string } }

export default function SeoReportsPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const { data, loading, reload } = useApi<{ items: Item[] }>(withProject('/api/seo/reports', project), []);

  const generate = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api<{ _id: string }>(withProject('/api/seo/reports', project), { method: 'POST', body: JSON.stringify({}) });
      setMsg('Report generated from measured SEO Intelligence data.');
      reload();
      void r;
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader
        title="SEO Intelligence Reports"
        subtitle={<>Deliverables compiled from your own crawl data — flagged-by-source, no invented metrics.</>}
        actions={<><ProjectPicker /><button className="btn-primary" onClick={generate} disabled={busy}>{busy ? 'Building…' : '+ Generate report'}</button></>}
      />
      {msg && <Card className="mb-4 p-3 text-xs font-bold" style={{ color: 'var(--accent)' }}>{msg}</Card>}

      {loading ? <div className="grid h-40 place-items-center"><Spinner /></div> : !data?.items.length ? (
        <EmptyState title="No SEO Intelligence reports yet" hint="Run a Site Crawl first, then generate a report — it compiles score, measured issues, link analysis and GSC data (if connected)." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.items.map((r) => (
            <Link key={r._id} href={`/app/reports/${r._id}`}>
              <Card className="h-full hover:border-[var(--accent)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Tag tone="blue">seo_intelligence report</Tag>
                  <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <h3 className="font-extrabold leading-snug" style={{ color: 'var(--text)' }}>{r.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>{r.summary}</p>
                <div className="mt-3 flex items-center justify-between text-[11px]" style={{ color: 'var(--text-3)' }}>
                  <span>by {r.generatedBy?.name ?? 'SEO Intelligence'}</span>
                  <SourceBadge source="Crawled by Webamazee" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
