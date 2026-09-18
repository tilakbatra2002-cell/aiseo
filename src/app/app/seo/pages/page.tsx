'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { ProjectPicker, SectionTitle, SourceBadge, Td, Th, cut, useApi, useProjectParam, withProject } from '../_seo-ui';

interface PageRow { _id: string; finalUrl: string; status: number; title?: string; noindex?: boolean; depth: number; fetchedAt: string }

export default function SeoPagesPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const [flag, setFlag] = useState('');
  const url = withProject(`/api/seo/pages?limit=150${flag ? `&${flag}=1` : ''}`, project);
  const { data, loading } = useApi<{ items: PageRow[]; total: number }>(url, [flag]);

  return (
    <div>
      <PageHeader title="Pages" subtitle={<>Client-side view of every URL in the latest crawl — click for full Page Explorer. <SourceBadge source="Crawled by Webamazee" /></>} actions={<ProjectPicker />} />
      <div className="mb-3 flex flex-wrap gap-2">
        {[['', 'All'], ['noindex', 'Noindex'], ['thin', 'Thin (<300 words)'], ['missingTitle', 'Missing title'], ['missingMeta', 'Missing meta']].map(([v, label]) => (
          <button key={label} onClick={() => setFlag(v)} className="badge" style={{ background: flag === v ? 'var(--accent-soft)' : 'transparent', color: flag === v ? 'var(--accent)' : 'var(--text-2)', border: '1px solid var(--border)' }}>{label}</button>
        ))}
      </div>
      <Card pad={false}>
        <div className="px-5 pt-4"><SectionTitle right={<SourceBadge source="Crawled by Webamazee" />}>{data ? `${data.total} page(s)` : 'Pages'}</SectionTitle></div>
        {loading ? <div className="grid h-40 place-items-center"><Spinner /></div> : !data?.items.length ? (
          <EmptyState title="No pages" hint="Run Site Crawl from SEO Intelligence → Overview." />
        ) : (
          <table className="w-full">
            <thead><tr><Th>URL</Th><Th>Status</Th><Th>Title</Th><Th>Depth</Th><Th>Fetched</Th></tr></thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <Td><Link className="link font-semibold" href={`/app/seo/pages/${p._id}`}>{cut(p.finalUrl.replace(/^https?:\/\//, ''), 60)}</Link></Td>
                  <Td><span className="badge" style={{ background: p.status === 200 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: p.status === 200 ? '#059669' : '#dc2626' }}>{p.status || 'ERR'}{p.noindex ? ' · noindex' : ''}</span></Td>
                  <Td style={{ color: 'var(--text-2)' }}>{cut(p.title, 50)}</Td>
                  <Td>{p.depth}</Td>
                  <Td style={{ color: 'var(--text-3)' }}>{new Date(p.fetchedAt).toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
