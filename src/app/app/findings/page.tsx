'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, DemoTag, PageHeader, SeverityBadge, Spinner, StatusBadge, timeAgo } from '@/components/ui';

interface Finding {
  _id: string; title: string; severity: string; status: string; category: string;
  url?: string; createdAt: string;
  evidence?: { description: string };
  recommendedAction?: string;
  project?: { name: string; isDemo: boolean };
  detectedBy?: { name: string };
  verification?: { status: string; note?: string };
}

const SEV_FILTERS = ['All', 'Critical', 'High', 'Medium', 'Low', 'Informational'];
const STATUS_FILTERS = ['All', 'Detected', 'Recommended', 'Approved', 'Executed', 'Verified', 'Dismissed'];

export default function FindingsPage() {
  const [items, setItems] = useState<Finding[] | null>(null);
  const [sev, setSev] = useState('All');
  const [status, setStatus] = useState('All');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const load = async () => {
    const params = new URLSearchParams();
    if (sev !== 'All') params.set('severity', sev);
    if (status !== 'All') params.set('status', status);
    const d = await api<{ items: Finding[]; total: number }>(`/api/findings?${params}`);
    setItems(d.items); setTotal(d.total);
  };
  useEffect(() => { void load(); }, [sev, status]);

  const mark = async (id: string, s: string) => {
    await api(`/api/findings/${id}`, { method: 'PATCH', body: { status: s } }).catch(() => undefined);
    await load();
  };

  return (
    <div>
      <PageHeader title="Findings" subtitle={`${total} verified data-backed issues — every one carries crawler evidence.`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {SEV_FILTERS.map((f) => (
          <button key={f} onClick={() => setSev(f)} className="rounded-lg border px-2.5 py-1 text-[11px] font-bold"
            style={{ borderColor: sev === f ? 'var(--accent)' : 'var(--border)', color: sev === f ? 'var(--accent)' : 'var(--text-2)', background: sev === f ? 'var(--accent-soft)' : 'transparent' }}>
            {f}
          </button>
        ))}
        <span className="mx-2 h-4 w-px" style={{ background: 'var(--border)' }} />
        {STATUS_FILTERS.map((f) => (
          <button key={f} onClick={() => setStatus(f)} className="rounded-lg border px-2.5 py-1 text-[11px] font-bold"
            style={{ borderColor: status === f ? 'var(--accent)' : 'var(--border)', color: status === f ? 'var(--accent)' : 'var(--text-2)', background: status === f ? 'var(--accent-soft)' : 'transparent' }}>
            {f}
          </button>
        ))}
      </div>

      {!items ? <div className="grid h-40 place-items-center"><Spinner /></div> : items.length === 0 ? (
        <Card><p className="py-6 text-center text-sm" style={{ color: 'var(--text-3)' }}>No findings match. Run a project discovery to generate evidence-backed findings.</p></Card>
      ) : (
        <div className="space-y-2">
          {items.map((f) => (
            <Card key={f._id} pad={false} className="overflow-hidden">
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setExpanded(expanded === f._id ? null : f._id)}>
                <SeverityBadge value={f.severity} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold" style={{ color: 'var(--text)' }}>{f.title}</div>
                  <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {f.category} · {f.project?.name} {f.project?.isDemo && <DemoTag />} · by {f.detectedBy?.name ?? 'Agent'} · {timeAgo(f.createdAt)}
                  </div>
                </div>
                <StatusBadge value={f.status} />
                <span className="text-xs" style={{ color: f.verification?.status === 'verified' ? '#059669' : 'var(--text-3)' }}>
                  {f.verification?.status === 'verified' ? '✓' : f.verification?.status === 'failed' ? '✗' : ''} {f.verification?.status === 'not_verified' || !f.verification ? 'Not verified' : f.verification.status}
                </span>
              </button>
              {expanded === f._id && (
                <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}>
                  <div className="grid gap-3 text-xs md:grid-cols-2">
                    <div>
                      <div className="label">Evidence (from real crawl)</div>
                      <p style={{ color: 'var(--text-2)' }}>{f.evidence?.description ?? '—'}</p>
                      {f.url && <a className="link mt-1 block break-all" href={f.url} target="_blank" rel="noreferrer">{f.url}</a>}
                      {f.verification?.note && <p className="mt-2" style={{ color: 'var(--text-3)' }}><b>QA:</b> {f.verification.note}</p>}
                    </div>
                    <div>
                      <div className="label">Recommended action</div>
                      <p style={{ color: 'var(--text-2)' }}>{f.recommendedAction ?? '—'}</p>
                      <div className="mt-3 flex gap-2">
                        {f.status === 'Detected' && <button className="btn-ghost !py-1 !text-[11px]" onClick={() => mark(f._id, 'Dismissed')}>Dismiss</button>}
                        {f.status === 'Dismissed' && <button className="btn-ghost !py-1 !text-[11px]" onClick={() => mark(f._id, 'Detected')}>Reopen</button>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
