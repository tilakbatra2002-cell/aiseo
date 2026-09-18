'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Card, DemoTag, PageHeader, Spinner, StatusBadge, timeAgo } from '@/components/ui';

interface Run {
  _id: string; status: string; durationMs?: number; createdAt: string;
  toolCalls: { tool: string; ok: boolean }[];
  agent?: { name: string; role: string };
  project?: { name: string; isDemo: boolean };
  task?: { _id: string; title: string; kind: string };
}

export default function RunsPage() {
  const [items, setItems] = useState<Run[] | null>(null);
  useEffect(() => {
    api<{ items: Run[] }>('/api/runs').then((d) => setItems(d.items)).catch(() => setItems([]));
    const t = setInterval(() => { api<{ items: Run[] }>('/api/runs').then((d) => setItems(d.items)).catch(() => undefined); }, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <PageHeader title="Agent Runs" subtitle="Every execution — with tool calls, duration and outcome." />
      {!items ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
        <Card pad={false}>
          <table className="w-full">
            <thead><tr><th className="th">Agent</th><th className="th">Task</th><th className="th">Project</th><th className="th">Tools</th><th className="th">Status</th><th className="th">Duration</th><th className="th">Started</th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={7} className="td py-10 text-center" style={{ color: 'var(--text-3)' }}>No runs yet — start a project discovery.</td></tr>}
              {items.map((r) => (
                <tr key={r._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="td"><div className="font-bold">{r.agent?.name ?? '—'}</div><div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{r.agent?.role}</div></td>
                  <td className="td text-xs">{r.task ? <Link className="link" href={`/app/tasks/${r.task._id}`}>{r.task.title}</Link> : '—'}</td>
                  <td className="td text-xs" style={{ color: 'var(--text-2)' }}>{r.project?.name} {r.project?.isDemo && <DemoTag />}</td>
                  <td className="td text-xs" style={{ color: 'var(--text-3)' }}>{(r.toolCalls ?? []).length} call(s)</td>
                  <td className="td"><StatusBadge value={r.status} /></td>
                  <td className="td text-xs" style={{ color: 'var(--text-2)' }}>{r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                  <td className="td text-xs" style={{ color: 'var(--text-3)' }}>{timeAgo(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
