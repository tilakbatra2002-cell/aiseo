'use client';

import { useState } from 'react';
import { api, usePolling } from '@/lib/api-client';
import { Card, DemoTag, PageHeader, Spinner, fmtTime, timeAgo } from '@/components/ui';

interface Event {
  _id: string; action: string; actorType: 'user' | 'agent' | 'system';
  actor: { name: string }; createdAt: string; isDemo: boolean;
}

const ACTOR_STYLE: Record<string, { label: string; color: string }> = {
  agent: { label: 'AGENT', color: 'var(--accent)' },
  user: { label: 'OWNER', color: '#10b981' },
  system: { label: 'SYSTEM', color: '#9aa3af' },
};

export default function ActivityPage() {
  const [items, setItems] = useState<Event[] | null>(null);
  usePolling(async () => {
    const d = await api<{ items: Event[] }>('/api/activity?limit=100');
    setItems(d.items);
  }, 3000);

  return (
    <div>
      <PageHeader title="Activity" subtitle="The live event stream of your agency — every event is a real system record." />
      {!items ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
        <Card pad={false}>
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {items.length === 0 && <li className="p-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>No activity yet.</li>}
            {items.map((ev) => {
              const s = ACTOR_STYLE[ev.actorType] ?? ACTOR_STYLE.system;
              return (
                <li key={ev._id} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-12 shrink-0 text-[11px] font-bold" style={{ color: 'var(--text-3)' }}>{fmtTime(ev.createdAt)}</span>
                  <span className="w-14 shrink-0 rounded px-1 py-0.5 text-center text-[9px] font-extrabold" style={{ background: 'var(--bg-soft)', color: s.color }}>{s.label}</span>
                  <span className="min-w-0 flex-1 text-sm" style={{ color: 'var(--text)' }}>{ev.action}</span>
                  {ev.isDemo && <DemoTag />}
                  <span className="shrink-0 text-[11px]" style={{ color: 'var(--text-3)' }}>{timeAgo(ev.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
