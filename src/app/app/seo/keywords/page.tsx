'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, EmptyState, PageHeader, Spinner, Tag } from '@/components/ui';
import { LimitationNote, ProjectPicker, SectionTitle, SourceBadge, Td, Th, cut, useApi, useProjectParam, withProject } from '../_seo-ui';

interface Kw { _id: string; term: string; targetUrl?: string; country: string; device: string; intent?: string; source: string; volume: string; latestRank?: { position: number; date: string; sourceLabel: string } | null; firstParty?: { pagesWithTermInTitle: number; pagesWithTermInHeading: number; pagesWithTermInMeta: number; pagesWithTermInAnchor: number; mappedPage: string | null; cannibalizationSignal: boolean; coverage: string; label: string } | null }

export default function KeywordsPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const [term, setTerm] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [country, setCountry] = useState('us');
  const [device, setDevice] = useState('desktop');
  const [error, setError] = useState('');
  const { data, loading, reload } = useApi<{ items: Kw[]; note: string }>(withProject('/api/seo/keywords', project), []);

  const add = async () => {
    setError('');
    try {
      await api(withProject('/api/seo/keywords', project), { method: 'POST', body: JSON.stringify({ term, targetUrl, country, device }) });
      setTerm(''); setTargetUrl(''); reload();
    } catch (e) { setError((e as Error).message); }
  };
  const remove = async (id: string) => {
    if (!confirm('Delete this keyword and its observation history?')) return;
    await api(`/api/seo/keywords/${id}`, { method: 'DELETE' }); reload();
  };

  return (
    <div>
      <PageHeader title="Keyword Intelligence" subtitle={<>Keyword tracking grounded in observed data. Volume/CPC/difficulty require proprietary datasets and are therefore <b>Unavailable</b> — never invented.</>} actions={<ProjectPicker />} />
      <Card className="mb-4">
        <div className="grid gap-2 md:grid-cols-[2fr_2fr_1fr_1fr_auto]">
          <input className="input" placeholder="Keyword (e.g. plumber austin)" value={term} onChange={(e) => setTerm(e.target.value)} />
          <input className="input" placeholder="Target URL (optional)" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} />
          <input className="input" placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
          <select className="input" value={device} onChange={(e) => setDevice(e.target.value)}><option>desktop</option><option>mobile</option><option>tablet</option></select>
          <button className="btn-primary" onClick={add} disabled={!term.trim()}>Track</button>
        </div>
        {error && <div className="mt-2 text-xs font-bold text-red-600">{error}</div>}
      </Card>

      <Card pad={false}>
        <div className="px-5 pt-4"><SectionTitle right={<SourceBadge source="Observed data (crawl + connected GSC)" />}>Tracked keywords ({data?.items.length ?? 0})</SectionTitle></div>
        {loading ? <div className="grid h-40 place-items-center"><Spinner /></div> : !data?.items.length ? (
          <EmptyState title="No keywords tracked" hint="Add keywords above. When Search Console is connected, positions appear as labelled GSC Average Position — never fabricated ranks." />
        ) : (
          <table className="w-full">
            <thead><tr><Th>Keyword</Th><Th>Intent</Th><Th>Target URL</Th><Th>Volume</Th><Th>Position</Th><Th>Coverage (Webamazee-derived)</Th><Th></Th></tr></thead>
            <tbody>
              {data.items.map((k) => (
                <tr key={k._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <Td className="font-bold">{k.term}</Td>
                  <Td><Tag>{k.intent ?? 'Unclassified'}</Tag></Td>
                  <Td style={{ color: 'var(--text-2)' }}>{cut(k.targetUrl?.replace(/^https?:\/\//, ''), 34)}</Td>
                  <Td><span className="badge" style={{ background: 'var(--bg-soft)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>{k.volume ?? 'Unavailable'}</span></Td>
                  <Td>
                    {k.latestRank
                      ? <span title={k.latestRank.sourceLabel} className="font-extrabold" style={{ color: 'var(--accent)' }}>#{k.latestRank.position.toFixed(1)} <span className="text-[10px] font-semibold" style={{ color: 'var(--text-3)' }}>GSC avg · {k.latestRank.date}</span></span>
                      : <span title="Requires connected Google Search Console" style={{ color: 'var(--text-3)' }}>Requires Integration</span>}
                  </Td>
                  <Td>
                    {k.firstParty ? (
                      <span className="flex flex-wrap items-center gap-1" title={k.firstParty.mappedPage ? `Best mapped page: ${k.firstParty.mappedPage}` : 'No page covers this term in title/heading/meta/anchors'}>
                        <Tag tone={k.firstParty.coverage === 'strong' ? 'blue' : undefined}>{k.firstParty.coverage}</Tag>
                        <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                          title×{k.firstParty.pagesWithTermInTitle} · h×{k.firstParty.pagesWithTermInHeading} · anchor×{k.firstParty.pagesWithTermInAnchor}
                          {k.firstParty.cannibalizationSignal ? ' · cannibalization?' : ''}
                        </span>
                      </span>
                    ) : <span style={{ color: 'var(--text-3)' }}>Requires crawl</span>}
                  </Td>
                  <Td><button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={() => remove(k._id)}>Remove</button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>{data?.note}</p>
      <div className="mt-4"><LimitationNote /></div>
    </div>
  );
}
