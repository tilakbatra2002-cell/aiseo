'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, PageHeader, Spinner, Tag } from '@/components/ui';

interface Integration {
  _id: string; provider: string; label: string; status: string; connectedAt?: string; meta?: Record<string, unknown>;
}

const STATE_STYLE: Record<string, { color: string; bg: string }> = {
  Connected: { color: '#059669', bg: 'rgba(16,185,129,0.12)' },
  'Not Connected': { color: 'var(--text-2)', bg: 'var(--bg-soft)' },
  'Requires OAuth': { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  'Requires API Key': { color: '#d97706', bg: 'rgba(245,158,11,0.12)' },
  Unavailable: { color: 'var(--text-3)', bg: 'var(--bg-soft)' },
};

const OAUTH_CATS = ['google_search_console', 'google_analytics', 'google_business_profile'];

export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[] | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const d = await api<{ items: Integration[] }>('/api/integrations');
    setItems(d.items);
  };
  useEffect(() => { void load(); }, []);

  const connect = async (id: string, isOAuth: boolean) => {
    setError('');
    const credentials = isOAuth ? { accessToken: apiKey } : { apiKey };
    try {
      await api(`/api/integrations/${id}`, { method: 'POST', body: { action: 'connect_api_key', credentials } });
      setConnecting(null); setApiKey('');
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const disconnect = async (id: string) => {
    await api(`/api/integrations/${id}`, { method: 'POST', body: { action: 'disconnect' } }).catch(() => undefined);
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Connect real data sources. Agents never fabricate integration data — missing integrations surface as Integration Required."
      />
      {error && <div className="mb-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#dc2626' }}>{error}</div>}
      {!items ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((i) => {
            const st = STATE_STYLE[i.status] ?? STATE_STYLE['Not Connected'];
            const isOAuth = OAUTH_CATS.includes(i.provider);
            return (
              <Card key={i._id}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-extrabold" style={{ color: 'var(--text)' }}>{i.label}</h3>
                  <span className="badge" style={{ background: st.bg, color: st.color }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
                    {i.status}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  {i.provider === 'google_search_console' && 'Search queries, impressions and index coverage via the GSC API.'}
                  {i.provider === 'google_analytics' && 'GA4 traffic and conversion data.'}
                  {i.provider === 'google_business_profile' && 'Profile, reviews, posts and services for the GBP Agent.'}
                  {i.provider === 'wordpress' && 'Apply approved on-page and content changes via the WP REST API.'}
                  {i.provider === 'shopify' && 'Store content and product SEO via Admin API.'}
                  {i.provider === 'webflow' && 'CMS content updates via Webflow API.'}
                  {i.provider === 'ahrefs' && 'Backlink and keyword metrics for the Off-Page and Keyword agents.'}
                  {i.provider === 'semrush' && 'Competitor and keyword data.'}
                  {i.provider === 'dataforseo' && 'SERP, keyword and backlink data pipelines.'}
                  {i.provider === 'slack' && 'Deliver agent notifications to your workspace.'}
                  {i.provider === 'smtp' && 'Send outreach and report emails.'}
                  {i.provider === 'playwright_worker' && 'Headless browser workers for JS-heavy sites and screenshots.'}
                </p>
                {i.connectedAt && <div className="mt-1 text-[10px]" style={{ color: 'var(--text-3)' }}>Connected {new Date(i.connectedAt).toLocaleDateString()}</div>}

                <div className="mt-4">
                  {i.status === 'Connected' ? (
                    <button className="btn-ghost w-full !text-xs" onClick={() => disconnect(i._id)}>Disconnect</button>
                  ) : i.status === 'Unavailable' ? (
                    <Tag>Not available in this environment</Tag>
                  ) : connecting === i._id ? (
                    <div className="space-y-2">
                      <input
                        className="input !py-1.5 text-xs"
                        placeholder={isOAuth ? 'OAuth access token (or client credentials via env)' : 'API key / credentials'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button className="btn-primary flex-1 !py-1.5 !text-xs" onClick={() => connect(i._id, isOAuth)}>Save</button>
                        <button className="btn-ghost !py-1.5 !text-xs" onClick={() => { setConnecting(null); setApiKey(''); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn-ghost w-full !text-xs" onClick={() => setConnecting(i._id)}>
                      {isOAuth ? 'Connect (OAuth)' : 'Connect (API key)'}
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="mt-4 max-w-2xl text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
        Credentials are encrypted at rest (AES-256-GCM) and never returned to the browser. Google integrations complete their OAuth consent flow in production; pasting an access token works for development.
      </p>
    </div>
  );
}
