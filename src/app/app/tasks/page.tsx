'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Card, DemoTag, PageHeader, SeverityBadge, Spinner, StatusBadge, timeAgo } from '@/components/ui';

interface Task {
  _id: string; title: string; kind: string; status: string; priority: string;
  retryCount: number; createdAt: string;
  assignedAgent?: { name: string }; project?: { name: string; isDemo: boolean };
}

const FILTERS = ['All', 'Queued', 'Running', 'Needs Approval', 'Completed', 'Failed'];

export default function TasksPage() {
  const [items, setItems] = useState<Task[] | null>(null);
  const [filter, setFilter] = useState('All');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const q = filter === 'All' ? '' : `?status=${encodeURIComponent(filter)}`;
    api<{ items: Task[]; total: number }>(`/api/tasks${q}`).then((d) => { setItems(d.items); setTotal(d.total); }).catch(() => setItems([]));
  }, [filter]);

  return (
    <div>
      <PageHeader title="Tasks" subtitle={`${total} work items across all projects — assigned by you or the Team Head.`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className="rounded-lg border px-3 py-1.5 text-xs font-bold"
            style={{
              borderColor: filter === f ? 'var(--accent)' : 'var(--border)',
              color: filter === f ? 'var(--accent)' : 'var(--text-2)',
              background: filter === f ? 'var(--accent-soft)' : 'transparent',
            }}>
            {f}
          </button>
        ))}
      </div>
      {!items ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
        <Card pad={false}>
          <table className="w-full">
            <thead><tr><th className="th">Task</th><th className="th">Project</th><th className="th">Agent</th><th className="th">Priority</th><th className="th">Status</th><th className="th">Created</th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={6} className="td py-10 text-center" style={{ color: 'var(--text-3)' }}>No tasks match this filter.</td></tr>}
              {items.map((t) => (
                <tr key={t._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="td">
                    <Link className="link font-semibold" href={`/app/tasks/${t._id}`}>{t.title}</Link>
                    <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{t.kind}{t.retryCount > 0 ? ` · retries: ${t.retryCount}` : ''}</div>
                  </td>
                  <td className="td text-xs" style={{ color: 'var(--text-2)' }}>{t.project?.name} {t.project?.isDemo && <DemoTag />}</td>
                  <td className="td text-xs" style={{ color: 'var(--text-2)' }}>{t.assignedAgent?.name ?? 'Unassigned'}</td>
                  <td className="td"><SeverityBadge value={t.priority} /></td>
                  <td className="td"><StatusBadge value={t.status} /></td>
                  <td className="td text-xs" style={{ color: 'var(--text-3)' }}>{timeAgo(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
