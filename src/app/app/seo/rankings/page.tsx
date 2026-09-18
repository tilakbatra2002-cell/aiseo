'use client';

import { Card, EmptyState, PageHeader, Spinner, Tag } from '@/components/ui';
import { LimitationNote, ProjectPicker, SectionTitle, SourceBadge, Sparkline, Td, Th, cut, useApi, useProjectParam, withProject } from '../_seo-ui';

interface Kw {
  _id: string; term: string; country: string; device: string; targetUrl?: string;
  latestRank?: { position: number; date: string; sourceLabel: string } | null;
  history: { date: string; position: number }[];
}

export default function RankingsPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const { data, loading } = useApi<{ items: Kw[]; note: string }>(withProject('/api/seo/keywords', project), [project]);
  if (loading) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  const withRank = (data?.items ?? []).filter((k) => k.latestRank);
  const withoutRank = (data?.items ?? []).filter((k) => !k.latestRank);

  return (
    <div>
      <PageHeader title="Rank Tracking" subtitle={<>Positions come only from connected <b>Google Search Console</b> and are labelled <b>GSC Average Position</b> — never presented as a universal exact rank.</>} actions={<ProjectPicker />} />
      {withRank.length === 0 ? (
        <EmptyState
          title="No verified ranking observations yet"
          hint="Track keywords on the Keywords page and connect Google Search Console (GSC page). Only real GSC average positions appear here — no fake rank checker."
        />
      ) : (
        <Card pad={false}>
          <div className="px-5 pt-4"><SectionTitle right={<SourceBadge source="Google Search Console" />}>GSC Average Position ({withRank.length})</SectionTitle></div>
          <table className="w-full">
            <thead><tr><Th>Keyword</Th><Th>Position (GSC avg)</Th><Th>Trend</Th><Th>Target URL</Th><Th>Last observed</Th></tr></thead>
            <tbody>
              {withRank.map((k) => (
                <tr key={k._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <Td className="font-bold">{k.term}</Td>
                  <Td><span className="text-lg font-extrabold" style={{ color: 'var(--accent)' }}>#{k.latestRank!.position.toFixed(1)}</span></Td>
                  <Td>{k.history.length > 1 ? <Sparkline points={k.history.map((h) => -h.position)} height={28} /> : <span style={{ color: 'var(--text-3)' }}>—</span>}</Td>
                  <Td style={{ color: 'var(--text-2)' }}>{cut(k.targetUrl?.replace(/^https?:\/\//, ''), 36)}</Td>
                  <Td style={{ color: 'var(--text-3)' }}>{k.latestRank!.date}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {withoutRank.length > 0 && (
        <Card className="mt-4">
          <SectionTitle>Tracked keywords without position data</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {withoutRank.map((k) => <Tag key={k._id}>{k.term}</Tag>)}
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>Requires Integration — connect Google Search Console to measure real positions for these keywords.</p>
        </Card>
      )}
      <div className="mt-4"><LimitationNote /></div>
    </div>
  );
}
