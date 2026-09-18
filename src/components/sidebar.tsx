'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AgentOSLogo } from './logo';
import { ThemeToggle } from './theme';
import { api } from '@/lib/api-client';

const NAV: { section: string | null; items: { href: string; label: string; icon: JSX.Element }[] }[] = [
  {
    section: null,
    items: [{ href: '/app/dashboard', label: 'Dashboard', icon: <Icon d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" /> }],
  },
  {
    section: 'Workspace',
    items: [
      { href: '/app/clients', label: 'Clients', icon: <Icon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /> },
      { href: '/app/projects', label: 'Projects', icon: <Icon d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11Z" /> },
      { href: '/app/tasks', label: 'Tasks', icon: <Icon d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /> },
      { href: '/app/findings', label: 'Findings', icon: <Icon d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4m0 4h.01" /> },
      { href: '/app/reports', label: 'Reports', icon: <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M16 13H8m8 4H8m2-8H8" /> },
    ],
  },
  {
    section: 'SEO Intelligence',
    items: [
      { href: '/app/seo/overview', label: 'SEO Overview', icon: <Icon d="M3 3v18h18M18 17V9m-5 8V5M8 17v-3" /> },
      { href: '/app/seo/audit', label: 'Site Audit', icon: <Icon d="M12 2 4 5v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V5l-8-3Zm-1.5 10-2 2m2-2 4-4" /> },
      { href: '/app/seo/explorer', label: 'Site Explorer', icon: <Icon d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z" /> },
      { href: '/app/seo/pages', label: 'Pages', icon: <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6" /> },
      { href: '/app/seo/keywords', label: 'Keywords', icon: <Icon d="M20 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-2 10 4 2M8 11h6M11 8v6" /> },
      { href: '/app/seo/rankings', label: 'Rankings', icon: <Icon d="M18 20V10m-6 10V4M6 20v-6" /> },
      { href: '/app/seo/competitors', label: 'Competitors', icon: <Icon d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /> },
      { href: '/app/seo/content-gap', label: 'Content Gap', icon: <Icon d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /> },
      { href: '/app/seo/internal-links', label: 'Internal Links', icon: <Icon d="M9 17H7A5 5 0 0 1 7 7h2m6 10h2a5 5 0 0 0 0-10h-2m-7 5h6" /> },
      { href: '/app/seo/backlinks', label: 'Backlinks', icon: <Icon d="M13 5 19 11M8 19l6-6M16 3h5v5M4 20 21 3" /> },
      { href: '/app/seo/gsc', label: 'Search Console', icon: <Icon d="M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10l10 0Z" /> },
      { href: '/app/seo/analytics', label: 'SEO Analytics', icon: <Icon d="M3 3v18h18M7 15l4-4 3 3 5-6" /> },
      { href: '/app/seo/history', label: 'SEO History', icon: <Icon d="M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2" /> },
      { href: '/app/seo/reports', label: 'SEO Reports', icon: <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M9 15l2 2 4-4" /> },
    ],
  },
  {
    section: 'AI Workforce',
    items: [
      { href: '/app/agents', label: 'Agents', icon: <Icon d="M12 8V4m0 0H8m4 0h4M5 8h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm4 5h.01M15 13h.01M9 19v2m6-2v2" /> },
      { href: '/app/departments', label: 'Departments', icon: <Icon d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M15 9h.01M15 13h.01M9 17h6" /> },
      { href: '/app/runs', label: 'Agent Runs', icon: <Icon d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" /> },
      { href: '/app/activity', label: 'Activity', icon: <Icon d="M22 12h-4l-3 9L9 3l-3 9H2" /> },
    ],
  },
  {
    section: 'Automation',
    items: [
      { href: '/app/workflows', label: 'Workflows', icon: <Icon d="M4 6h6v6H4zM14 12h6v6h-6zM10 9h4m-7 6v3h7v-3" /> },
      { href: '/app/approvals', label: 'Approvals', icon: <Icon d="M9 12l2 2 4-4m5.6 2A10 10 0 1 1 12 2a10 10 0 0 1 8.6 10Z" /> },
      { href: '/app/jobs', label: 'Jobs', icon: <Icon d="M20 7h-9M14 17H5M17 4v6M7 14v6" /> },
    ],
  },
  {
    section: 'Knowledge',
    items: [
      { href: '/app/knowledge', label: 'Knowledge Base', icon: <Icon d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z" /> },
      { href: '/app/knowledge?type=sop', label: 'SOPs', icon: <Icon d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" /> },
    ],
  },
  {
    section: null,
    items: [
      { href: '/app/integrations', label: 'Integrations', icon: <Icon d="M10 14a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 10a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /> },
      { href: '/app/settings', label: 'Settings', icon: <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2.1-1.6-2-3.5-2.5 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.5a7.5 7.5 0 0 0-2 1.2l-2.5-1-2 3.5L4.7 10.8a7.4 7.4 0 0 0 0 2.4l-2.1 1.6 2 3.5 2.5-1a7.5 7.5 0 0 0 2 1.2l.4 2.5h5l.4-2.5a7.5 7.5 0 0 0 2-1.2l2.5 1 2-3.5-2.1-1.6a7.4 7.4 0 0 0 .1-1.2Z" /> },
    ],
  },
];

function Icon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={d} />
    </svg>
  );
}

export function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/login');
  };

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex w-[232px] flex-col border-r"
      style={{ background: 'var(--bg-soft)', borderColor: 'var(--border)' }}
    >
      <div className="flex h-14 items-center border-b px-4" style={{ borderColor: 'var(--border)' }}>
        <Link href="/app/dashboard"><AgentOSLogo size={26} /></Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {NAV.map((group, gi) => (
          <div key={gi} className={gi === 0 ? '' : 'mt-4'}>
            {group.section && (
              <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                {group.section}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const base = item.href.split('?')[0];
                const active = pathname === base || (base !== '/app/dashboard' && pathname.startsWith(base + '/'))
                  || (item.label === 'Dashboard' && pathname === '/app/dashboard');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-semibold"
                    style={{
                      color: active ? 'var(--accent)' : 'var(--text-2)',
                      background: active ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-bold" style={{ color: 'var(--text-3)' }}>
            AI EMPLOYEES FOR YOUR AGENCY
          </span>
          <ThemeToggle compact />
        </div>
        <div className="flex items-center justify-between rounded-lg px-1 py-1">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: 'var(--accent)' }}>
              {userName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
            </span>
            <span className="truncate text-xs font-bold" style={{ color: 'var(--text)' }}>{userName}</span>
          </div>
          <button onClick={logout} title="Sign out" className="btn-ghost !px-2 !py-1 text-[11px]">Sign out</button>
        </div>
      </div>
    </aside>
  );
}
