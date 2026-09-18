'use client';

import { useState } from 'react';
import { api, usePolling } from '@/lib/api-client';
import { Card, PageHeader, Spinner, StatusBadge, timeAgo } from '@/components/ui';

interface Job {
  _id: string; type: string; status: string; attempts: number; maxAttempts: number;
  runAfter: string; lastError?: string; createdAt: string;
}

export default function JobsPage() {
  const [data, setData] = useState<{ items: Job[]; stats: { _id: string; count: number }[] } | null>(null);
  const [processing, setProcessing] = useState(false);

  usePolling(async () => {
    setData(await api<{ items: Job[]; stats: { _id: string; count: number }[] }>('/api/jobs').catch(() => null));
  }, 4000);

  const drain = async () => {
    setProcessing(true);
    await api('/api/jobs/process', { method: 'POST' }).catch(() => undefined);
    setProcessing(false);
  };

  if (!data) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  const stat = (s: string) => data.stats.find((x) => x._id === s)?.count ?? 0;

  return (
    <div>
      <PageHeader
        title="Job Queue"
        subtitle="Long-running work never happens in an HTTP request — jobs are executed by the worker (or cron on Vercel)."
        actions={<button className="btn-ghost" onClick={drain} disabled={processing}>{processing ? 'Processing…' : 'Process queue now'}</button>}
      />
      <div className="mb-5 grid grid-cols-4 gap-3">
        {(['queued', 'running', 'completed', 'failed'] as const).map((s) => (
          <Card key={s} className="text-center">
            <div className="text-2xl font-extrabold" style={{ color: s === 'failed' ? '#dc2626' : s === 'running' ? 'var(--accent)' : 'var(--text)' }}>{stat(s)}</div>
            <div className="text-xs font-semibold capitalize" style={{ color: 'var(--text-2)' }}>{s}</div>
          </Card>
        ))}
      </div>
      <Card pad={false}>
        <table className="w-full">
          <thead><tr><th className="th">Type</th><th className="th">Status</th><th className="th">Attempts</th><th className="th">Error</th><th className="th">Created</th></tr></thead>
          <tbody>
            {data.items.length === 0 && <tr><td colSpan={5} className="td py-10 text-center" style={{ color: 'var(--text-3)' }}>Queue empty.</td></tr>}
            {data.items.map((j) => (
              <tr key={j._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="td font-mono text-xs font-bold">{j.type}</td>
                <td className="td"><StatusBadge value={j.status === 'queued' ? 'Queued' : j.status === 'running' ? 'Running' : j.status === 'completed' ? 'Completed' : j.status === 'waiting_approval' ? 'Needs Approval' : 'Failed'} /></td>
                <td className="td text-xs" style={{ color: 'var(--text-2)' }}>{j.attempts}/{j.maxAttempts}</td>
                <td className="td max-w-[260px] truncate text-xs" style={{ color: j.lastError ? '#dc2626' : 'var(--text-3)' }}>{j.lastError ?? '—'}</td>
                <td className="td text-xs" style={{ color: 'var(--text-3)' }}>{timeAgo(j.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
        Local development: run <code className="font-bold" style={{ color: 'var(--accent)' }}>npm run worker</code>. Vercel: schedule a cron to hit <code className="font-bold" style={{ color: 'var(--accent)' }}>/api/jobs/process</code>.
      </p>
    </div>
  );
}
