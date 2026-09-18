'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { Card, PageHeader, SeverityBadge, Spinner, Tag } from '@/components/ui';
import { SectionTitle, SourceBadge, Td, Th, cut, fmtBytes, fmtMs } from '../../_seo-ui';

interface Detail {
  page: Record<string, unknown> & {
    finalUrl: string; status: number; ok: boolean; redirected: boolean; redirectChain: string[]; noindex?: boolean;
    title?: string; metaDescription?: string; h1?: string[]; headings?: { level: string; text: string }[];
    canonical?: string; robotsMeta?: string; wordCount?: number; depth: number; ttfbMs?: number; pageSizeBytes?: number;
    internalLinks?: string[]; externalLinks?: string[]; structuredDataTypes?: string[];
    hreflang?: { lang: string; href: string }[]; og?: Record<string, string>;
    imagesTotal?: number; imagesMissingAlt?: number; rawHtmlExcerpt?: string; indexable?: boolean; inlinkCount?: number;
  };
  inlinks: { fromUrl: string; anchor: string; followType: string }[];
  outlinks: { toUrl: string; anchor: string; followType: string; internal: boolean }[];
  issues: { _id: string; severity: string; title: string; ruleKey: string }[];
  collected: { method: string; fetchedAt: string };
  rawHtmlAvailable: boolean;
  rawHtmlNote: string;
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div className={`mt-1 break-words text-sm font-semibold ${mono ? 'font-mono text-xs' : ''}`} style={{ color: 'var(--text)' }}>{value ?? '—'}</div>
    </div>
  );
}

export default function PageExplorerPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  useEffect(() => { api<Detail>(`/api/seo/pages/${id}`).then(setD).catch((e) => setError(e.message)); }, [id]);

  if (error) return <Card>{error}</Card>;
  if (!d) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  const p = d.page;

  return (
    <div>
      <PageHeader
        title={<span className="break-all">{p.finalUrl}</span>}
        subtitle={<span className="flex flex-wrap items-center gap-2"><SourceBadge source="Crawled by Webamazee" /> <span style={{ color: 'var(--text-3)' }}>{d.collected.method} · {new Date(d.collected.fetchedAt).toLocaleString()}</span></span>}
        actions={<Tag tone="blue">{p.indexable ? 'Indexable' : 'Not indexable'}</Tag>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="HTTP Status" value={<span style={{ color: p.status === 200 ? '#059669' : '#dc2626' }}>{p.status || 'ERROR'}{p.redirected ? ` → redirected` : ''}</span>} />
        <Field label="Indexability" value={p.noindex ? 'noindex (excluded)' : p.status === 200 ? 'Indexable' : 'Not indexable'} />
        <Field label="Response time (TTFB)" value={<span style={{ color: (p.ttfbMs ?? 0) > 1500 ? '#dc2626' : undefined }}>{fmtMs(p.ttfbMs)}</span>} />
        <Field label="Page size (HTML)" value={fmtBytes(p.pageSizeBytes)} />
      </div>

      {d.issues.length > 0 && (
        <Card className="mb-5">
          <SectionTitle right={<SourceBadge source="Crawled by Webamazee" />}>Detected SEO issues on this page</SectionTitle>
          <ul className="space-y-2">
            {d.issues.map((i) => (
              <li key={i._id} className="flex items-center gap-2 text-sm"><SeverityBadge value={i.severity} /><span className="font-semibold" style={{ color: 'var(--text)' }}>{i.title}</span><span className="font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>{i.ruleKey}</span></li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <Field label="Title" value={p.title || <span style={{ color: '#dc2626' }}>Missing</span>} />
        <Field label="Meta description" value={p.metaDescription || <span style={{ color: '#dc2626' }}>Missing</span>} />
        <Field label="H1" value={(p.h1 ?? []).length ? (p.h1 ?? []).join(' · ') : <span style={{ color: '#dc2626' }}>Missing</span>} />
        <Field label="Canonical" value={p.canonical || 'Not set'} mono />
        <Field label="Robots meta" value={p.robotsMeta || 'Not set'} />
        <Field label="Word count" value={p.wordCount ?? '—'} />
        <Field label="Images" value={`${p.imagesTotal ?? 0} total · ${p.imagesMissingAlt ?? 0} missing alt`} />
        <Field label="Structured data" value={(p.structuredDataTypes ?? []).join(', ') || 'None detected'} />
      </div>

      {(p.hreflang ?? []).length > 0 && (
        <Card className="mb-5">
          <SectionTitle>Hreflang</SectionTitle>
          <table className="w-full"><thead><tr><Th>Lang</Th><Th>Href</Th></tr></thead>
            <tbody>{(p.hreflang ?? []).map((h, i) => <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}><Td>{h.lang}</Td><Td style={{ color: 'var(--text-2)' }}>{h.href}</Td></tr>)}</tbody>
          </table>
        </Card>
      )}

      {Object.keys(p.og ?? {}).length > 0 && (
        <Card className="mb-5">
          <SectionTitle>Open Graph</SectionTitle>
          <div className="grid gap-2">
            {Object.entries(p.og ?? {}).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs"><span className="w-32 shrink-0 font-mono font-bold" style={{ color: 'var(--text-3)' }}>{k}</span><span className="break-all" style={{ color: 'var(--text-2)' }}>{String(v)}</span></div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card pad={false}>
          <div className="px-5 pt-4"><SectionTitle>Incoming internal links ({d.inlinks.length})</SectionTitle></div>
          {d.inlinks.length === 0 ? <div className="p-5 text-xs" style={{ color: 'var(--text-3)' }}>No discovered inlinks — orphan-signal page.</div> : (
            <table className="w-full"><thead><tr><Th>From</Th><Th>Anchor</Th><Th>Type</Th></tr></thead>
              <tbody>{d.inlinks.slice(0, 20).map((l, i) => <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}><Td style={{ color: 'var(--text-2)' }}>{cut(l.fromUrl.replace(/^https?:\/\//, ''), 40)}</Td><Td>{cut(l.anchor, 24)}</Td><Td><Tag tone={l.followType === 'follow' ? 'blue' : undefined}>{l.followType}</Tag></Td></tr>)}</tbody>
            </table>
          )}
        </Card>
        <Card pad={false}>
          <div className="px-5 pt-4"><SectionTitle>Outgoing links ({d.outlinks.length})</SectionTitle></div>
          {d.outlinks.length === 0 ? <div className="p-5 text-xs" style={{ color: 'var(--text-3)' }}>No outgoing links discovered.</div> : (
            <table className="w-full"><thead><tr><Th>To</Th><Th>Anchor</Th><Th>Scope</Th></tr></thead>
              <tbody>{d.outlinks.slice(0, 20).map((l, i) => <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}><Td style={{ color: 'var(--text-2)' }}>{cut(l.toUrl.replace(/^https?:\/\//, ''), 40)}</Td><Td>{cut(l.anchor, 22)}</Td><Td><Tag tone={l.internal ? 'blue' : undefined}>{l.internal ? 'internal' : 'external'}</Tag></Td></tr>)}</tbody>
            </table>
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <div className="flex items-center justify-between">
          <SectionTitle>Raw HTML evidence</SectionTitle>
          <button className="btn-ghost !py-1 text-xs" onClick={() => setShowRaw(!showRaw)}>{showRaw ? 'Hide' : 'Show raw HTML'}</button>
        </div>
        <div className="mb-2 text-[10px]" style={{ color: 'var(--text-3)' }}>{d.rawHtmlNote}</div>
        {showRaw && (
          <pre className="max-h-[420px] overflow-auto rounded-lg border p-3 font-mono text-[10px] leading-relaxed" style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)', color: 'var(--text-2)' }}>
            {d.page.rawHtmlExcerpt ?? 'Raw HTML not captured for this page (collected before excerpt support).'}
          </pre>
        )}
      </Card>
    </div>
  );
}
