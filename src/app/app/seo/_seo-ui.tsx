'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { api } from '@/lib/api-client';

/* ------------------------------ data hook ------------------------------ */
export function useApi<T>(url: string, deps: unknown[] = []): { data: T | null; error: string; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    api<T>(url)
      .then((d) => { if (live) { setData(d); setError(''); setLoading(false); } })
      .catch((e) => { if (live) { setError(e.message); setLoading(false); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);
  return { data, error, loading, reload: load };
}

/* -------------------------- project picker ------------------------------ */
interface ProjectLite { _id: string; name: string; website: string; isDemo?: boolean }
export function useProjectParam(): string {
  const sp = useSearchParams();
  return sp.get('project') ?? '';
}
export function ProjectPicker({ suffix = '' }: { suffix?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useProjectParam();
  const { data } = useApi<{ items: ProjectLite[] }>('/api/projects?limit=100');
  const items = data?.items ?? [];
  if (items.length < 2 && !current) return null;
  return (
    <select
      className="input"
      style={{ maxWidth: 260 }}
      value={current || items[0]?._id || ''}
      onChange={(e) => router.push(`${pathname}?project=${e.target.value}${suffix}`)}
    >
      {!current && <option value="">Select project…</option>}
      {items.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
    </select>
  );
}
export function withProject(base: string, project: string) {
  return project ? `${base}?project=${project}` : base;
}

/* ------------------------------ badges ---------------------------------- */
const SRC_STYLES: Record<string, { fg: string; bg: string }> = {
  crawler: { fg: 'var(--accent)', bg: 'var(--accent-soft)' },
  gsc: { fg: '#0b8043', bg: 'rgba(11,128,67,0.12)' },
  ga: { fg: '#ea580c', bg: 'rgba(234,88,12,0.12)' },
  user: { fg: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  ai: { fg: '#0e7490', bg: 'rgba(14,116,144,0.12)' },
};
export function SourceBadge({ source }: { source: string }) {
  const kind = /search console/i.test(source) ? 'gsc' : /analytics/i.test(source) ? 'ga' : /import/i.test(source) ? 'user' : /ai/i.test(source) ? 'ai' : 'crawler';
  const s = SRC_STYLES[kind];
  return (
    <span className="badge" style={{ background: s.bg, color: s.fg }} title="Data source">
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.fg }} /> {source}
    </span>
  );
}

const STATUS_COLORS: Record<string, string> = {
  verified: '#059669', partial: '#d97706', unavailable: '#6b7280', 'requires-integration': '#8b5cf6',
  'not-verified': '#6b7280', estimated: '#0e7490',
};
export function StatusChip({ status }: { status?: string | null }) {
  if (!status) return null;
  const c = STATUS_COLORS[status] ?? '#6b7280';
  return <span className="badge" style={{ background: `${c}1f`, color: c }}>{status.replace(/-/g, ' ')}</span>;
}

export function Metric({ label, value, source, status, note, updatedAt }: {
  label: string; value: React.ReactNode; source?: string; status?: string | null; note?: string | null; updatedAt?: string | null;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{label}</div>
        {status ? <StatusChip status={status} /> : null}
      </div>
      <div className="mt-1.5 text-2xl font-extrabold" style={{ color: 'var(--text)' }}>{value}</div>
      {note ? <div className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>{note}</div> : null}
      {(source || updatedAt) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold" style={{ color: 'var(--text-3)' }}>
          {source ? <span>● {source}</span> : null}
          {updatedAt ? <span title="Last updated">{new Date(updatedAt).toLocaleString()}</span> : null}
        </div>
      )}
    </div>
  );
}

export function Unavailable({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="panel p-4 opacity-80">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div className="mt-1.5 text-lg font-extrabold" style={{ color: 'var(--text-3)' }}>Not Available</div>
      <div className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>{reason}</div>
      <div className="mt-2"><StatusChip status="requires-integration" /></div>
    </div>
  );
}

export function LimitationNote() {
  return (
    <div className="panel p-4 text-xs leading-relaxed" style={{ borderLeft: '3px solid var(--accent)', color: 'var(--text-2)', background: 'var(--bg-soft)' }}>
      <span className="font-extrabold" style={{ color: 'var(--text)' }}>About this data. </span>
      Webamazee SEO Intelligence uses first-party crawling, connected Google data, imported datasets, and other available sources. Some third-party SEO platforms maintain proprietary indexes that cannot be reproduced completely without their datasets. Metrics unavailable from our sources are therefore not fabricated.
    </div>
  );
}

/* -------------------------------- table --------------------------------- */
export function Th({ children, className = '', style }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <th className={`th ${className}`} style={style}>{children}</th>;
}
export function Td({ children, className = '', style }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <td className={`td ${className}`} style={style}>{children}</td>;
}

/* ------------------------------ mini chart ------------------------------- */
export function MiniBars({ points, height = 56, color = 'var(--accent)' }: { points: number[]; height?: number; color?: string }) {
  if (points.length === 0) return <div className="text-xs" style={{ color: 'var(--text-3)' }}>No data yet</div>;
  const w = Math.max(points.length * 10, 60);
  const max = Math.max(...points, 1);
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} className="block">
      {points.map((p, i) => {
        const h = Math.max(2, (p / max) * (height - 6));
        return <rect key={i} x={i * 10 + 1} y={height - h - 2} width={7} height={h} rx={2} fill={color} opacity={0.45 + (0.55 * p) / (max || 1)} />;
      })}
    </svg>
  );
}

export function Sparkline({ points, height = 40 }: { points: number[]; height?: number }) {
  if (points.length < 2) return <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>—</span>;
  const w = Math.max(points.length * 8, 40);
  const min = Math.min(...points); const max = Math.max(...points, min + 0.001);
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - 4 - ((p - min) / (max - min)) * (height - 8)).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------ formatting ------------------------------- */
export const cut = (s: string | null | undefined, n = 60): string => {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
};
export const fmtMs = (ms?: number | null) => (ms === null || ms === undefined ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);
export const fmtBytes = (b?: number | null) => (b === null || b === undefined ? '—' : b > 1e6 ? `${(b / 1e6).toFixed(1)}MB` : b > 1e3 ? `${Math.round(b / 1e3)}KB` : `${b}B`);

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>{children}</h2>
      {right}
    </div>
  );
}
