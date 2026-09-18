'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { Card, DemoTag, PageHeader, SeverityBadge, Spinner, StatusBadge, timeAgo, fmtTime } from '@/components/ui';

interface TaskDetail {
  task: {
    _id: string; title: string; kind: string; status: string; priority: string; priorityScore: number;
    objective?: string; instructions?: string; expectedOutput?: string; retryCount: number; maxRetries: number;
    qaStatus: string; requiresApproval: boolean; createdAt: string;
    logs: { at: string; message: string }[];
    result?: Record<string, unknown>;
    evidence?: unknown[];
    project?: { _id: string; name: string; isDemo: boolean };
    assignedAgent?: { _id: string; name: string; role: string };
    dependencies?: { _id: string; title: string; status: string }[];
  };
  runs: { _id: string; status: string; startedAt?: string; completedAt?: string; durationMs?: number; toolCalls: { tool: string; action: string; ok: boolean; durationMs: number; summary: string }[]; errors: string[] }[];
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<TaskDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    try { setData(await api(`/api/tasks/${id}`)); } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [id]);

  const action = async (a: string) => {
    setBusy(a);
    try { await api(`/api/tasks/${id}`, { method: 'POST', body: { action: a } }); await load(); }
    catch (e) { setError((e as Error).message); }
    setBusy('');
  };

  if (error && !data) return <Card>{error}</Card>;
  if (!data) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  const t = data.task;
  const failed = ['Failed', 'Cancelled', 'Needs Rework'].includes(t.status);

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-3">{t.title} {t.project?.isDemo && <DemoTag />}</span>}
        subtitle={<span>Project: <Link className="link" href={`/app/projects/${t.project?._id}`}>{t.project?.name}</Link> · Kind: <b>{t.kind}</b> · Created {timeAgo(t.createdAt)}</span>}
        actions={
          <div className="flex gap-2">
            {failed && <button className="btn-primary" disabled={busy === 'retry'} onClick={() => action('retry')}>{busy === 'retry' ? 'Retrying…' : 'Retry'}</button>}
            {!['Completed', 'Cancelled'].includes(t.status) && <button className="btn-ghost" disabled={busy === 'cancel'} onClick={() => action('cancel')}>Cancel</button>}
          </div>
        }
      />

      {error && <div className="mb-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#dc2626' }}>{error}</div>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <h3 className="mb-2 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Objective</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{t.objective ?? '—'}</p>
            {t.expectedOutput && <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}><b>Expected output:</b> {t.expectedOutput}</p>}
            {t.requiresApproval && <p className="mt-2 text-xs font-bold" style={{ color: '#8b5cf6' }}>This task requires owner approval for sensitive actions.</p>}
          </Card>

          {t.result && Object.keys(t.result).length > 0 && (
            <Card>
              <h3 className="mb-2 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Result</h3>
              <pre className="max-h-72 overflow-auto rounded-lg p-3 text-xs leading-relaxed" style={{ background: 'var(--bg-soft)', color: 'var(--text-2)' }}>
                {JSON.stringify(t.result, null, 2)}
              </pre>
            </Card>
          )}

          <Card>
            <h3 className="mb-2 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Execution Log</h3>
            {t.logs.length === 0 && <p className="text-xs" style={{ color: 'var(--text-3)' }}>No log entries yet.</p>}
            <ul className="space-y-1.5">
              {[...t.logs].reverse().map((l, i) => (
                <li key={i} className="flex gap-3 text-xs">
                  <span className="w-12 shrink-0 font-bold" style={{ color: 'var(--text-3)' }}>{fmtTime(l.at)}</span>
                  <span style={{ color: 'var(--text-2)' }}>{l.message}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Agent Runs ({data.runs.length})</h3>
            <div className="space-y-4">
              {data.runs.map((r) => (
                <div key={r._id} className="rounded-lg border p-3.5" style={{ borderColor: 'var(--border)' }}>
                  <div className="mb-2 flex items-center justify-between">
                    <StatusBadge value={r.status} />
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : ''} {r.startedAt ? `· ${timeAgo(r.startedAt)}` : ''}
                    </span>
                  </div>
                  {r.errors.length > 0 && (
                    <div className="mb-2 rounded-md px-2.5 py-1.5 text-xs" style={{ background: 'rgba(239,68,68,0.07)', color: '#dc2626' }}>
                      {r.errors.join('; ')}
                    </div>
                  )}
                  <ul className="space-y-1">
                    {r.toolCalls.map((tc, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                        <span className="font-extrabold" style={{ color: tc.ok ? '#10b981' : '#dc2626' }}>{tc.ok ? '✓' : '✗'}</span>
                        <span className="font-bold" style={{ color: 'var(--text)' }}>{tc.tool}</span>
                        <span>{tc.action}</span>
                        <span className="truncate" style={{ color: 'var(--text-3)' }}>{tc.summary}</span>
                        <span className="ml-auto shrink-0" style={{ color: 'var(--text-3)' }}>{tc.durationMs}ms</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {data.runs.length === 0 && <p className="text-xs" style={{ color: 'var(--text-3)' }}>No runs recorded.</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Status</h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between"><span style={{ color: 'var(--text-2)' }}>Status</span><StatusBadge value={t.status} /></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-2)' }}>Priority</span><SeverityBadge value={t.priority} /></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-2)' }}>Internal priority score</span><b style={{ color: 'var(--accent)' }}>{t.priorityScore ?? 0}/100</b></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-2)' }}>QA status</span><b style={{ color: 'var(--text)' }} className="capitalize">{t.qaStatus.replace('_', ' ')}</b></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-2)' }}>Retries</span><b style={{ color: 'var(--text)' }}>{t.retryCount}/{t.maxRetries}</b></div>
            </div>
            <div className="mt-3 text-[10px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
              The internal priority score guides the Team Head&apos;s work ordering — it does not predict search rankings.
            </div>
          </Card>
          <Card>
            <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Assigned Agent</h3>
            {t.assignedAgent ? (
              <Link href={`/app/agents/${t.assignedAgent._id}`} className="link">
                <div className="text-sm font-bold">{t.assignedAgent.name}</div>
                <div className="text-xs" style={{ color: 'var(--text-2)' }}>{t.assignedAgent.role}</div>
              </Link>
            ) : <span className="text-xs" style={{ color: 'var(--text-3)' }}>Unassigned</span>}
          </Card>
          {t.dependencies && t.dependencies.length > 0 && (
            <Card>
              <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Dependencies</h3>
              <ul className="space-y-2">
                {t.dependencies.map((d) => (
                  <li key={d._id} className="flex items-center justify-between text-xs">
                    <Link className="link font-semibold" href={`/app/tasks/${d._id}`}>{d.title}</Link>
                    <StatusBadge value={d.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
