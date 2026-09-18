'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Avatar, Card, PageHeader, Spinner, StatusBadge, Tag } from '@/components/ui';

interface Dept {
  _id: string; name: string; description?: string; agentCount: number;
  teamHead?: { name: string; status: string };
}

export default function DepartmentsPage() {
  const [items, setItems] = useState<Dept[] | null>(null);
  const [name, setName] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    const d = await api<{ items: Dept[] }>('/api/departments');
    setItems(d.items);
  };
  useEffect(() => { void load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    await api('/api/departments', { method: 'POST', body: { name } }).catch(() => undefined);
    setName(''); setShowForm(false);
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Departments"
        subtitle="Departments organize your AI employees. The architecture is ready for Content, Ads, Social, Web Dev, Design, Research and Client Success."
        actions={<button className="btn-primary" onClick={() => setShowForm((s) => !s)}>+ New Department</button>}
      />
      {showForm && (
        <Card className="mb-5">
          <form onSubmit={create} className="flex gap-3">
            <input className="input max-w-sm" placeholder="e.g. Content Department" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn-primary">Create</button>
          </form>
        </Card>
      )}
      {!items ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((d) => (
            <Card key={d._id}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-extrabold" style={{ color: 'var(--text)' }}>{d.name}</h3>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>{d.description}</p>
                </div>
                <Tag tone="blue">{d.agentCount} agents</Tag>
              </div>
              {d.teamHead && (
                <div className="mt-3 flex items-center gap-2.5 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                  <Avatar name={d.teamHead.name} size={26} team />
                  <div className="flex-1 text-xs"><b style={{ color: 'var(--text)' }}>{d.teamHead.name}</b> <span style={{ color: 'var(--text-3)' }}>· Team Head</span></div>
                  <StatusBadge value={d.teamHead.status} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
