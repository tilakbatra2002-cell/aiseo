'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import {
  Avatar, Card, PageHeader, SeverityBadge, Spinner, StatusBadge, Tabs, Tag, timeAgo, fmtTime,
} from '@/components/ui';

interface AgentData {
  agent: {
    _id: string; name: string; role: string; status: string; isTeamHead: boolean;
    description?: string; systemInstructions?: string; skills: string[]; tools: string[];
    permissions: { canCrawl: boolean; canCreateTasks: boolean; canExecuteInternal: boolean; canExecuteExternal: boolean; canPublish: boolean; approvalPolicy: string };
    ai: { provider: string; model: string; temperature: number };
    department?: { name: string }; parent?: { name: string; role: string };
    knowledge?: { _id: string; title: string; type: string; category: string }[];
    successCriteria?: string; qaRequired: boolean; lastActiveAt?: string;
  };
  tasks: { _id: string; title: string; status: string; priority: string; project?: { name: string }; createdAt: string }[];
  runs: {
    _id: string; status: string; startedAt?: string; completedAt?: string; durationMs?: number;
    project?: { name: string }; output?: Record<string, unknown>; errors: string[];
    toolCalls: { tool: string; action: string; ok: boolean; summary: string; durationMs: number }[];
  }[];
  approvals: { _id: string; title: string; status: string }[];
  performance: { runs: number; completed: number; failed: number; successRate: number; avgDurationMs: number; toolCalls: number; qaPassRate: number | null } | null;
  memories: { _id: string; scope: string; content: string; createdAt: string }[];
}

const TABS = ['Overview', 'Tasks', 'Runs', 'Tools', 'Knowledge', 'Instructions', 'Permissions', 'Logs', 'Performance'];

const TOOL_DESCRIPTIONS: Record<string, string> = {
  website_crawler: 'Live web crawl with robots respect',
  http_request: 'Fresh HTTP verification requests',
  html_parser: 'Extract SEO signals from HTML',
  sitemap_parser: 'XML sitemap discovery',
  robots_parser: 'robots.txt rules',
  page_comparison: 'Diff pages/crawls',
  wordpress: 'CMS read/write (if connected)',
  database: 'Platform records',
  file_system: 'Artifact storage',
  code_executor: 'Data processing',
  keyword_data: 'Keyword metrics (needs provider)',
  backlink_data: 'Backlink index (needs provider)',
  search_console: 'GSC data (needs OAuth)',
  analytics: 'GA4 data (needs OAuth)',
  gbp: 'Google Business Profile (needs OAuth)',
  screenshot: 'Visual evidence (needs worker)',
  search: 'Web search (needs provider)',
  email: 'SMTP sending (needs credentials)',
  webhooks: 'Slack/webhook delivery',
  shopify: 'Shopify admin (needs API key)',
  webflow: 'Webflow CMS (needs API key)',
};

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AgentData | null>(null);
  const [tab, setTab] = useState('Overview');
  const [error, setError] = useState('');
  const [editingInstr, setEditingInstr] = useState(false);
  const [instr, setInstr] = useState('');

  const load = async () => {
    try {
      const d = await api<AgentData>(`/api/agents/${id}?include=full`);
      setData(d);
      setInstr(d.agent.systemInstructions ?? '');
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [id]);

  const saveInstructions = async () => {
    await api(`/api/agents/${id}`, { method: 'PATCH', body: { systemInstructions: instr } }).catch((e) => setError(e.message));
    setEditingInstr(false);
    await load();
  };

  const setStatus = async (status: string) => {
    await api(`/api/agents/${id}`, { method: 'PATCH', body: { status } }).catch((e) => setError(e.message));
    await load();
  };

  if (error && !data) return <Card>{error}</Card>;
  if (!data) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  const a = data.agent;
  const currentTask = data.tasks.find((t) => ['Running', 'Queued', 'Assigned'].includes(t.status));

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={a.name} size={42} team={a.isTeamHead} />
            <span>
              <span className="block">{a.name}</span>
              <span className="block text-sm font-semibold" style={{ color: 'var(--text-2)' }}>
                {a.role} {a.isTeamHead && <span style={{ color: 'var(--accent)' }}>· TEAM HEAD</span>}
              </span>
            </span>
          </span>
        }
        subtitle={`${a.department?.name ?? '—'}${a.parent ? ` · reports to ${a.parent.name}` : ''} · Last active ${a.lastActiveAt ? timeAgo(a.lastActiveAt) : 'never'}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge value={a.status} />
            {a.status !== 'Paused' ? (
              <button className="btn-ghost" onClick={() => setStatus('Paused')}>Pause</button>
            ) : (
              <button className="btn-primary" onClick={() => setStatus('Idle')}>Resume</button>
            )}
          </div>
        }
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'Overview' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <h3 className="mb-2 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Role</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{a.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{(a.skills ?? []).map((s) => <Tag key={s} tone="blue">{s}</Tag>)}</div>
            {a.successCriteria && <p className="mt-3 text-xs" style={{ color: 'var(--text-3)' }}><b>Success criteria:</b> {a.successCriteria}</p>}
            {a.qaRequired && <p className="mt-1 text-xs font-bold" style={{ color: '#8b5cf6' }}>QA verification required for this agent&apos;s work.</p>}
          </Card>
          <div className="space-y-5">
            <Card>
              <h3 className="mb-2 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Current Task</h3>
              {currentTask ? (
                <Link className="link" href={`/app/tasks/${currentTask._id}`}>
                  <div className="text-sm font-bold">{currentTask.title}</div>
                  <StatusBadge value={currentTask.status} />
                </Link>
              ) : <p className="text-xs" style={{ color: 'var(--text-3)' }}>No active task — agent is {a.status.toLowerCase()}.</p>}
            </Card>
            <Card>
              <h3 className="mb-2 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Pending Approvals</h3>
              {data.approvals.length === 0 && <p className="text-xs" style={{ color: 'var(--text-3)' }}>None.</p>}
              {data.approvals.map((ap) => (
                <Link key={ap._id} href="/app/approvals" className="link block text-xs font-bold">{ap.title} →</Link>
              ))}
            </Card>
            <Card>
              <h3 className="mb-2 text-sm font-extrabold" style={{ color: 'var(--text)' }}>AI Configuration</h3>
              <div className="space-y-1.5 text-xs" style={{ color: 'var(--text-2)' }}>
                <div className="flex justify-between"><span>Provider</span><b style={{ color: 'var(--text)' }}>{a.ai.provider}</b></div>
                <div className="flex justify-between"><span>Model</span><b style={{ color: 'var(--text)' }}>{a.ai.model}</b></div>
                <div className="flex justify-between"><span>Temperature</span><b style={{ color: 'var(--text)' }}>{a.ai.temperature}</b></div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'Tasks' && (
        <Card pad={false}>
          <table className="w-full">
            <thead><tr><th className="th">Task</th><th className="th">Project</th><th className="th">Priority</th><th className="th">Status</th><th className="th">Created</th></tr></thead>
            <tbody>
              {data.tasks.length === 0 && <tr><td colSpan={5} className="td py-8 text-center" style={{ color: 'var(--text-3)' }}>No tasks assigned yet.</td></tr>}
              {data.tasks.map((t) => (
                <tr key={t._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="td"><Link className="link font-semibold" href={`/app/tasks/${t._id}`}>{t.title}</Link></td>
                  <td className="td text-xs" style={{ color: 'var(--text-2)' }}>{t.project?.name ?? '—'}</td>
                  <td className="td"><SeverityBadge value={t.priority} /></td>
                  <td className="td"><StatusBadge value={t.status} /></td>
                  <td className="td text-xs" style={{ color: 'var(--text-3)' }}>{timeAgo(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'Runs' && (
        <div className="space-y-3">
          {data.runs.length === 0 && <Card><p className="py-4 text-center text-xs" style={{ color: 'var(--text-3)' }}>No runs recorded yet.</p></Card>}
          {data.runs.map((r) => (
            <Card key={r._id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge value={r.status} />
                  <span className="text-xs" style={{ color: 'var(--text-2)' }}>{r.project?.name ?? '—'}</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {r.startedAt ? timeAgo(r.startedAt) : ''} {r.durationMs != null ? `· ${(r.durationMs / 1000).toFixed(1)}s` : ''}
                </span>
              </div>
              {r.errors.length > 0 && <div className="mt-2 rounded-md px-2.5 py-1.5 text-xs" style={{ background: 'rgba(239,68,68,0.07)', color: '#dc2626' }}>{r.errors.join('; ')}</div>}
              <ul className="mt-2 space-y-1">
                {(r.toolCalls ?? []).map((tc, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                    <b style={{ color: tc.ok ? '#10b981' : '#dc2626' }}>{tc.ok ? '✓' : '✗'}</b>
                    <b style={{ color: 'var(--text)' }}>{tc.tool}</b> {tc.action}
                    <span className="truncate" style={{ color: 'var(--text-3)' }}>{tc.summary}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {tab === 'Tools' && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(a.tools ?? []).map((t) => {
            const needsIntegration = /needs|if connected/i.test(TOOL_DESCRIPTIONS[t] ?? '');
            return (
              <Card key={t}>
                <div className="flex items-center justify-between">
                  <b className="text-sm" style={{ color: 'var(--text)' }}>{t.replace(/_/g, ' ')}</b>
                  {needsIntegration ? <Tag>integration-gated</Tag> : <Tag tone="blue">ready</Tag>}
                </div>
                <p className="mt-1.5 text-xs" style={{ color: 'var(--text-2)' }}>{TOOL_DESCRIPTIONS[t] ?? 'Agent capability'}</p>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'Knowledge' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <h3 className="mb-2 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Assigned Knowledge</h3>
            {(a.knowledge ?? []).length === 0 && <p className="text-xs" style={{ color: 'var(--text-3)' }}>Inherits organization SOPs tagged for this role.</p>}
            {(a.knowledge ?? []).map((k) => (
              <div key={k._id} className="flex items-center justify-between border-b py-2 text-xs" style={{ borderColor: 'var(--border)' }}>
                <b style={{ color: 'var(--text)' }}>{k.title}</b><Tag>{k.type}</Tag>
              </div>
            ))}
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Agent Memory</h3>
            {data.memories.length === 0 && <p className="text-xs" style={{ color: 'var(--text-3)' }}>Lessons learned during runs will be stored here.</p>}
            {data.memories.map((m) => (
              <div key={m._id} className="border-b py-2 text-xs" style={{ borderColor: 'var(--border)' }}>
                <Tag>{m.scope}</Tag> <span style={{ color: 'var(--text-2)' }}>{m.content}</span>
                <span className="ml-2" style={{ color: 'var(--text-3)' }}>{timeAgo(m.createdAt)}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === 'Instructions' && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>System Instructions</h3>
            {!editingInstr ? (
              <button className="btn-ghost !text-xs" onClick={() => setEditingInstr(true)}>Edit</button>
            ) : (
              <div className="flex gap-2">
                <button className="btn-primary !text-xs" onClick={saveInstructions}>Save</button>
                <button className="btn-ghost !text-xs" onClick={() => { setEditingInstr(false); setInstr(a.systemInstructions ?? ''); }}>Cancel</button>
              </div>
            )}
          </div>
          {editingInstr ? (
            <textarea className="input min-h-[220px] font-mono text-xs" value={instr} onChange={(e) => setInstr(e.target.value)} />
          ) : (
            <pre className="whitespace-pre-wrap rounded-lg p-4 text-xs leading-relaxed" style={{ background: 'var(--bg-soft)', color: 'var(--text-2)' }}>
              {a.systemInstructions || 'No custom instructions set.'}
            </pre>
          )}
          <p className="mt-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
            Instructions shape how this employee plans and reports its work. Core honesty rules (never claim unverified actions, never fabricate metrics) are enforced by the platform regardless of instructions.
          </p>
        </Card>
      )}

      {tab === 'Permissions' && (
        <Card>
          <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Permissions</h3>
          <div className="space-y-2">
            {([
              ['canCrawl', 'Crawl websites'],
              ['canCreateTasks', 'Create & delegate tasks'],
              ['canExecuteInternal', 'Execute internal actions'],
              ['canExecuteExternal', 'Execute external actions'],
              ['canPublish', 'Publish content'],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                <span className="text-sm" style={{ color: 'var(--text)' }}>{label}</span>
                <Tag tone={a.permissions[key] ? 'blue' : undefined}>{a.permissions[key] ? 'Allowed' : 'Blocked'}</Tag>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text)' }}>Approval policy</span>
              <Tag tone="blue">{a.permissions.approvalPolicy.replace(/_/g, ' ')}</Tag>
            </div>
          </div>
          <p className="mt-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
            Sensitive and external actions route through the Approval Center unless auto-approve is configured by the owner.
          </p>
        </Card>
      )}

      {tab === 'Logs' && (
        <Card>
          <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Execution Logs</h3>
          <div className="max-h-[480px] space-y-1 overflow-y-auto rounded-lg p-3 font-mono text-[11px]" style={{ background: 'var(--bg-soft)' }}>
            {data.runs.flatMap((r) =>
              (r.toolCalls ?? []).map((tc, i) => (
                <div key={r._id + i} style={{ color: tc.ok ? 'var(--text-2)' : '#dc2626' }}>
                  [{r.startedAt ? fmtTime(r.startedAt) : '--:--'}] {tc.tool} · {tc.action} → {tc.summary} ({tc.durationMs}ms)
                </div>
              )),
            )}
            {data.runs.every((r) => (r.toolCalls ?? []).length === 0) && (
              <div style={{ color: 'var(--text-3)' }}>No log output yet — logs stream here after the agent runs.</div>
            )}
          </div>
        </Card>
      )}

      {tab === 'Performance' && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: 'Total runs', value: data.performance?.runs ?? 0 },
            { label: 'Completed', value: data.performance?.completed ?? 0, tone: '#059669' },
            { label: 'Failed', value: data.performance?.failed ?? 0, tone: '#dc2626' },
            { label: 'Success rate', value: data.performance ? `${data.performance.successRate}%` : '—' },
            { label: 'Avg execution time', value: data.performance?.avgDurationMs ? `${(data.performance.avgDurationMs / 1000).toFixed(1)}s` : '—' },
            { label: 'Tool calls', value: data.performance?.toolCalls ?? 0 },
            { label: 'QA pass rate', value: data.performance?.qaPassRate != null ? `${data.performance.qaPassRate}%` : '—' },
          ].map((m) => (
            <Card key={m.label} className="text-center">
              <div className="text-2xl font-extrabold" style={{ color: m.tone ?? 'var(--text)' }}>{m.value}</div>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>{m.label}</div>
            </Card>
          ))}
          <Card className="md:col-span-3">
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
              All metrics are calculated live from AgentRun and Task records in the database. Nothing is estimated or mocked.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
