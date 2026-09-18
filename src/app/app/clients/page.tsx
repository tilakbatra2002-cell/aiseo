'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, DemoTag, EmptyState, PageHeader, Spinner, timeAgo } from '@/components/ui';

interface Client { _id: string; name: string; industry?: string; contactEmail?: string; projectCount: number; isDemo: boolean; createdAt: string }

export default function ClientsPage() {
  const [items, setItems] = useState<Client[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', contactName: '', contactEmail: '', industry: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const data = await api<{ items: Client[] }>('/api/clients');
    setItems(data.items);
  };
  useEffect(() => { void load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/api/clients', { method: 'POST', body: form });
      setShowForm(false);
      setForm({ name: '', contactName: '', contactEmail: '', industry: '' });
      await load();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Agency accounts served by your AI workforce."
        actions={<button className="btn-primary" onClick={() => setShowForm((s) => !s)}>+ New Client</button>}
      />

      {showForm && (
        <Card className="mb-5">
          <form onSubmit={create} className="grid gap-4 md:grid-cols-2">
            <div><label className="label">Client name *</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Riverside Dental" /></div>
            <div><label className="label">Industry</label><input className="input" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="e.g. Dental" /></div>
            <div><label className="label">Contact name</label><input className="input" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
            <div><label className="label">Contact email</label><input className="input" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></div>
            {error && <div className="md:col-span-2 text-sm" style={{ color: '#dc2626' }}>{error}</div>}
            <div className="flex gap-2 md:col-span-2">
              <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create client'}</button>
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </Card>
      )}

      {!items ? <div className="grid h-40 place-items-center"><Spinner /></div> : items.length === 0 ? (
        <EmptyState title="No clients yet" hint="Create a client, then a project — the AI Team Head takes it from there." />
      ) : (
        <Card pad={false}>
          <table className="w-full">
            <thead><tr><th className="th">Client</th><th className="th">Industry</th><th className="th">Projects</th><th className="th">Added</th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="td font-bold">{c.name} {c.isDemo && <DemoTag />}</td>
                  <td className="td" style={{ color: 'var(--text-2)' }}>{c.industry ?? '—'}</td>
                  <td className="td" style={{ color: 'var(--text-2)' }}>{c.projectCount}</td>
                  <td className="td text-xs" style={{ color: 'var(--text-3)' }}>{timeAgo(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
