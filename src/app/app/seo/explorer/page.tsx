'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { ProjectPicker, SectionTitle, SourceBadge, Td, Th, cut, fmtMs, useApi, useProjectParam, withProject } from '../_seo-ui';

interface PageRow { _id: string; finalUrl: string; status: number; title?: string; metaDescription?: string; h1?: string[]; wordCount?: number; depth: number; internalLinks?: string[]; externalLinks?: string[]; structuredDataTypes?: string[]; ttfbMs?: number; inlinkCount?: number; noindex?: boolean }

export default function SiteExplorerPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const [q, setQ] = useState('');
  const [codeClass, setCodeClass] = useState('');
  const url = withProject(`/api/seo/pages?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}${codeClass ? `&codeClass=${codeClass}` : ''}`, project);
  const { data, loading } = useApi<{ items: PageRow[]; total: number; crawlId?: string }>(url, []);

  return (
    <div>
      <PageHeader title="Site Explorer" subtitle={<>Browse every crawled page of the latest first-party crawl. <SourceBadge source="Crawled by Webamazee" /></>} actions={<ProjectPicker />} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input" placeholder="Search URL or title…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
          {['', '2xx', '4xx', '5xx'].map((c) => (
            <button key={c || 'all'} onClick={() => setCodeClass(c)} className="badge" style={{ background: codeClass === c ? 'var(--accent-soft)' : 'transparent', color: codeClass === c ? 'var(--accent)' : 'var(--text-2)', border: '1px solid var(--border)' }}>{c || 'All status'}</button>
          ))}
          <span className="ml-auto text-xs" style={{ color: 'var(--text-3)' }}>{data ? `${data.total} page(s)${data.total > 100 ? ' · first 100 shown' : ''}` : ''}</span>
        </div>
      </Card>

      <Card pad={false}>
        <div className="px-5 pt-4"><SectionTitle right={<SourceBadge source="Crawled by Webamazee" />}>Pages (latest crawl)</SectionTitle></div>
        {loading ? <div className="grid h-40 place-items-center"><Spinner /></div> : !data?.items.length ? (
          <EmptyState title="No pages" hint="Run Site Crawl from SEO Intelligence → Overview." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead><tr><Th>URL</Th><Th>Status</Th><Th>Title</Th><Th>Words</Th><Th>Depth</Th><Th>Inlinks</Th><Th>Schema</Th><Th>TTFB</Th></tr></thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <Td><Link className="link font-semibold" href={`/app/seo/pages/${p._id}`}>{cut(p.finalUrl.replace(/^https?:\/\//, ''), 52)}</Link></Td>
                    <Td>
                      <span className="badge" style={{ background: p.status >= 200 && p.status < 300 ? 'rgba(16,185,129,0.12)' : p.status >= 400 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', color: p.status >= 200 && p.status < 300 ? '#059669' : p.status >= 400 ? '#dc2626' : '#d97706' }}>
                        {p.status || 'ERR'}{p.noindex ? ' · noindex' : ''}
                      </span>
                    </Td>
                    <Td style={{ color: 'var(--text-2)' }}>{cut(p.title, 44)}</Td>
                    <Td>{p.wordCount ?? '—'}</Td>
                    <Td>{p.depth}</Td>
                    <Td>{p.inlinkCount ?? p.internalLinks?.length ?? '—'}</Td>
                    <Td style={{ color: 'var(--text-2)' }}>{cut((p.structuredDataTypes ?? []).join(', ') || '—', 24)}</Td>
                    <Td style={{ color: (p.ttfbMs ?? 0) > 1500 ? '#dc2626' : 'var(--text-2)' }}>{fmtMs(p.ttfbMs)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
