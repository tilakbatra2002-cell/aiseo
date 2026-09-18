'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, usePolling } from '@/lib/api-client';
import {
  Avatar, Card, DemoTag, PageHeader, SeverityBadge, Spinner, StatusBadge,
  Tabs, Tag, timeAgo,
} from '@/components/ui';

interface PData {
  project: {
    _id: string; name: string; website: string; stage: string; isDemo: boolean;
    industry?: string; country?: string; targetLocations: string[]; businessGoals: string[];
    competitors: string[]; targetKeywords: string[];
    client?: { name: string }; teamHead?: { name: string; status: string };
    specialists?: { _id: string; name: string; role: string; status: string }[];
  };
  tasks: { _id: string; title: string; kind: string; status: string; priority: string; qaStatus: string; retryCount: number; assignedAgent?: { name: string }; createdAt: string }[];
  findings: { _id: string; title: string; severity: string; status: string; category: string; url?: string; verification?: { status: string } }[];
  findingsBySeverity: { _id: string; count: number }[];
  workflowRun?: { status: string; currentStep: string; steps: { key: string; name: string; status: string; note?: string }[] };
  activity: { _id: string; action: string; actor: { name: string }; actorType: string; createdAt: string }[];
  runs: { _id: string; agent?: { name: string }; status: string; durationMs?: number; createdAt: string }[];
  approvals: { _id: string; title: string; status: string; risk: string; createdAt: string }[];
  reports: { _id: string; title: string; type: string; summary: string; createdAt: string }[];
  memory: { _id: string; key: string; value: unknown; updatedAt: string }[];
  artifacts: { _id: string; name: string; type: string; contentPreview?: string; createdAt: string }[];
}

const TABS = ['Overview', 'Tasks', 'Findings', 'Reports', 'Approvals', 'Runs', 'Memory & Artifacts', 'Activity'];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PData | null>(null);
  const [tab, setTab] = useState('Overview');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  usePolling(async () => {
    try { setData(await api(`/api/projects/${id}?include=full`)); } catch (e) { setError((e as Error).message); }
  }, 3500, !!id);

  if (error && !data) return <Card>{error}</Card>;
  if (!data) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;

  const p = data.project;
  const sevCount = (s: string) => data.findingsBySeverity.find((f) => f._id === s)?.count ?? 0;

  const startDiscovery = async () => {
    setStarting(true);
    try { await api(`/api/projects/${id}/discover`, { method: 'POST' }); } catch (e) { setError((e as Error).message); }
    setStarting(false);
  };

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-3">{p.name} {p.isDemo && <DemoTag />}</span>}
        subtitle={<span>{p.client?.name} · <a className="link" href={p.website} target="_blank" rel="noreferrer">{p.website}</a> · Stage: <b>{p.stage}</b></span>}
        actions={
          <button className="btn-primary" onClick={startDiscovery} disabled={starting || data.workflowRun?.status === 'running'}>
            {starting ? 'Starting…' : data.workflowRun?.status === 'running' ? 'Discovery running…' : data.workflowRun ? 'Re-run Discovery' : 'Start AI Discovery'}
          </button>
        }
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'Overview' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Discovery Workflow</h3>
            {data.workflowRun ? (
              <ol className="space-y-0">
                {data.workflowRun.steps.map((s, i) => (
                  <li key={s.key} className="flex gap-3 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-extrabold"
                        style={{
                          background: s.status === 'completed' ? 'var(--accent)' : s.status === 'running' ? 'var(--accent-soft)' : 'var(--bg-soft)',
                          color: s.status === 'completed' ? '#fff' : s.status === 'running' ? 'var(--accent)' : 'var(--text-3)',
                          border: `1px solid ${s.status === 'failed' ? '#ef4444' : 'var(--border)'}`,
                        }}>
                        {s.status === 'failed' ? '!' : s.status === 'completed' ? '✓' : i + 1}
                      </span>
                      {i < data.workflowRun!.steps.length - 1 && <span className="w-px flex-1" style={{ background: 'var(--border)' }} />}
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>{s.name}</div>
                      <div className="text-xs capitalize" style={{ color: s.status === 'failed' ? '#dc2626' : 'var(--text-3)' }}>{s.status}{s.note ? ` — ${s.note}` : ''}</div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                No discovery run yet. Start discovery and the Team Head will analyze the website, delegate specialist work, run QA and produce a strategy with your approval gate.
              </p>
            )}
            <div className="mt-4 grid grid-cols-5 gap-2">
              {(['Critical', 'High', 'Medium', 'Low', 'Informational'] as const).map((s) => (
                <div key={s} className="rounded-lg border p-2.5 text-center" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-lg font-extrabold" style={{ color: 'var(--text)' }}>{sevCount(s)}</div>
                  <SeverityBadge value={s} />
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text)' }}>AI Team</h3>
              <div className="flex items-center gap-2.5 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
                <Avatar name={p.teamHead?.name ?? 'TH'} size={30} team />
                <div className="flex-1">
                  <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>{p.teamHead?.name ?? 'Unassigned'}</div>
                  <div className="text-[11px]" style={{ color: 'var(--accent)' }}>TEAM HEAD</div>
                </div>
                <StatusBadge value={p.teamHead?.status} />
              </div>
              <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto">
                {(p.specialists ?? []).map((a) => (
                  <li key={a._id} className="flex items-center gap-2">
                    <Avatar name={a.name} size={22} />
                    <span className="flex-1 truncate text-xs font-semibold" style={{ color: 'var(--text-2)' }}>{a.name} · {a.role}</span>
                    <StatusBadge value={a.status} />
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <h3 className="mb-2 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Context</h3>
              <div className="space-y-2 text-xs" style={{ color: 'var(--text-2)' }}>
                <div><b style={{ color: 'var(--text)' }}>Industry:</b> {p.industry ?? '—'}</div>
                <div><b style={{ color: 'var(--text)' }}>Country:</b> {p.country ?? '—'}</div>
                <div className="flex flex-wrap gap-1"><b style={{ color: 'var(--text)' }}>Locations:</b>{p.targetLocations.length ? p.targetLocations.map((l) => <Tag key={l}>{l}</Tag>) : '—'}</div>
                <div className="flex flex-wrap gap-1"><b style={{ color: 'var(--text)' }}>Goals:</b>{p.businessGoals.length ? p.businessGoals.map((l) => <Tag key={l}>{l}</Tag>) : '—'}</div>
                <div className="flex flex-wrap gap-1"><b style={{ color: 'var(--text)' }}>Competitors:</b>{p.competitors.length ? p.competitors.map((l) => <Tag key={l}>{l.replace(/^https?:\/\//, '')}</Tag>) : '—'}</div>
                <div className="flex flex-wrap gap-1"><b style={{ color: 'var(--text)' }}>Keywords:</b>{p.targetKeywords.length ? p.targetKeywords.map((l) => <Tag key={l} tone="blue">{l}</Tag>) : '—'}</div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'Tasks' && (
        <Card pad={false}>
          <table className="w-full">
            <thead><tr><th className="th">Task</th><th className="th">Agent</th><th className="th">Priority</th><th className="th">Status</th><th className="th">QA</th><th className="th">Created</th></tr></thead>
            <tbody>
              {data.tasks.length === 0 && <tr><td className="td py-8 text-center" colSpan={6} style={{ color: 'var(--text-3)' }}>No tasks yet — the Team Head creates them during discovery.</td></tr>}
              {data.tasks.map((t) => (
                <tr key={t._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="td">
                    <Link className="link font-semibold" href={`/app/tasks/${t._id}`}>{t.title}</Link>
                    <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{t.kind}{t.retryCount > 0 ? ` · retry ${t.retryCount}` : ''}</div>
                  </td>
                  <td className="td text-xs" style={{ color: 'var(--text-2)' }}>{t.assignedAgent?.name ?? '—'}</td>
                  <td className="td"><SeverityBadge value={t.priority} /></td>
                  <td className="td"><StatusBadge value={t.status} /></td>
                  <td className="td text-xs capitalize" style={{ color: 'var(--text-3)' }}>{t.qaStatus.replace('_', ' ')}</td>
                  <td className="td text-xs" style={{ color: 'var(--text-3)' }}>{timeAgo(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'Findings' && (
        <Card pad={false}>
          <table className="w-full">
            <thead><tr><th className="th">Finding</th><th className="th">Severity</th><th className="th">Status</th><th className="th">Verification</th><th className="th">URL</th></tr></thead>
            <tbody>
              {data.findings.length === 0 && <tr><td className="td py-8 text-center" colSpan={5} style={{ color: 'var(--text-3)' }}>No findings recorded yet.</td></tr>}
              {data.findings.map((f) => (
                <tr key={f._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="td max-w-[320px]"><span className="font-semibold">{f.title}</span><div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{f.category}</div></td>
                  <td className="td"><SeverityBadge value={f.severity} /></td>
                  <td className="td"><StatusBadge value={f.status} /></td>
                  <td className="td text-xs" style={{ color: f.verification?.status === 'verified' ? '#059669' : 'var(--text-3)' }}>
                    {f.verification?.status === 'verified' ? '✓ Verified' : f.verification?.status === 'failed' ? '✗ Failed' : 'Not verified'}
                  </td>
                  <td className="td max-w-[220px] truncate text-xs" style={{ color: 'var(--text-3)' }}>{f.url ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'Reports' && (
        <div className="space-y-3">
          {data.reports.length === 0 && <Card><p className="text-sm" style={{ color: 'var(--text-2)' }}>No reports yet. The Team Head generates the discovery report at the end of the workflow.</p></Card>}
          {data.reports.map((r) => (
            <Link key={r._id} href={`/app/reports/${r._id}`}>
              <Card className="hover:border-[var(--accent)]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-extrabold" style={{ color: 'var(--text)' }}>{r.title}</div>
                    <div className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>{r.summary}</div>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>{timeAgo(r.createdAt)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {tab === 'Approvals' && (
        <Card pad={false}>
          <table className="w-full">
            <thead><tr><th className="th">Approval</th><th className="th">Risk</th><th className="th">Status</th><th className="th">Requested</th></tr></thead>
            <tbody>
              {data.approvals.length === 0 && <tr><td className="td py-8 text-center" colSpan={4} style={{ color: 'var(--text-3)' }}>No approvals for this project.</td></tr>}
              {data.approvals.map((a) => (
                <tr key={a._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="td font-semibold"><Link className="link" href="/app/approvals">{a.title}</Link></td>
                  <td className="td"><SeverityBadge value={a.risk} /></td>
                  <td className="td"><StatusBadge value={a.status} /></td>
                  <td className="td text-xs" style={{ color: 'var(--text-3)' }}>{timeAgo(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'Runs' && (
        <Card pad={false}>
          <table className="w-full">
            <thead><tr><th className="th">Agent</th><th className="th">Status</th><th className="th">Duration</th><th className="th">Started</th></tr></thead>
            <tbody>
              {data.runs.length === 0 && <tr><td className="td py-8 text-center" colSpan={4} style={{ color: 'var(--text-3)' }}>No agent runs yet.</td></tr>}
              {data.runs.map((r) => (
                <tr key={r._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="td font-semibold">{r.agent?.name ?? '—'}</td>
                  <td className="td"><StatusBadge value={r.status} /></td>
                  <td className="td text-xs" style={{ color: 'var(--text-2)' }}>{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                  <td className="td text-xs" style={{ color: 'var(--text-3)' }}>{timeAgo(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'Memory & Artifacts' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Project Memory</h3>
            {data.memory.length === 0 && <p className="text-xs" style={{ color: 'var(--text-3)' }}>Written by agents as the project progresses (latest crawl, Team Head plan…).</p>}
            <ul className="space-y-2">
              {data.memory.map((m) => (
                <li key={m._id} className="rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--border)' }}>
                  <div className="font-bold" style={{ color: 'var(--accent)' }}>{m.key}</div>
                  <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap" style={{ color: 'var(--text-2)' }}>{JSON.stringify(m.value, null, 1)}</pre>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Execution Artifacts</h3>
            {data.artifacts.length === 0 && <p className="text-xs" style={{ color: 'var(--text-3)' }}>Crawl results, JSON reports and drafts appear here.</p>}
            <ul className="space-y-2">
              {data.artifacts.map((a) => (
                <li key={a._id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between text-xs">
                    <b style={{ color: 'var(--text)' }}>{a.name}</b>
                    <Tag>{a.type}</Tag>
                  </div>
                  {a.contentPreview && <div className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{a.contentPreview}</div>}
                  <div className="mt-1 text-[10px]" style={{ color: 'var(--text-3)' }}>{timeAgo(a.createdAt)}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'Activity' && (
        <Card pad={false}>
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {data.activity.length === 0 && <li className="p-8 text-center text-xs" style={{ color: 'var(--text-3)' }}>Activity will appear here in real time.</li>}
            {data.activity.map((ev) => (
              <li key={ev._id} className="flex items-center gap-3 px-5 py-3">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ev.actorType === 'agent' ? 'var(--accent)' : ev.actorType === 'user' ? '#10b981' : 'var(--border-strong)' }} />
                <span className="flex-1 text-sm" style={{ color: 'var(--text)' }}>{ev.action}</span>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>{timeAgo(ev.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
