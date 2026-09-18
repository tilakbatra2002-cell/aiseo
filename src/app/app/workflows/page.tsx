'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Card, DemoTag, PageHeader, Spinner, StatusBadge, Tag, timeAgo } from '@/components/ui';

interface WData {
  templates: { _id: string; key: string; name: string; description: string; steps: { key: string; name: string; kind: string }[] }[];
  runs: { _id: string; status: string; currentStep: string; createdAt: string; completedAt?: string; project?: { _id: string; name: string; isDemo: boolean }; steps: { key: string; name: string; status: string }[] }[];
}

export default function WorkflowsPage() {
  const [data, setData] = useState<WData | null>(null);
  useEffect(() => {
    api<WData>('/api/workflows').then(setData).catch(() => undefined);
    const t = setInterval(() => { api<WData>('/api/workflows').then(setData).catch(() => undefined); }, 5000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <div className="grid h-40 place-items-center"><Spinner /></div>;

  return (
    <div>
      <PageHeader title="Workflows" subtitle="Reusable agent pipelines: sequenced steps, parallel execution, dependencies, retries and approval checkpoints." />

      <div className="grid gap-5 lg:grid-cols-2">
        {data.templates.map((w) => (
          <Card key={w._id}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-extrabold" style={{ color: 'var(--text)' }}>{w.name}</h3>
              <Tag tone="blue">template</Tag>
            </div>
            <p className="mb-4 text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>{w.description}</p>
            <ol className="space-y-1.5">
              {w.steps.map((s, i) => (
                <li key={s.key} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                  <span className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{i + 1}</span>
                  {s.name}
                  <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>({s.kind})</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}

        <Card>
          <h3 className="mb-3 font-extrabold" style={{ color: 'var(--text)' }}>Workflow Runs</h3>
          {data.runs.length === 0 && <p className="text-xs" style={{ color: 'var(--text-3)' }}>No runs yet — start a project discovery.</p>}
          <ul className="space-y-3">
            {data.runs.map((r) => (
              <li key={r._id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between gap-2">
                  <Link className="link text-sm font-bold" href={`/app/projects/${r.project?._id}`}>
                    {r.project?.name ?? '—'}
                  </Link>
                  <div className="flex items-center gap-2">
                    {r.project?.isDemo && <DemoTag />}
                    <StatusBadge value={r.status === 'waiting_approval' ? 'Needs Approval' : r.status === 'running' ? 'Running' : r.status === 'completed' ? 'Completed' : r.status === 'failed' ? 'Failed' : 'Cancelled'} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.steps.map((s) => (
                    <span key={s.key} className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                      style={{
                        background: s.status === 'completed' ? 'rgba(16,185,129,0.12)' : s.status === 'running' ? 'var(--accent-soft)' : s.status === 'failed' ? 'rgba(239,68,68,0.12)' : 'var(--bg-soft)',
                        color: s.status === 'completed' ? '#059669' : s.status === 'running' ? 'var(--accent)' : s.status === 'failed' ? '#dc2626' : 'var(--text-3)',
                      }}>
                      {s.name.split(' ')[0]}: {s.status}
                    </span>
                  ))}
                </div>
                <div className="mt-1.5 text-[10px]" style={{ color: 'var(--text-3)' }}>Started {timeAgo(r.createdAt)}{r.completedAt ? ` · finished ${timeAgo(r.completedAt)}` : ''}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
