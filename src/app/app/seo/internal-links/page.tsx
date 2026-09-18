'use client';

import { Card, EmptyState, PageHeader, Spinner, Tag } from '@/components/ui';
import { ProjectPicker, SectionTitle, SourceBadge, Td, Th, cut, useApi, useProjectParam, withProject } from '../_seo-ui';

interface Links {
  available: boolean; reason?: string;
  totals?: { edges: number; pages: number };
  topTargets?: { url: string; incomingPages: number; linkCount: number; topAnchors: { anchor: string; count: number }[] }[];
  orphanCandidates?: { url: string; depth: number; wordCount?: number }[];
  weakPages?: { url: string; incomingPages: number }[];
  excessive?: { url: string; outgoing: number }[];
  anchorTop?: { anchor: string; count: number }[];
  graph?: { nodes: { id: string; label: string; kind: 'root' | 'page' }[]; edges: { from: string; to: string; weight: number }[] };
  note?: string;
}

export default function InternalLinksPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const { data, loading } = useApi<Links>(withProject('/api/seo/internal-links', project), [project]);
  if (loading) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  if (!data?.available) return (
    <div>
      <PageHeader title="Internal Links" subtitle="Link-graph analysis from your latest first-party crawl." actions={<ProjectPicker />} />
      <EmptyState title="No link graph yet" hint={data?.reason ?? 'Run Site Crawl from SEO Intelligence → Overview.'} />
    </div>
  );

  return (
    <div>
      <PageHeader title="Internal Links" subtitle={<>Anchors, orphan candidates and link distribution from your own crawl. <SourceBadge source="Crawled by Webamazee" /></>} actions={<ProjectPicker />} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-3)' }}>Internal link edges</div><div className="mt-1 text-2xl font-extrabold" style={{ color: 'var(--accent)' }}>{data.totals!.edges}</div></Card>
        <Card><div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-3)' }}>Pages in graph</div><div className="mt-1 text-2xl font-extrabold" style={{ color: 'var(--text)' }}>{data.totals!.pages}</div></Card>
        <Card><div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-3)' }}>Orphan candidates</div><div className="mt-1 text-2xl font-extrabold" style={{ color: (data.orphanCandidates!.length ? '#dc2626' : 'var(--text)') }}>{data.orphanCandidates!.length}</div></Card>
        <Card><div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-3)' }}>Weakly linked</div><div className="mt-1 text-2xl font-extrabold" style={{ color: 'var(--text)' }}>{data.weakPages!.length}</div></Card>
      </div>

      {data.graph && <LinkGraph graph={data.graph} />}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card pad={false}>
          <div className="px-5 pt-4"><SectionTitle>Most linked pages</SectionTitle></div>
          <table className="w-full">
            <thead><tr><Th>URL</Th><Th>In-linking pages</Th><Th>Top anchors</Th></tr></thead>
            <tbody>
              {data.topTargets!.slice(0, 12).map((t) => (
                <tr key={t.url} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <Td style={{ color: 'var(--text-2)' }}>{cut(t.url.replace(/^https?:\/\//, ''), 44)}</Td>
                  <Td className="font-extrabold" style={{ color: 'var(--accent)' }}>{t.incomingPages}</Td>
                  <Td style={{ color: 'var(--text-2)' }}>{t.topAnchors.slice(0, 3).map((a) => cut(a.anchor, 18)).join(' · ')}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="space-y-5">
          <Card pad={false}>
            <div className="px-5 pt-4"><SectionTitle>Orphan candidates ({data.orphanCandidates!.length})</SectionTitle></div>
            {data.orphanCandidates!.length === 0 ? <div className="p-5 text-xs" style={{ color: '#059669' }}>None detected — every discovered page has internal inlinks.</div> : (
              <ul className="max-h-56 divide-y overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
                {data.orphanCandidates!.slice(0, 25).map((o) => (
                  <li key={o.url} className="flex items-center gap-2 px-5 py-2 text-xs">
                    <Tag tone="blue">depth {o.depth}</Tag>
                    <span style={{ color: 'var(--text)' }}>{cut(o.url.replace(/^https?:\/\//, ''), 60)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="p-4 text-[10px]" style={{ color: 'var(--text-3)' }}>Orphan = page discovered via sitemap/crawl with zero measured internal inlinks.</p>
          </Card>

          <Card pad={false}>
            <div className="px-5 pt-4"><SectionTitle>Top anchor text</SectionTitle></div>
            <div className="flex flex-wrap gap-1.5 p-5">
              {data.anchorTop!.slice(0, 20).map((a) => (
                <span key={a.anchor} className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }} title={`${a.count} link(s)`}>{cut(a.anchor, 26)} ×{a.count}</span>
              ))}
            </div>
          </Card>
        </div>
      </div>
      {data.note && <p className="mt-3 text-xs" style={{ color: 'var(--text-3)' }}>{data.note}</p>}
    </div>
  );
}

function LinkGraph({ graph }: { graph: NonNullable<Links['graph']> }) {
  const w = 640; const h = 300; const cx = w / 2; const cy = h / 2; const R = 105;
  const pages = graph.nodes.filter((n) => n.kind === 'page');
  const maxW = Math.max(...graph.edges.map((e) => e.weight), 1);
  return (
    <Card>
      <SectionTitle right={<SourceBadge source="Crawled by Webamazee" />}>Internal link hubs (sample)</SectionTitle>
      <div className="flex justify-center overflow-x-auto">
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          {pages.map((n, i) => {
            const a = (i / pages.length) * Math.PI * 2 - Math.PI / 2;
            const x = cx + Math.cos(a) * R; const y = cy + Math.sin(a) * R;
            const e = graph.edges[i];
            const lw = 1 + (e ? (e.weight / maxW) * 5 : 0);
            return (
              <g key={n.id}>
                <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--accent)" strokeWidth={lw} opacity={0.4} />
                <circle cx={x} cy={y} r={9} fill="var(--bg-panel)" stroke="var(--accent)" strokeWidth={1.5} />
                <text x={x} y={y + 20} textAnchor="middle" fontSize={8.5} fill="var(--text-2)">{n.label}</text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={14} fill="var(--accent)" />
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff">SITE</text>
        </svg>
      </div>
      <p className="mt-1 text-center text-[10px]" style={{ color: 'var(--text-3)' }}>Line weight = number of discovered linking pages (top hubs sampled).</p>
    </Card>
  );
}
