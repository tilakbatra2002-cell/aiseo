'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, PageHeader, Spinner, Tag } from '@/components/ui';
import { ThemeToggle } from '@/components/theme';

interface Me {
  user: { name: string; email: string; role: string };
  organization: { name: string; slug: string; settings?: { aiEnabled?: boolean; defaultApprovalPolicy?: string; autonomousExecution?: boolean } };
  ai: { enabled: boolean; provider: string; model: string; baseUrl?: string };
}

export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [saved, setSaved] = useState('');

  useEffect(() => { api<Me>('/api/auth/me').then(setMe).catch(() => undefined); }, []);

  const update = async (settings: Record<string, unknown>) => {
    await api('/api/organizations', { method: 'PATCH', body: { settings } }).catch(() => undefined);
    setSaved('Saved');
    setTimeout(() => setSaved(''), 1500);
    const fresh = await api<Me>('/api/auth/me').catch(() => null);
    if (fresh) setMe(fresh);
  };

  const resetDemo = async () => {
    if (!confirm('Reset the demo project (clears its tasks, findings and reports)?')) return;
    await fetch('/api/seed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resetDemo: true }) }).catch(() => undefined);
    setSaved('Demo project reset');
    setTimeout(() => setSaved(''), 2000);
  };

  if (!me) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  const s = me.organization.settings ?? {};

  return (
    <div className="max-w-[820px]">
      <PageHeader title="Settings" subtitle="Organization configuration, AI provider and governance controls." />
      {saved && <div className="mb-4 rounded-lg px-3 py-2 text-sm font-bold" style={{ background: 'rgba(16,185,129,0.1)', color: '#059669' }}>{saved}</div>}

      <div className="space-y-5">
        <Card>
          <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Organization</h3>
          <div className="grid gap-3 text-sm md:grid-cols-2" style={{ color: 'var(--text-2)' }}>
            <div><span className="label">Name</span><b style={{ color: 'var(--text)' }}>{me.organization.name}</b></div>
            <div><span className="label">Slug</span><b style={{ color: 'var(--text)' }}>{me.organization.slug}</b></div>
            <div><span className="label">Account</span><b style={{ color: 'var(--text)' }}>{me.user.name} · {me.user.email}</b></div>
            <div><span className="label">Role</span><Tag tone="blue">{me.user.role}</Tag></div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>Appearance</h3>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>Light and dark themes; persisted per device. System preference is used on first visit.</p>
            </div>
            <ThemeToggle />
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Governance & Autonomous Execution</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>Default approval policy</div>
                <div className="text-xs" style={{ color: 'var(--text-3)' }}>Applied to sensitive/external agent actions.</div>
              </div>
              <select
                className="input !w-56 !py-1.5 text-xs"
                value={s.defaultApprovalPolicy ?? 'always_require'}
                onChange={(e) => update({ defaultApprovalPolicy: e.target.value })}
              >
                <option value="always_require">Always Require Approval</option>
                <option value="auto_approve">Auto Approve</option>
                <option value="never_allow">Never Allow</option>
              </select>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>Autonomous execution</div>
                <div className="text-xs" style={{ color: 'var(--text-3)' }}>Allow agents to execute internal work without asking (external actions still respect approval policies).</div>
              </div>
              <button
                className="rounded-full px-3 py-1 text-xs font-bold"
                style={{ background: s.autonomousExecution ? 'var(--accent)' : 'var(--bg-soft)', color: s.autonomousExecution ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)' }}
                onClick={() => update({ autonomousExecution: !s.autonomousExecution })}
              >
                {s.autonomousExecution ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text)' }}>AI Provider</h3>
          <div className="grid gap-2 text-sm md:grid-cols-2" style={{ color: 'var(--text-2)' }}>
            <div className="flex justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)' }}><span>Status</span>{me.ai.enabled ? <Tag tone="blue">Enabled</Tag> : <Tag>Disabled (rule-based mode)</Tag>}</div>
            <div className="flex justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)' }}><span>Provider</span><b style={{ color: 'var(--text)' }}>{me.ai.provider}</b></div>
            <div className="flex justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)' }}><span>Model</span><b style={{ color: 'var(--text)' }}>{me.ai.model}</b></div>
            <div className="flex justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)' }}><span>Base URL</span><b style={{ color: 'var(--text)' }}>{me.ai.baseUrl ?? '—'}</b></div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
            The platform works fully with AI disabled — agents operate on the deterministic rule engine and real crawl data. Configure AI_ENABLED, AI_PROVIDER, AI_BASE_URL, AI_MODEL in the environment to add an LLM layer (Ollama local default). AI-generated content is always labelled.
          </p>
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-extrabold" style={{ color: 'var(--text)' }}>Demo Workspace</h3>
          <p className="mb-3 text-xs" style={{ color: 'var(--text-2)' }}>
            The &quot;Webamazee AgentOS Demo&quot; project (Demo Dental Clinic) is labelled <b>Demo Data</b> everywhere and contains no fabricated metrics. Reset it to re-run discovery from scratch.
          </p>
          <button className="btn-ghost !text-xs" onClick={resetDemo}>Reset demo project</button>
        </Card>
      </div>
    </div>
  );
}
