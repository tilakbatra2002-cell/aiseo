'use client';

import { Card, PageHeader, Spinner, Tag } from '@/components/ui';
import { LimitationNote, ProjectPicker, SectionTitle, SourceBadge, useApi, useProjectParam, withProject } from '../_seo-ui';

interface Gap {
  competitorTopicGaps: { topic: string; coveredBy: string[]; basis: 'observed' }[];
  gscQueryGaps: { query: string; impressions: number; basis: 'observed'; note: string }[];
  gscConnected: boolean;
  unmappedKeywords: number;
  weakAlignment: number;
  note: string;
  aiOpportunities: { topic: string; reason: string }[] | null;
  aiEnabled: boolean;
}

export default function ContentGapPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const { data, loading } = useApi<Gap>(withProject('/api/seo/content-gap', project), [project]);
  if (loading) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Content Gap" subtitle={<>Gaps computed from data we actually possess — crawls, competitor crawls, connected GSC. Each item is labelled <b>Observed</b> or <b>AI-derived</b>.</>} actions={<ProjectPicker />} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <SectionTitle right={<SourceBadge source="Crawled by Webamazee" />}>Topics competitors cover — you don't ({data.competitorTopicGaps.length})</SectionTitle>
          {data.competitorTopicGaps.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>No competitor topic gaps detected. Add competitors and crawl them to populate this panel.</p>
          ) : (
            <ul className="space-y-2">
              {data.competitorTopicGaps.map((g) => (
                <li key={g.topic} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                  <span className="font-mono font-bold" style={{ color: 'var(--accent)' }}>/{g.topic}</span>
                  <span className="text-xs" style={{ color: 'var(--text-2)' }}>covered by {g.coveredBy.join(', ')}</span>
                  <span className="ml-auto"><Tag tone="blue">Observed</Tag></span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle right={<SourceBadge source={data.gscConnected ? 'Google Search Console' : 'Requires Integration'} />}>GSC queries lacking dedicated pages ({data.gscQueryGaps.length})</SectionTitle>
          {!data.gscConnected ? (
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Search Console not connected — query-level gaps unavailable. No synthetic queries are generated.</p>
          ) : data.gscQueryGaps.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>No unmapped queries found.</p>
          ) : (
            <ul className="space-y-2">
              {data.gscQueryGaps.map((g) => (
                <li key={g.query} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                  <span className="font-bold" style={{ color: 'var(--text)' }}>{g.query}</span>
                  <span className="text-xs" style={{ color: 'var(--text-2)' }}>{g.impressions} impressions · {g.note}</span>
                  <span className="ml-auto"><Tag tone="blue">Observed</Tag></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <SectionTitle right={<SourceBadge source="AI Analysis" />}>AI-derived opportunities</SectionTitle>
        {!data.aiEnabled ? (
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            AI provider not enabled (AI is off by default in Webamazee). When enabled, suggestions appear here labelled
            <b> AI-derived opportunity</b> and grounded only in the observed data above — never invented keywords or volumes.
          </p>
        ) : (
          <ul className="space-y-2">
            {(data.aiOpportunities ?? []).map((o, i) => (
              <li key={i} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                <span className="font-bold" style={{ color: 'var(--text)' }}>{o.topic}</span>
                <span className="ml-2 text-xs" style={{ color: 'var(--text-2)' }}>{o.reason}</span>
                <span className="float-right"><Tag>AI-derived opportunity</Tag></span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-3 text-xs" style={{ color: 'var(--text-3)' }}>{data.note}</p>
      <div className="mt-4"><LimitationNote /></div>
    </div>
  );
}

