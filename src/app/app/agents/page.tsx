'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Avatar, Card, PageHeader, Spinner, StatusBadge, Tag } from '@/components/ui';

interface Agent {
  _id: string; name: string; role: string; status: string; isTeamHead: boolean;
  description?: string; skills: string[];
  department?: { name: string }; parent?: { name: string };
  performance?: { runs: number; completed: number; failed: number; successRate: number; toolCalls: number; avgDurationMs: number } | null;
}

export default function AgentsPage() {
  const [items, setItems] = useState<Agent[] | null>(null);

  const load = async () => {
    const d = await api<{ items: Agent[] }>('/api/agents?perf=1');
    setItems(d.items);
  };
  useEffect(() => { void load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  return (
    <div>
      <PageHeader title="AI Workforce" subtitle="Your digital employees. Each has a role, tools, permissions and a real performance record." />
      {!items ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => (
            <Link key={a._id} href={`/app/agents/${a._id}`}>
              <Card className="h-full hover:border-[var(--accent)]">
                <div className="mb-3 flex items-start gap-3">
                  <Avatar name={a.name} size={40} team={a.isTeamHead} />
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold leading-tight" style={{ color: 'var(--text)' }}>
                      {a.name} {a.isTeamHead && <span className="ml-1 text-[9px] font-extrabold" style={{ color: 'var(--accent)' }}>TEAM HEAD</span>}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-2)' }}>{a.role}</div>
                    <div className="mt-0.5 text-[10px]" style={{ color: 'var(--text-3)' }}>{a.department?.name ?? '—'}{a.parent ? ` · reports to ${a.parent.name}` : ''}</div>
                  </div>
                  <StatusBadge value={a.status} />
                </div>
                <p className="mb-3 line-clamp-2 text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>{a.description}</p>
                <div className="mb-3 flex flex-wrap gap-1">
                  {(a.skills ?? []).slice(0, 3).map((s) => <Tag key={s}>{s}</Tag>)}
                </div>
                <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center" style={{ borderColor: 'var(--border)' }}>
                  <div><div className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>{a.performance?.runs ?? 0}</div><div className="text-[10px]" style={{ color: 'var(--text-3)' }}>Runs</div></div>
                  <div><div className="text-sm font-extrabold" style={{ color: a.performance?.successRate === 0 ? '#dc2626' : '#059669' }}>{a.performance ? `${a.performance.successRate}%` : '—'}</div><div className="text-[10px]" style={{ color: 'var(--text-3)' }}>Success</div></div>
                  <div><div className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>{a.performance?.toolCalls ?? 0}</div><div className="text-[10px]" style={{ color: 'var(--text-3)' }}>Tool calls</div></div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
