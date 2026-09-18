'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, EmptyState, PageHeader, Spinner, Tag } from '@/components/ui';
import { LimitationNote, ProjectPicker, SectionTitle, SourceBadge, Td, Th, cut, useApi, useProjectParam, withProject } from '../_seo-ui';

interface Comp { _id: string; domain: string; name?: string; lastCrawlId?: string }
interface CompareRow {
  competitor: Comp; crawled: boolean; pages: number; score: number | null;
  issues: { total?: number } | null; title?: string | null; h1?: string | null;
  wordCountHome?: number | null; ttfbMsHome?: number | null; schemaTypesHome: string[]; topicSegments: string[];
}
interface Compare {
  self: { pages: number; score: number | null; title?: string | null; wordCountHome?: number | null; schemaTypesHome: string[]; topicSegments: string[] };
  competitors: CompareRow[];
  note: string;
}

export default function CompetitorsPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const list = useApi<{ items: Comp[] }>(withProject('/api/seo/competitors', project), []);
  const compare = useApi<Compare>(withProject('/api/seo/competitors?compare=1', project), []);

  const add = async () => {
    setError('');
    try { await api(withProject('/api/seo/competitors', project), { method: 'POST', body: JSON.stringify({ domain }) }); setDomain(''); list.reload(); compare.reload(); }
    catch (e) { setError((e as Error).message); }
  };
  const crawl = async (id: string) => {
    setBusy(id);
    try { await api(withProject('/api/seo/crawl', project), { method: 'POST', body: JSON.stringify({ type: 'competitor', competitorId: id }) }); setError('Crawl queued for this competitor — reload in a moment to see comparative data.'); }
    catch (e) { setError((e as Error).message); }
    setBusy('');
  };
  const remove = async (id: string) => {
    if (!confirm('Remove competitor? Crawl history is kept.')) return;
    await api(`/api/seo/competitors/${id}`, { method: 'DELETE' }); list.reload(); compare.reload();
  };

  const self = compare.data?.self;
  return (
    <div>
      <PageHeader title="Competitor Analysis" subtitle={<>We crawl publicly accessible competitor sites with the same first-party crawler. Only measured crawl facts are compared — no invented traffic/backlink/volume claims.</>} actions={<ProjectPicker />} />
      <Card className="mb-4">
        <div className="flex gap-2">
          <input className="input" placeholder="competitor-domain.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <button className="btn-primary" onClick={add} disabled={!domain.trim()}>Add competitor</button>
        </div>
        {error && <div className="mt-2 text-xs font-bold" style={{ color: /queued/.test(error) ? 'var(--accent)' : '#dc2626' }}>{error}</div>}
      </Card>

      {loadingOrEmpty(list)}

      {compare.data && (
        <Card pad={false}>
          <div className="px-5 pt-4"><SectionTitle right={<SourceBadge source="Crawled by Webamazee" />}>Measured comparison</SectionTitle></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px]">
              <thead><tr><Th></Th><Th>Pages</Th><Th>Score</Th><Th>Issues</Th><Th>Home title</Th><Th>Home words</Th><Th>Home TTFB</Th><Th>Schema (home)</Th><Th>Topics (URL segments)</Th><Th></Th></tr></thead>
              <tbody>
                <tr className="border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}>
                  <Td className="font-extrabold" style={{ color: 'var(--accent)' }}>Your site</Td>
                  <Td>{self?.pages ?? '—'}</Td>
                  <Td className="font-extrabold">{self?.score ?? '—'}</Td>
                  <Td>—</Td>
                  <Td style={{ color: 'var(--text-2)' }}>{cut(self?.title, 30)}</Td>
                  <Td>{self?.wordCountHome ?? '—'}</Td>
                  <Td>—</Td>
                  <Td style={{ color: 'var(--text-2)' }}>{cut((self?.schemaTypesHome ?? []).join(', ') || '—', 22)}</Td>
                  <Td style={{ color: 'var(--text-2)' }}>{cut((self?.topicSegments ?? []).join(', '), 40)}</Td>
                  <Td></Td>
                </tr>
                {compare.data.competitors.map((c) => (
                  <tr key={c.competitor._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <Td className="font-bold">{c.competitor.domain}{!c.crawled && <Tag>not crawled</Tag>}</Td>
                    <Td>{c.crawled ? c.pages : '—'}</Td>
                    <Td>{c.crawled ? c.score ?? '—' : '—'}</Td>
                    <Td>{c.crawled ? c.issues?.total ?? 0 : '—'}</Td>
                    <Td style={{ color: 'var(--text-2)' }}>{cut(c.title, 30)}</Td>
                    <Td>{c.crawled ? c.wordCountHome ?? '—' : '—'}</Td>
                    <Td>{c.crawled ? `${Math.round(c.ttfbMsHome ?? 0)}ms` : '—'}</Td>
                    <Td style={{ color: 'var(--text-2)' }}>{cut(c.schemaTypesHome.join(', ') || '—', 22)}</Td>
                    <Td style={{ color: 'var(--text-2)' }}>{cut(c.topicSegments.join(', '), 40)}</Td>
                    <Td>
                      <div className="flex gap-1">
                        <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={() => crawl(c.competitor._id)} disabled={busy === c.competitor._id}>{busy === c.competitor._id ? '…' : 'Crawl'}</button>
                        <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={() => remove(c.competitor._id)}>Remove</button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="p-4 text-xs" style={{ color: 'var(--text-3)' }}>{compare.data.note}</p>
        </Card>
      )}
      <div className="mt-4"><LimitationNote /></div>
    </div>
  );

  function loadingOrEmpty(l: { data: { items: Comp[] } | null; loading: boolean }) {
    if (l.loading) return <div className="grid h-24 place-items-center"><Spinner /></div>;
    if (!l.data?.items.length) return (
      <EmptyState title="No competitors yet" hint="Add competitor domains above. We crawl them with the same measured, robots-aware crawler and compare only observed structure — never fabricated visibility metrics." />
    );
    return null;
  }
}
