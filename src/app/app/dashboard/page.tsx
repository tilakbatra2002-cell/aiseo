'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, usePolling } from '@/lib/api-client';
import { Avatar, Card, DemoTag, EmptyState, PageHeader, Spinner, StatCard, StatusBadge, timeAgo, fmtTime } from '@/components/ui';

interface DashboardData {
  stats: {
    activeProjects: number; activeAgents: number; totalAgents: number; runningTasks: number;
    pendingApprovals: number; failedTasks: number; completedTasks: number; criticalIssues: number;
  };
  workforce: { id: string; name: string; role: string; status: string; isTeamHead: boolean }[];
  projectsByStage: { _id: string; count: number }[];
  recentActivity: { _id: string; actorType: string; actor: { name: string }; action: string; createdAt: string; isDemo: boolean }[];
  projectsNeedingAttention: { _id: string; name: string; failedTasks: number; isDemo: boolean }[];
  allProjectsPreview: { _id: string; name: string; stage: string; isDemo: boolean; client?: { name: string } }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  usePolling(async () => {
    try { setData(await api('/api/dashboard')); } catch (e) { setError((e as Error).message); }
  }, 4000);

  if (error) return <EmptyState title="Dashboard unavailable" hint={error} />;
  if (!data) {
    return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  }
  const s = data.stats;

  return (
    <div>
      <PageHeader
        title="Command Center"
        subtitle="Your AI employees at work across every client project."
        actions={<Link href="/app/projects/new" className="btn-primary">+ New Project</Link>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active Projects" value={s.activeProjects} accent />
        <StatCard label="Agents Working" value={`${s.activeAgents}/${s.totalAgents}`} accent />
        <StatCard label="Running Tasks" value={s.runningTasks} />
        <StatCard label="Pending Approvals" value={s.pendingApprovals} />
        <StatCard label="Failed Tasks" value={<span style={{ color: s.failedTasks ? '#dc2626' : undefined }}>{s.failedTasks}</span>} />
        <StatCard label="Completed Tasks" value={s.completedTasks} />
        <StatCard label="Critical Issues" value={<span style={{ color: s.criticalIssues ? '#dc2626' : undefined }}>{s.criticalIssues}</span>} />
        <StatCard label="Workflow Stages" value={data.projectsByStage.length} hint="projects across lifecycle" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        {/* AI Workforce */}
        <Card className="lg:col-span-3" pad={false}>
          <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>AI Workforce</h2>
            <Link href="/app/agents" className="text-xs font-semibold link">Manage →</Link>
          </div>
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {data.workforce.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                <Avatar name={a.name} size={28} team={a.isTeamHead} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold" style={{ color: 'var(--text)' }}>
                    {a.name} {a.isTeamHead && <span className="ml-1 text-[10px] font-extrabold" style={{ color: 'var(--accent)' }}>TEAM HEAD</span>}
                  </div>
                  <div className="truncate text-xs" style={{ color: 'var(--text-2)' }}>{a.role}</div>
                </div>
                <StatusBadge value={a.status === 'Needs Approval' ? 'Needs Approval' : a.status} />
              </li>
            ))}
          </ul>
        </Card>

        {/* Live activity */}
        <Card className="lg:col-span-2" pad={false}>
          <div className="flex items-center gap-2 border-b px-5 py-3.5" style={{ borderColor: 'var(--border)' }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: 'var(--accent)' }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
            </span>
            <h2 className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>Live Agent Activity</h2>
          </div>
          <ul className="max-h-[420px] space-y-0 overflow-y-auto px-5 py-3">
            {data.recentActivity.length === 0 && (
              <li className="py-6 text-center text-xs" style={{ color: 'var(--text-3)' }}>
                No activity yet. Start a project discovery to watch your AI employees work.
              </li>
            )}
            {data.recentActivity.map((ev) => (
              <li key={ev._id} className="flex gap-3 border-l-2 py-2 pl-3" style={{ borderColor: ev.actorType === 'agent' ? 'var(--accent)' : 'var(--border)' }}>
                <span className="w-10 shrink-0 pt-0.5 text-[11px] font-bold" style={{ color: 'var(--text-3)' }}>{fmtTime(ev.createdAt)}</span>
                <div className="min-w-0">
                  <span className="block text-[13px] leading-snug" style={{ color: 'var(--text)' }}>{ev.action}</span>
                  <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>{ev.actor.name} · {timeAgo(ev.createdAt)}{ev.isDemo && <DemoTag />}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Projects */}
      <Card className="mt-5" pad={false}>
        <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>Projects</h2>
          <Link href="/app/projects" className="text-xs font-semibold link">All projects →</Link>
        </div>
        {data.allProjectsPreview.length === 0 ? (
          <div className="p-6"><EmptyState title="No projects yet" hint="Create your first client project and the AI Team Head will start discovery, delegate specialist work and report back." /></div>
        ) : (
          <table className="w-full">
            <thead><tr><th className="th">Project</th><th className="th">Client</th><th className="th">Stage</th><th className="th">Attention</th></tr></thead>
            <tbody>
              {data.allProjectsPreview.map((p) => {
                const att = data.projectsNeedingAttention.find((x) => x._id === p._id);
                return (
                  <tr key={p._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="td"><Link className="link font-bold" href={`/app/projects/${p._id}`}>{p.name}</Link> {p.isDemo && <DemoTag />}</td>
                    <td className="td" style={{ color: 'var(--text-2)' }}>{p.client?.name ?? '—'}</td>
                    <td className="td"><StatusBadge value={p.stage === 'New' ? 'Idle' : p.stage === 'Execution' || p.stage === 'QA' ? 'Running' : p.stage === 'Monitoring' ? 'Completed' : 'Working'} /></td>
                    <td className="td">{att ? <span style={{ color: '#dc2626' }} className="text-xs font-bold">{att.failedTasks} failed task(s)</span> : <span className="text-xs" style={{ color: 'var(--text-3)' }}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
