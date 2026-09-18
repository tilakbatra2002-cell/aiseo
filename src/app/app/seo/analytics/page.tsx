'use client';

import { Card, EmptyState, PageHeader, Spinner, Tag } from '@/components/ui';
import { LimitationNote, MiniBars, ProjectPicker, SectionTitle, SourceBadge, useApi, useProjectParam, withProject } from '../_seo-ui';

interface Data {
  connected: boolean;
  integration: { status: string; connectedAt?: string } | null;
  snapshots: { date: string; sessions?: number; users?: number; pageviews?: number; engagementRate?: number }[];
  note: string;
}

export default function AnalyticsPage() {
  const project = useProjectParam();
  return <Inner key={project} project={project} />;
}

function Inner({ project }: { project: string }) {
  const { data, loading } = useApi<Data>(withProject('/api/seo/analytics', project), [project]);
  if (loading) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Real Google Analytics 4 data where connected. Zero synthetic traffic metrics." actions={<ProjectPicker />} />
      {!data?.connected ? (
        <Card>
          <SectionTitle>Requires Integration — Google Analytics 4</SectionTitle>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>{data?.note}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Tag>Sessions · Users · Engagement · Conversions — unavailable until connected, never fabricated</Tag>
          </div>
        </Card>
      ) : !data.snapshots.length ? (
        <EmptyState title="GA4 connected — no snapshots yet" hint="Data will appear after the GA4 sync runs. Only real API rows are stored." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card><SectionTitle right={<SourceBadge source="Google Analytics" />}>Sessions</SectionTitle><MiniBars points={data.snapshots.slice(-30).map((s) => s.sessions ?? 0)} /></Card>
          <Card><SectionTitle right={<SourceBadge source="Google Analytics" />}>Users</SectionTitle><MiniBars points={data.snapshots.slice(-30).map((s) => s.users ?? 0)} /></Card>
        </div>
      )}
      <div className="mt-4"><LimitationNote /></div>
    </div>
  );
}
