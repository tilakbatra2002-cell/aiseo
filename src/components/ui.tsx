'use client';

import React from 'react';

export function timeAgo(date: string | Date | undefined | null): string {
  if (!date) return '—';
  const d = new Date(date);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fmtTime(date: string | Date | undefined | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const STATUS_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  Idle: { bg: 'rgba(107,114,128,0.12)', fg: 'var(--text-2)', dot: '#9aa3af' },
  Working: { bg: 'var(--accent-soft)', fg: 'var(--accent)', dot: 'var(--accent)' },
  Running: { bg: 'var(--accent-soft)', fg: 'var(--accent)', dot: 'var(--accent)' },
  Waiting: { bg: 'rgba(245,158,11,0.12)', fg: '#d97706', dot: '#f59e0b' },
  Paused: { bg: 'rgba(107,114,128,0.12)', fg: 'var(--text-2)', dot: '#9aa3af' },
  'Needs Approval': { bg: 'rgba(139,92,246,0.12)', fg: '#8b5cf6', dot: '#8b5cf6' },
  Queued: { bg: 'rgba(107,114,128,0.12)', fg: 'var(--text-2)', dot: '#9aa3af' },
  Assigned: { bg: 'var(--accent-soft)', fg: 'var(--accent)', dot: 'var(--accent)' },
  Completed: { bg: 'rgba(16,185,129,0.12)', fg: '#059669', dot: '#10b981' },
  Approved: { bg: 'rgba(16,185,129,0.12)', fg: '#059669', dot: '#10b981' },
  Verified: { bg: 'rgba(16,185,129,0.12)', fg: '#059669', dot: '#10b981' },
  Failed: { bg: 'rgba(239,68,68,0.12)', fg: '#dc2626', dot: '#ef4444' },
  Error: { bg: 'rgba(239,68,68,0.12)', fg: '#dc2626', dot: '#ef4444' },
  Rejected: { bg: 'rgba(239,68,68,0.12)', fg: '#dc2626', dot: '#ef4444' },
  'Needs Rework': { bg: 'rgba(245,158,11,0.12)', fg: '#d97706', dot: '#f59e0b' },
  Cancelled: { bg: 'rgba(107,114,128,0.12)', fg: 'var(--text-2)', dot: '#9aa3af' },
  Pending: { bg: 'rgba(245,158,11,0.12)', fg: '#d97706', dot: '#f59e0b' },
  Detected: { bg: 'rgba(245,158,11,0.12)', fg: '#d97706', dot: '#f59e0b' },
  Recommended: { bg: 'var(--accent-soft)', fg: 'var(--accent)', dot: 'var(--accent)' },
  Executing: { bg: 'var(--accent-soft)', fg: 'var(--accent)', dot: 'var(--accent)' },
  Executed: { bg: 'rgba(16,185,129,0.12)', fg: '#059669', dot: '#10b981' },
  Offline: { bg: 'rgba(107,114,128,0.15)', fg: 'var(--text-3)', dot: '#6b7280' },
};

const SEV_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  Critical: { bg: 'rgba(239,68,68,0.14)', fg: '#dc2626', dot: '#ef4444' },
  High: { bg: 'rgba(249,115,22,0.14)', fg: '#ea580c', dot: '#f97316' },
  Medium: { bg: 'rgba(245,158,11,0.14)', fg: '#d97706', dot: '#f59e0b' },
  Low: { bg: 'var(--accent-soft)', fg: 'var(--accent)', dot: 'var(--accent)' },
  Informational: { bg: 'rgba(107,114,128,0.12)', fg: 'var(--text-2)', dot: '#9aa3af' },
};

export function StatusBadge({ value }: { value?: string | null }) {
  const v = value ?? 'Idle';
  const c = STATUS_COLORS[v] ?? STATUS_COLORS.Idle;
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: c.dot }} />
      {v}
    </span>
  );
}

export function SeverityBadge({ value }: { value?: string | null }) {
  const v = value ?? 'Low';
  const c = SEV_COLORS[v] ?? SEV_COLORS.Low;
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      {v}
    </span>
  );
}

export function DemoTag() {
  return (
    <span className="badge" style={{ background: 'rgba(245,158,11,0.14)', color: '#d97706', border: '1px dashed rgba(217,119,6,0.5)' }}>
      Demo Data
    </span>
  );
}

export function Tag({ children, tone }: { children: React.ReactNode; tone?: 'blue' }) {
  return (
    <span className="badge" style={{
      background: tone === 'blue' ? 'var(--accent-soft)' : 'var(--bg-soft)',
      color: tone === 'blue' ? 'var(--accent)' : 'var(--text-2)',
      border: '1px solid var(--border)',
    }}>
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>{title}</h1>
        {subtitle && <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '', pad = true }: { children: React.ReactNode; className?: string; pad?: boolean }) {
  return <div className={`panel ${pad ? 'p-5' : ''} ${className}`}>{children}</div>;
}

export function StatCard({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div className="panel p-4">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div className="mt-1.5 text-2xl font-extrabold" style={{ color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
      {hint && <div className="mt-0.5 text-xs" style={{ color: 'var(--text-2)' }}>{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-2 p-10 text-center">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.6" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M8 20h8M12 18v2" />
        <path d="m9 11 2 2 4-4" />
      </svg>
      <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>{title}</div>
      {hint && <div className="max-w-sm text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>{hint}</div>}
      {action}
      <div className="mt-2 text-[11px] font-semibold" style={{ color: 'var(--text-3)' }}>Webamazee AgentOS</div>
    </div>
  );
}

export function Avatar({ name, size = 34, team }: { name?: string; size?: number; team?: boolean }) {
  const initials = (name ?? '??').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const hue = Math.abs((name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{
        width: size, height: size, fontSize: size * 0.36,
        background: team ? 'var(--accent)' : `hsl(${hue} 45% ${team ? 45 : 40}%)`,
      }}
    >
      {initials}
    </span>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="mb-5 flex flex-wrap gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className="rounded-t-md px-3.5 py-2 text-sm font-semibold"
          style={{
            color: active === t ? 'var(--accent)' : 'var(--text-2)',
            borderBottom: active === t ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
