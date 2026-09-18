'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Card, DemoTag, EmptyState, PageHeader, Spinner, StatusBadge, timeAgo } from '@/components/ui';

interface Project {
  _id: string; name: string; website: string; stage: string; isDemo: boolean; createdAt: string;
  client?: { name: string }; teamHead?: { name: string; status: string };
}

export default function ProjectsPage() {
  const [items, setItems] = useState<Project[] | null>(null);

  useEffect(() => {
    api<{ items: Project[] }>('/api/projects').then((d) => setItems(d.items)).catch(() => setItems([]));
  }, []);

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Client engagements run by your AI employees."
        actions={<Link href="/app/projects/new" className="btn-primary">+ New Project</Link>}
      />
      {!items ? <div className="grid h-40 place-items-center"><Spinner /></div> : items.length === 0 ? (
        <EmptyState
          title="No projects yet"
          hint="Onboard a client website — discovery, audit, delegation, QA and reporting are handled by your AI Team Head and specialists."
          action={<Link href="/app/projects/new" className="btn-primary">Onboard your first project</Link>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <Link key={p._id} href={`/app/projects/${p._id}`}>
              <Card className="h-full hover:border-[var(--accent)]">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h3 className="font-extrabold leading-snug" style={{ color: 'var(--text)' }}>{p.name}</h3>
                  {p.isDemo && <DemoTag />}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-2)' }}>{p.client?.name} · <span className="break-all">{p.website}</span></div>
                <div className="mt-4 flex items-center justify-between">
                  <StatusBadge value={['Discovery', 'Audit', 'Execution', 'QA'].includes(p.stage) ? 'Running' : p.stage === 'Monitoring' ? 'Completed' : p.stage === 'New' ? 'Idle' : 'Working'} />
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>{p.stage} · {timeAgo(p.createdAt)}</span>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t pt-3 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
                  Team Head: <b style={{ color: 'var(--text)' }}>{p.teamHead?.name ?? 'Unassigned'}</b>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
