'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { Card, EmptyState, PageHeader, Spinner, Tag } from '@/components/ui';
import { LimitationNote, MiniBars, ProjectPicker, SectionTitle, SourceBadge, Td, Th, cut, useApi, useProjectParam, withProject } from '../_seo-ui';

interface Status {
  configured: boolean; connected: boolean;
  property: { siteUrl: string; lastSyncAt?: string; lastSyncRows?: number } | null;
  note: string;
}
interface Data {
  connected: boolean; siteUrl?: string; lastSyncAt?: string; source?: string;
  daily: { date: string; clicks: number; impressions: number; ctr: number; position: number }[];
  topQueries: { _id: string; clicks: number; impressions: number; ctr: number; position: number }[];
  topPages: { _id: string; clicks: number; impressions: number; ctr: number; position: number }[];
  positionLabel?: string; label?: string;
}

export default function GscPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const sp = useSearchParams();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const status = useApi<Status>(withProject('/api/seo/gsc', project), []);
  const data = useApi<Data>(withProject('/api/seo/gsc/data', project), []);

  useEffect(() => {
    if (sp.get('connected')) setMsg(`Connected to ${sp.get('site') ?? 'Search Console'}. Run a sync to pull real data.`);
    if (sp.get('error')) setMsg(`Connection issue: ${sp.get('error')}`);
  }, [sp]);

  const connect = async () => {
    setBusy('connect');
    try {
      const r = await api<{ url: string }>(withProject('/api/seo/gsc', project), { method: 'POST', body: JSON.stringify({ action: 'auth-url' }) });
      window.location.href = r.url;
    } catch (e) { setMsg((e as Error).message); setBusy(''); }
  };
  const sync = async () => {
    setBusy('sync'); setMsg('');
    try { await api(withProject('/api/seo/gsc', project), { method: 'POST', body: JSON.stringify({ action: 'sync' }) }); setMsg('Sync queued — the worker pulls ~90 days of real GSC rows. Reload shortly to see data.'); }
    catch (e) { setMsg((e as Error).message); }
    setBusy('');
  };

  return (
    <div>
      <PageHeader title="Google Search Console" subtitle="Real queries, clicks, impressions, CTR and average position — via OAuth, nothing fabricated." actions={<ProjectPicker />} />
      {msg && <Card className="mb-4 p-3 text-xs font-bold" style={{ color: 'var(--accent)' }}>{msg}</Card>}

      {status.loading ? <div className="grid h-40 place-items-center"><Spinner /></div> : !status.data?.configured ? (
        <Card>
          <SectionTitle>Requires Integration</SectionTitle>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>{status.data?.note}</p>
          <div className="mt-2"><Tag>Set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET, then restart. No alternative/fake metrics are shown.</Tag></div>
        </Card>
      ) : !status.data?.connected ? (
        <Card>
          <SectionTitle>Connect Search Console</SectionTitle>
          <p className="mb-3 text-xs" style={{ color: 'var(--text-2)' }}>{status.data.note}</p>
          <button className="btn-primary" onClick={connect} disabled={busy === 'connect'}>{busy === 'connect' ? 'Redirecting…' : 'Connect with Google'}</button>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Tag tone="blue">Connected · {status.data.property?.siteUrl}</Tag>
            {status.data.property?.lastSyncAt && <span className="text-xs" style={{ color: 'var(--text-3)' }}>Last sync {new Date(status.data.property.lastSyncAt).toLocaleString()} · {status.data.property.lastSyncRows ?? 0} rows</span>}
            <button className="btn-ghost text-xs" onClick={sync} disabled={busy === 'sync'}>{busy === 'sync' ? '…' : 'Sync now'}</button>
          </div>

          {!data.data?.daily.length ? (
            <EmptyState title="No GSC data synced yet" hint="Click “Sync now”. Only rows returned by the real Search Console API will appear here." />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card><SectionTitle right={<SourceBadge source="Google Search Console" />}>Clicks (30d view)</SectionTitle><MiniBars points={data.data.daily.slice(-30).map((d) => d.clicks)} /></Card>
                <Card><SectionTitle right={<SourceBadge source="Google Search Console" />}>Impressions</SectionTitle><MiniBars points={data.data.daily.slice(-30).map((d) => d.impressions)} /></Card>
                <Card><SectionTitle right={<SourceBadge source="Google Search Console" />}>Avg position</SectionTitle><MiniBars points={data.data.daily.slice(-30).map((d) => Math.max(0, 100 - d.position))} /><div className="mt-1 text-[10px]" style={{ color: 'var(--text-3)' }}>Higher bar = better position. {data.data.positionLabel}</div></Card>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card pad={false}>
                  <div className="px-5 pt-4"><SectionTitle right={<SourceBadge source="Google Search Console" />}>Top queries</SectionTitle></div>
                  <table className="w-full"><thead><tr><Th>Query</Th><Th>Clicks</Th><Th>Impr.</Th><Th>CTR</Th><Th>Pos (GSC avg)</Th></tr></thead>
                    <tbody>{data.data.topQueries.map((q) => (
                      <tr key={q._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <Td className="font-bold">{cut(q._id, 32)}</Td><Td>{q.clicks}</Td><Td>{q.impressions}</Td><Td>{(q.ctr * 100).toFixed(1)}%</Td><Td style={{ color: 'var(--accent)' }} className="font-extrabold">{q.position.toFixed(1)}</Td>
                      </tr>
                    ))}</tbody>
                  </table>
                </Card>
                <Card pad={false}>
                  <div className="px-5 pt-4"><SectionTitle right={<SourceBadge source="Google Search Console" />}>Top pages</SectionTitle></div>
                  <table className="w-full"><thead><tr><Th>Page</Th><Th>Clicks</Th><Th>Impr.</Th><Th>CTR</Th><Th>Pos</Th></tr></thead>
                    <tbody>{data.data.topPages.map((p) => (
                      <tr key={p._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <Td style={{ color: 'var(--text-2)' }}>{cut(p._id.replace(/^https?:\/\//, ''), 40)}</Td><Td>{p.clicks}</Td><Td>{p.impressions}</Td><Td>{(p.ctr * 100).toFixed(1)}%</Td><Td style={{ color: 'var(--accent)' }} className="font-extrabold">{p.position.toFixed(1)}</Td>
                      </tr>
                    ))}</tbody>
                  </table>
                </Card>
              </div>
            </>
          )}
        </>
      )}
      <div className="mt-4"><LimitationNote /></div>
    </div>
  );
}
