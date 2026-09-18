'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { Card, EmptyState, PageHeader, Spinner, Tag, timeAgo } from '@/components/ui';

interface Doc {
  _id: string; title: string; type: string; category: string; content: string;
  forAgents: string[]; tags: string[]; updatedAt: string;
}

export default function KnowledgePage() {
  const params = useSearchParams();
  const typeFilter = params.get('type');
  const [items, setItems] = useState<Doc[] | null>(null);
  const [selected, setSelected] = useState<Doc | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'note', category: 'General', content: '' });

  const load = async () => {
    const d = await api<{ items: Doc[] }>('/api/knowledge');
    setItems(d.items);
    if (typeFilter === 'sop' && !selected) {
      const first = d.items.find((x) => x.type === 'sop');
      if (first) setSelected(first);
    }
  };
  useEffect(() => { void load(); }, [typeFilter]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await api('/api/knowledge', { method: 'POST', body: form }).catch(() => undefined);
    setShowForm(false);
    setForm({ title: '', type: 'note', category: 'General', content: '' });
    await load();
  };

  const shown = (items ?? []).filter((d) => (typeFilter ? d.type === typeFilter : true));

  return (
    <div>
      <PageHeader
        title={typeFilter === 'sop' ? 'SOPs' : 'Knowledge Base'}
        subtitle="Standard operating procedures and notes your AI employees retrieve while working."
        actions={<button className="btn-primary" onClick={() => setShowForm((s) => !s)}>+ New Document</button>}
      />
      {showForm && (
        <Card className="mb-5">
          <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
            <div><label className="label">Title *</label><input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Type</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {['note', 'sop', 'markdown', 'text', 'url', 'document'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="label">Category</label><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            </div>
            <div className="md:col-span-2"><label className="label">Content (markdown)</label><textarea className="input min-h-[160px] font-mono text-xs" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
            <div className="flex gap-2 md:col-span-2"><button className="btn-primary">Save document</button></div>
          </form>
        </Card>
      )}

      {!items ? <div className="grid h-40 place-items-center"><Spinner /></div> : shown.length === 0 ? (
        <EmptyState title="Nothing here yet" hint="SOPs are seeded automatically. Add your own playbooks, notes and documents." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card pad={false}>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {shown.map((d) => (
                <li key={d._id}>
                  <button
                    className="w-full px-4 py-3 text-left"
                    style={{ background: selected?._id === d._id ? 'var(--accent-soft)' : 'transparent' }}
                    onClick={() => setSelected(d)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-sm" style={{ color: selected?._id === d._id ? 'var(--accent)' : 'var(--text)' }}>{d.title}</b>
                      <Tag>{d.type}</Tag>
                    </div>
                    <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>{d.category} · updated {timeAgo(d.updatedAt)}</div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="lg:col-span-2">
            {selected ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-extrabold" style={{ color: 'var(--text)' }}>{selected.title}</h3>
                  <Tag tone="blue">{selected.category}</Tag>
                </div>
                <pre className="whitespace-pre-wrap rounded-lg p-4 text-xs leading-relaxed" style={{ background: 'var(--bg-soft)', color: 'var(--text-2)' }}>
                  {selected.content || '(empty)'}
                </pre>
                {selected.forAgents.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="text-[11px] font-bold" style={{ color: 'var(--text-3)' }}>Retrieved by:</span>
                    {selected.forAgents.map((a) => <Tag key={a}>{a.replace(/_/g, ' ')}</Tag>)}
                  </div>
                )}
              </div>
            ) : (
              <p className="py-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>Select a document to read it.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
