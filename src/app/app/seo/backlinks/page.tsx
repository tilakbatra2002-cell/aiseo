'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, EmptyState, PageHeader, Spinner, Tag } from '@/components/ui';
import { LimitationNote, ProjectPicker, SectionTitle, SourceBadge, Td, Th, cut, useApi, useProjectParam, withProject } from '../_seo-ui';

interface Backlink { _id: string; sourceUrl: string; targetUrl: string; anchor: string; followType: string; firstSeenAt: string; lastCheckedAt?: string; status: string; source: string }
interface Data {
  items: (Backlink & { sourcePageTitle?: string | null })[]; total: number;
  bySource: { _id: string; count: number }[]; byFollow: { _id: string; count: number }[];
  imports: { _id: string; filename?: string; rowsImported: number; rowsSkipped: number; createdAt: string }[];
  referringDomains: number; topSourceDomains: { domain: string; discoveredLinks: number }[];
  domainStrength: { available: boolean; reason?: string; score?: number; max?: number; signals?: Record<string, unknown>; formula?: string; disclaimer?: string };
  label: string; disclaimer: string;
}

export default function BacklinksPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const { data, loading, reload } = useApi<Data>(withProject(`/api/seo/backlinks${q ? `?q=${encodeURIComponent(q)}` : ''}`, project), []);

  const importCsv = async () => {
    setMsg('');
    try {
      const r = await api<{ rowsImported: number; rowsSkipped: number; label: string }>(withProject('/api/seo/backlinks', project), { method: 'POST', body: JSON.stringify({ csv }) });
      setMsg(`Imported ${r.rowsImported} backlink(s) · ${r.rowsSkipped} skipped. ${r.label}`);
      setCsv(''); reload();
    } catch (e) { setMsg((e as Error).message); }
  };

  return (
    <div>
      <PageHeader
        title="Backlink Intelligence"
        subtitle={<><b>Discovered Backlinks</b> — links found by our crawler, imported by you, or provided by connected Google data. Never labelled as a “total backlink” index.</>}
        actions={<ProjectPicker />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-3)' }}>Discovered backlinks</div><div className="mt-1 text-2xl font-extrabold" style={{ color: 'var(--accent)' }}>{data?.total ?? 0}</div><div className="mt-1 text-[10px]" style={{ color: 'var(--text-3)' }}>partial dataset</div></Card>
        <Card><div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-3)' }}>Referring domains</div><div className="mt-1 text-2xl font-extrabold" style={{ color: 'var(--text)' }}>{data?.referringDomains ?? 0}</div><div className="mt-1 text-[10px]" style={{ color: 'var(--text-3)' }}>discovered</div></Card>
        <Card>
          <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-3)' }}>Webamazee Domain Strength</div>
          {data?.domainStrength?.available
            ? <div className="mt-1 text-2xl font-extrabold" style={{ color: 'var(--accent)' }}>{data.domainStrength.score}<span className="text-sm" style={{ color: 'var(--text-3)' }}>/{data.domainStrength.max}</span></div>
            : <div className="mt-1 text-sm font-bold" style={{ color: 'var(--text-3)' }}>{data?.domainStrength?.reason ?? 'Requires crawl'}</div>}
          <div className="mt-1 text-[10px]" style={{ color: 'var(--text-3)' }}>first-party, internal scale</div>
        </Card>
        {(data?.bySource ?? []).slice(0, 1).map((s) => (
          <Card key={s._id}><div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-3)' }}>Source · {s._id}</div><div className="mt-1 text-2xl font-extrabold" style={{ color: 'var(--text)' }}>{s.count}</div></Card>
        ))}
      </div>

      {data?.domainStrength?.available && (
        <Card className="mb-4">
          <SectionTitle right={<SourceBadge source="Observed by Webamazee" />}>Webamazee Domain Strength — how it's calculated</SectionTitle>
          <div className="grid gap-2 text-xs md:grid-cols-5" style={{ color: 'var(--text-2)' }}>
            {Object.entries(data.domainStrength.signals ?? {}).map(([k, v]) => (
              <div key={k} className="rounded border p-2" style={{ borderColor: 'var(--border)' }}>
                <b className="capitalize" style={{ color: 'var(--text)' }}>{k}</b>: {(v as { points?: number }).points}/{(v as { max?: number }).max} pts
                <div className="mt-1 text-[10px]" style={{ color: 'var(--text-3)' }}>{JSON.stringify(v).replace(/[{}"]/g, '').replace(/,/g, ' · ').slice(0, 90)}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: 'var(--text-3)' }}>{data.domainStrength.formula}. <em>{data.domainStrength.disclaimer}</em></p>
        </Card>
      )}

      {(data?.topSourceDomains?.length ?? 0) > 0 && (
        <Card className="mb-4" pad={false}>
          <div className="px-5 pt-4"><SectionTitle right={<SourceBadge source="Observed by Webamazee" />}>Top referring domains (discovered)</SectionTitle></div>
          <div className="flex flex-wrap gap-1.5 p-5">
            {data!.topSourceDomains.map((d) => (
              <span key={d.domain} className="badge" style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>{d.domain} ×{d.discoveredLinks}</span>
            ))}
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <SectionTitle right={<SourceBadge source="User Import" />}>Import CSV</SectionTitle>
        <p className="mb-2 text-xs" style={{ color: 'var(--text-2)' }}>Columns: <code className="rounded px-1" style={{ background: 'var(--bg-soft)' }}>source_url, target_url, anchor_text, rel, discovered_at</code></p>
        <textarea className="input min-h-[110px] font-mono text-xs" placeholder={'source_url,target_url,anchor_text,rel,discovered_at\nhttps://blog.example/post,https://yoursite.com/,seo agency,,2026-09-01'} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <div className="mt-2 flex items-center gap-2">
          <button className="btn-primary" onClick={importCsv} disabled={!csv.trim()}>Import</button>
          {msg && <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{msg}</span>}
        </div>
        {(data?.imports.length ?? 0) > 0 && (
          <div className="mt-3 text-xs" style={{ color: 'var(--text-3)' }}>
            Recent imports: {data!.imports.map((i) => `${i.filename ?? 'csv'} (${i.rowsImported}/${i.rowsImported + i.rowsSkipped})`).join(' · ')}
          </div>
        )}
      </Card>

      <Card pad={false}>
        <div className="px-5 pt-4 flex items-center justify-between">
          <SectionTitle right={<SourceBadge source="Crawled by Webamazee + imports" />}>{data?.label ?? 'Backlinks'} ({data?.total ?? 0})</SectionTitle>
          <input className="input !py-1 text-xs" style={{ maxWidth: 220, marginBottom: 12 }} placeholder="Filter URL/anchor…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {loading ? <div className="grid h-32 place-items-center"><Spinner /></div> : !data?.items.length ? (
          <EmptyState title="No discovered backlinks yet" hint="Crawl competitor/partner sites or import a CSV above. We only show links we actually found — no synthetic backlink counts." />
        ) : (
          <table className="w-full">
            <thead><tr><Th>Source URL / page title</Th><Th>Target URL</Th><Th>Anchor</Th><Th>Type</Th><Th>First seen</Th><Th>Status</Th><Th>Source</Th></tr></thead>
            <tbody>
              {data.items.map((b) => (
                <tr key={b._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <Td style={{ color: 'var(--text-2)' }}>{cut(b.sourceUrl.replace(/^https?:\/\//, ''), 38)}{b.sourcePageTitle ? <span className="ml-1 text-[10px]" style={{ color: 'var(--text-3)' }}>“{cut(b.sourcePageTitle, 24)}”</span> : null}</Td>
                  <Td className="font-semibold">{cut(b.targetUrl.replace(/^https?:\/\//, ''), 34)}</Td>
                  <Td style={{ color: 'var(--text-2)' }}>{cut(b.anchor, 22)}</Td>
                  <Td><Tag tone={b.followType === 'follow' ? 'blue' : undefined}>{b.followType}</Tag></Td>
                  <Td style={{ color: 'var(--text-3)' }}>{new Date(b.firstSeenAt).toLocaleDateString()}</Td>
                  <Td style={{ color: 'var(--text-3)' }}>{b.status.replace('_', ' ')}</Td>
                  <Td><SourceBadge source={b.source === 'import' ? 'User Import' : b.source === 'gsc' ? 'Google Search Console' : 'Crawled by Webamazee'} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <div className="mt-4"><Card><p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>{data?.disclaimer}</p></Card></div>
      <div className="mt-4"><LimitationNote /></div>
    </div>
  );
}
