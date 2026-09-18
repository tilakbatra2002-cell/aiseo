'use client';

import { useEffect, useState } from 'react';
import { api, usePolling } from '@/lib/api-client';
import { Card, PageHeader, SeverityBadge, Spinner, StatusBadge, timeAgo } from '@/components/ui';

interface Approval {
  _id: string; title: string; description?: string; status: string; risk: string; actionType: string;
  createdAt: string; decidedAt?: string; decisionNote?: string;
  requestedBy?: { name: string };
  project?: { name: string; isDemo: boolean };
  task?: { _id: string; title: string };
  payload?: { changes?: { url: string; field: string; current: string; proposed: string; rationale: string }[]; [k: string]: unknown };
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[] | null>(null);
  const [tab, setTab] = useState<'Pending' | 'Decided'>('Pending');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    const d = await api<{ items: Approval[] }>('/api/approvals');
    setItems(d.items);
  };
  usePolling(load, 4000);
  useEffect(() => { void load(); }, []);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id);
    setError('');
    try { await api(`/api/approvals/${id}`, { method: 'POST', body: { decision } }); await load(); }
    catch (e) { setError((e as Error).message); }
    setBusy('');
  };

  const shown = (items ?? []).filter((a) => (tab === 'Pending' ? a.status === 'Pending' : a.status !== 'Pending'));

  return (
    <div>
      <PageHeader
        title="Approval Center"
        subtitle="Sensitive and external actions wait here until you decide. You stay in control."
      />
      <div className="mb-4 flex gap-2">
        {(['Pending', 'Decided'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="rounded-lg border px-3.5 py-1.5 text-xs font-bold"
            style={{ borderColor: tab === t ? 'var(--accent)' : 'var(--border)', color: tab === t ? 'var(--accent)' : 'var(--text-2)', background: tab === t ? 'var(--accent-soft)' : 'transparent' }}>
            {t} {t === 'Pending' && items ? `(${items.filter((a) => a.status === 'Pending').length})` : ''}
          </button>
        ))}
      </div>
      {error && <div className="mb-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#dc2626' }}>{error}</div>}

      {!items ? <div className="grid h-40 place-items-center"><Spinner /></div> : shown.length === 0 ? (
        <Card><p className="py-6 text-center text-sm" style={{ color: 'var(--text-3)' }}>
          {tab === 'Pending' ? 'Nothing waiting for approval. Sensitive agent actions will appear here.' : 'No decided approvals yet.'}
        </p></Card>
      ) : (
        <div className="space-y-3">
          {shown.map((a) => (
            <Card key={a._id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm" style={{ color: 'var(--text)' }}>{a.title}</b>
                    <SeverityBadge value={a.risk} /><span className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-3)' }}>{a.risk} risk</span>
                    <StatusBadge value={a.status} />
                  </div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>
                    Requested by <b>{a.requestedBy?.name ?? 'Agent'}</b> · {a.project?.name ?? '—'} · {timeAgo(a.createdAt)}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>{a.description}</p>
                  {a.payload?.changes && (
                    <div className="mt-2">
                      <button className="text-[11px] font-bold link" onClick={() => setExpanded(expanded === a._id ? null : a._id)}>
                        {expanded === a._id ? 'Hide' : 'Review'} {a.payload.changes.length} proposed change(s)
                      </button>
                      {expanded === a._id && (
                        <div className="mt-2 space-y-2">
                          {a.payload.changes.map((c, i) => (
                            <div key={i} className="rounded-lg border p-2.5 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}>
                              <div className="mb-1 break-all font-bold" style={{ color: 'var(--accent)' }}>{c.url}</div>
                              <div className="grid gap-1 md:grid-cols-2">
                                <div><b style={{ color: '#dc2626' }}>Current:</b> <span style={{ color: 'var(--text-3)' }}>{c.current || '(empty)'}</span></div>
                                <div><b style={{ color: '#059669' }}>Proposed:</b> <span style={{ color: 'var(--text)' }}>{c.proposed}</span></div>
                              </div>
                              <div className="mt-1" style={{ color: 'var(--text-3)' }}>{c.rationale}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {a.status === 'Pending' && (
                  <div className="flex shrink-0 gap-2">
                    <button className="btn-primary !text-xs" disabled={busy === a._id} onClick={() => decide(a._id, 'approve')}>Approve</button>
                    <button className="btn-ghost !text-xs" disabled={busy === a._id} onClick={() => decide(a._id, 'reject')} style={{ color: '#dc2626' }}>Reject</button>
                  </div>
                )}
                {a.status !== 'Pending' && a.decidedAt && (
                  <div className="text-right text-[11px]" style={{ color: 'var(--text-3)' }}>Decided {timeAgo(a.decidedAt)}</div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
