'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, usePolling } from '@/lib/api-client';
import { Card, PageHeader, Spinner } from '@/components/ui';

interface Client { _id: string; name: string }

const STEP_TITLES = [
  'Client', 'Website', 'Industry', 'Country', 'Target locations', 'Business goals',
  'Competitors', 'Target keywords', 'Integrations', 'Assign Team Head', 'Start AI Discovery',
];

interface DiscoveryStatus {
  project: { _id: string; name: string; stage: string };
  workflowRun?: { status: string; currentStep: string; steps: { key: string; name: string; status: string }[] };
  tasks: { _id: string; title: string; status: string; kind: string }[];
  findings: { _id: string }[];
}

const STEP_CHECKLISTS: Record<string, string[]> = {
  audit: ['Website reachable', 'Sitemap detection', 'Robots.txt detection', 'Crawl running', 'Technical signals collected'],
  review: ['Team Head analyzing results', 'Prioritizing findings', 'Creating specialist tasks'],
  specialist_work: ['Specialist agents executing tasks'],
  qa: ['QA Agent verifying work'],
  strategy: ['Strategy & report being generated'],
};

export default function NewProjectWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [clients, setClients] = useState<Client[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);

  const [form, setForm] = useState({
    clientId: '', newClientName: '',
    website: '', industry: '', country: '',
    targetLocations: '', businessGoals: '', competitors: '', targetKeywords: '',
    startDiscovery: true,
  });
  const [teamHead, setTeamHead] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    api<{ items: Client[] }>('/api/clients').then((d) => setClients(d.items)).catch(() => undefined);
    api<{ items: { isTeamHead: boolean; name: string; role: string }[] }>('/api/agents').then((d) => {
      const th = d.items.find((a) => a.isTeamHead);
      if (th) setTeamHead({ name: th.name, role: th.role });
    }).catch(() => undefined);
  }, []);

  const list = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

  const canNext =
    step === 0 ? !!(form.clientId || form.newClientName)
    : step === 1 ? form.website.length >= 4
    : true;

  const createProject = async () => {
    setBusy(true); setError('');
    try {
      let clientId = form.clientId;
      if (!clientId && form.newClientName) {
        const c = await api<{ _id: string }>('/api/clients', { method: 'POST', body: { name: form.newClientName, industry: form.industry } });
        clientId = c._id;
      }
      const project = await api<{ _id: string }>('/api/projects', {
        method: 'POST',
        body: {
          clientId,
          name: form.website.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
          website: form.website,
          industry: form.industry,
          country: form.country,
          targetLocations: list(form.targetLocations),
          businessGoals: list(form.businessGoals),
          competitors: list(form.competitors),
          targetKeywords: list(form.targetKeywords),
          startDiscovery: form.startDiscovery,
        },
      });
      setProjectId(project._id);
      setStep(10);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader title="Onboard a Project" subtitle="Eleven steps. Then your AI Team Head takes over." />

      {/* stepper */}
      <div className="mb-6 flex flex-wrap items-center gap-1.5">
        {STEP_TITLES.map((t, i) => (
          <div key={t} className="flex items-center gap-1.5">
            <span
              className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-extrabold"
              style={{
                background: i < step ? 'var(--accent)' : i === step ? 'var(--accent-soft)' : 'var(--bg-soft)',
                color: i <= step ? 'var(--accent)' : 'var(--text-3)',
                border: `1px solid ${i === step ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {i < step ? '✓' : i + 1}
            </span>
            {i < STEP_TITLES.length - 1 && <span className="h-px w-3" style={{ background: 'var(--border-strong)' }} />}
          </div>
        ))}
      </div>
      <div className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
        Step {step + 1} of {STEP_TITLES.length} — {STEP_TITLES[step]}
      </div>

      <Card>
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="label">Existing client</label>
              <select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value, newClientName: '' })}>
                <option value="">— Select or create new below —</option>
                {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div className="text-center text-xs font-bold" style={{ color: 'var(--text-3)' }}>OR</div>
            <div>
              <label className="label">New client name</label>
              <input className="input" value={form.newClientName} onChange={(e) => setForm({ ...form, newClientName: e.target.value, clientId: '' })} placeholder="e.g. Riverside Dental Clinic" />
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            <label className="label">Website URL *</label>
            <input className="input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://client-website.com" />
            <p className="mt-2 text-xs" style={{ color: 'var(--text-2)' }}>The AI crawler will fetch this site live: pages, titles, metas, links, sitemap, robots.txt.</p>
          </div>
        )}
        {step === 2 && (
          <div><label className="label">Industry</label><input className="input" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="e.g. Dental / Legal / SaaS" /></div>
        )}
        {step === 3 && (
          <div><label className="label">Country</label><input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="e.g. India, United States" /></div>
        )}
        {step === 4 && (
          <div><label className="label">Target locations (one per line)</label><textarea className="input min-h-[110px]" value={form.targetLocations} onChange={(e) => setForm({ ...form, targetLocations: e.target.value })} placeholder={'Austin, TX\nRound Rock, TX'} /><p className="mt-2 text-xs" style={{ color: 'var(--text-2)' }}>Local SEO agents verify landing-page coverage for each location.</p></div>
        )}
        {step === 5 && (
          <div><label className="label">Business goals (one per line)</label><textarea className="input min-h-[110px]" value={form.businessGoals} onChange={(e) => setForm({ ...form, businessGoals: e.target.value })} placeholder={'More qualified leads\nGrow organic traffic'} /></div>
        )}
        {step === 6 && (
          <div><label className="label">Competitors (one per line)</label><textarea className="input min-h-[110px]" value={form.competitors} onChange={(e) => setForm({ ...form, competitors: e.target.value })} placeholder={'https://competitor-one.com\nhttps://competitor-two.com'} /><p className="mt-2 text-xs" style={{ color: 'var(--text-2)' }}>The Competitor Analysis Agent crawls these sites live. Leave empty to skip.</p></div>
        )}
        {step === 7 && (
          <div><label className="label">Target keywords (one per line)</label><textarea className="input min-h-[110px]" value={form.targetKeywords} onChange={(e) => setForm({ ...form, targetKeywords: e.target.value })} placeholder={'dentist austin\nemergency dental care'} /></div>
        )}
        {step === 8 && (
          <div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
              Connect integrations later in <b style={{ color: 'var(--text)' }}>Integrations</b>: WordPress (for approved changes), Google Business Profile, Search Console, Analytics, backlink providers.
            </p>
            <div className="mt-3 rounded-lg border px-3 py-2.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
              Agents <b style={{ color: '#d97706' }}>never fabricate</b> integration data — where an integration is missing they report <b>Integration Required</b>.
            </div>
          </div>
        )}
        {step === 9 && (
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-full text-sm font-extrabold text-white" style={{ background: 'var(--accent)' }}>
              {teamHead ? teamHead.name.split(' ').map((p) => p[0]).join('') : '…'}
            </span>
            <div>
              <div className="font-extrabold" style={{ color: 'var(--text)' }}>{teamHead?.name ?? 'Team Head'}</div>
              <div className="text-xs" style={{ color: 'var(--text-2)' }}>{teamHead?.role ?? 'SEO Team Head'} — manages the specialist AI employees, prioritizes work, requests your approvals.</div>
            </div>
          </div>
        )}
        {step === 10 && (
          <DiscoveryProgress projectId={projectId} onDone={() => router.push(`/app/projects/${projectId}`)} />
        )}

        {error && <div className="mt-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#dc2626', background: 'rgba(239,68,68,0.06)' }}>{error}</div>}

        {step < 10 && (
          <div className="mt-6 flex items-center justify-between">
            <button className="btn-ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>← Back</button>
            <div className="flex items-center gap-3">
              {step === 9 && (
                <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                  <input type="checkbox" checked={form.startDiscovery} onChange={(e) => setForm({ ...form, startDiscovery: e.target.checked })} />
                  Start discovery immediately
                </label>
              )}
              {step < 9 && <button className="btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Continue →</button>}
              {step === 9 && <button className="btn-primary" disabled={busy} onClick={createProject}>{busy ? 'Creating…' : 'Create project & start →'}</button>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function DiscoveryProgress({ projectId, onDone }: { projectId: string | null; onDone: () => void }) {
  const [data, setData] = useState<DiscoveryStatus | null>(null);
  usePolling(async () => {
    if (!projectId) return;
    const d = await api<DiscoveryStatus>(`/api/projects/${projectId}?include=full`);
    setData(d);
  }, 3000, !!projectId);

  if (!projectId) return <div className="grid place-items-center py-8"><Spinner /></div>;
  const steps = data?.workflowRun?.steps ?? [];
  const doneChecks: string[] = [];
  const activeChecks: string[] = [];

  const auditDone = steps.find((s) => s.key === 'audit')?.status === 'completed';
  const auditRunning = steps.find((s) => s.key === 'audit')?.status === 'running';
  if (auditDone) doneChecks.push(...STEP_CHECKLISTS.audit);
  else if (auditRunning) { doneChecks.push('Website reachable', 'Crawl started'); activeChecks.push('Crawling pages…', 'Collecting technical signals…'); }
  for (const key of ['review', 'specialist_work', 'qa', 'strategy'] as const) {
    const st = steps.find((s) => s.key === key);
    if (st?.status === 'completed') doneChecks.push(...(STEP_CHECKLISTS[key] ?? []));
    else if (st?.status === 'running') activeChecks.push(...(STEP_CHECKLISTS[key] ?? []));
  }

  const findings = data?.findings?.length ?? 0;
  const tasks = data?.tasks ?? [];
  const waitingApproval = data?.workflowRun?.status === 'waiting_approval';

  return (
    <div>
      <div className="mb-4 rounded-lg border p-4" style={{ borderColor: 'var(--border)' }}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>
            {waitingApproval ? 'Waiting for your approval' : data?.workflowRun?.status === 'completed' ? 'Discovery complete' : 'AI Discovery in progress'}
          </span>
          <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>{data?.workflowRun?.currentStep ?? 'initializing'}</span>
        </div>
        <div className="space-y-1.5 text-[13px]">
          {doneChecks.map((c) => (
            <div key={c} className="flex items-center gap-2" style={{ color: 'var(--text-2)' }}>
              <span style={{ color: '#10b981' }} className="font-bold">✓</span> {c}
            </div>
          ))}
          {activeChecks.map((c) => (
            <div key={c} className="flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <Spinner size={12} /> {c}
            </div>
          ))}
          {doneChecks.length === 0 && <div className="flex items-center gap-2" style={{ color: 'var(--text-2)' }}><Spinner size={12} /> Initializing…</div>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="text-xl font-extrabold" style={{ color: 'var(--accent)' }}>{tasks.length}</div>
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>Tasks created</div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="text-xl font-extrabold" style={{ color: 'var(--accent)' }}>{findings}</div>
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>Findings</div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="text-xl font-extrabold" style={{ color: 'var(--accent)' }}>{tasks.filter((t) => t.status === 'Completed').length}</div>
          <div className="text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>Completed</div>
        </div>
      </div>
      <p className="mt-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
        Every check above reflects a real backend operation — live crawl, stored raw data, rule analysis and Team Head delegation.
      </p>
      <div className="mt-4 flex justify-end">
        <button className="btn-primary" onClick={onDone}>Open project workspace →</button>
      </div>
    </div>
  );
}
