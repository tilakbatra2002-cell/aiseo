/**
 * Webamazee SEO Intelligence — Google Search Console (real OAuth + real API data).
 * Nothing is fabricated: without Configured Google credentials + user OAuth consent,
 * all endpoints report "requires-integration".
 */
import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/lib/env';
import { encrypt, decrypt } from '@/lib/crypto';
import { Integration, GSCProperty, GSCQuery, GSCPage, GSCMetricSnapshot, Keyword, KeywordObservation, RankingObservation, Project } from '@/models';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const enc = new TextEncoder();

export const gscConfigured = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

const redirectUri = () => `${env.APP_URL}/api/seo/gsc/callback`;

export async function buildGscAuthUrl(orgId: string, projectId: string): Promise<string> {
  const state = await new SignJWT({ orgId, projectId, purpose: 'gsc_oauth' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(enc.encode(env.JWT_SECRET));
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function parseGscState(state: string): Promise<{ orgId: string; projectId: string }> {
  const { payload } = await jwtVerify(state, enc.encode(env.JWT_SECRET));
  if (payload.purpose !== 'gsc_oauth') throw new Error('Invalid OAuth state');
  return { orgId: String(payload.orgId), projectId: String(payload.projectId) };
}

interface Tokens { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string }

export async function exchangeGscCode(code: string): Promise<Tokens> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Token exchange failed (${res.status}): ${(data as { error_description?: string }).error_description ?? 'no access token'}`);
  return data as Tokens;
}

async function saveTokens(orgId: string, projectId: string, tokens: Tokens, existing?: { refresh_token?: string } | null) {
  const payload = JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? existing?.refresh_token ?? '',
    expires_at: Date.now() + (tokens.expires_in ?? 3500) * 1000,
  });
  const integration = await Integration.findOneAndUpdate(
    { organization: orgId, provider: 'google_search_console', project: projectId },
    { $set: { credentialsEnc: encrypt(payload), status: 'Connected', connectedAt: new Date(), label: 'Google Search Console' } },
    { upsert: true, new: true },
  );
  return integration;
}

export async function finishGscConnect(orgId: string, projectId: string, code: string) {
  const tokens = await exchangeGscCode(code);
  const integration = await saveTokens(orgId, projectId, tokens);
  // list real properties accessible to the consented user
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  const sites = ((data as { siteEntry?: { siteUrl: string }[] }).siteEntry ?? []).map((s) => s.siteUrl);
  const project = await Project.findById(projectId).lean<{ website?: string }>();
  const wanted = project?.website ? [String(project.website), `sc-domain:${hostOf(project.website)}`, `https://${hostOf(project.website)}/`, `http://${hostOf(project.website)}/`] : [];
  const siteUrl = sites.find((s) => wanted.includes(s)) ?? sites[0];
  if (!siteUrl) throw new Error('OAuth succeeded but no Search Console properties are accessible to this account. Verify site ownership in GSC.');
  await GSCProperty.findOneAndUpdate(
    { organization: orgId, project: projectId },
    { $set: { siteUrl, status: 'connected', integration: integration._id, connectedAt: new Date() } },
    { upsert: true },
  );
  return { siteUrl, sitesAvailable: sites };
}

async function freshAccessToken(orgId: string, projectId: string): Promise<{ accessToken: string; refreshToken: string }> {
  const integration = await Integration.findOne({ organization: orgId, provider: 'google_search_console', project: projectId, status: 'Connected' });
  if (!integration?.credentialsEnc) throw new Error('Search Console is not connected for this project.');
  const saved = JSON.parse(decrypt(integration.credentialsEnc)) as { access_token: string; refresh_token: string; expires_at?: number };
  if (saved.expires_at && saved.expires_at > Date.now() + 60_000) return { accessToken: saved.access_token, refreshToken: saved.refresh_token };
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: saved.refresh_token, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    await Integration.updateOne({ _id: integration._id }, { $set: { status: 'Error', meta: { lastError: 'refresh failed' } } });
    throw new Error('Could not refresh the Google access token — reconnect Search Console.');
  }
  await saveTokens(orgId, projectId, data as Tokens, saved);
  return { accessToken: (data as Tokens).access_token, refreshToken: saved.refresh_token };
}

interface SxRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }

async function querySearchAnalytics(siteUrl: string, accessToken: string, body: Record<string, unknown>): Promise<SxRow[]> {
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ searchType: 'web', dataState: 'all', ...body }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GSC API error ${res.status}: ${(data as { error?: { message?: string } }).error?.message ?? 'unknown'}`);
  return (data as { rows?: SxRow[] }).rows ?? [];
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Pull ~90 days of real GSC data into our stores. Returns measured counts. */
export async function syncGsc(orgId: string, projectId: string): Promise<{ rows: number; days: number; siteUrl: string }> {
  const prop = await GSCProperty.findOne({ organization: orgId, project: projectId });
  if (!prop) throw new Error('No Search Console property connected for this project.');
  const { accessToken } = await freshAccessToken(orgId, projectId);
  const end = new Date(Date.now() - 2 * 86400_000); // GSC data latency ≈ 2 days
  const start = new Date(end.getTime() - 88 * 86400_000);

  const rows = await querySearchAnalytics(prop.siteUrl, accessToken, {
    startDate: day(start), endDate: day(end),
    dimensions: ['query', 'page', 'country', 'device'],
    rowLimit: 5000,
  });

  let written = 0;
  for (const r of rows) {
    const [query, page, country, device] = r.keys;
    const doc = {
      organization: orgId, project: projectId, siteUrl: prop.siteUrl,
      query, page, country, device,
      clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
    };
    await GSCQuery.updateOne({ project: projectId, query, page, country, device }, { $set: doc }, { upsert: true });
    written++;
  }

  // daily site-level snapshots (real totals)
  const daily = await querySearchAnalytics(prop.siteUrl, accessToken, {
    startDate: day(start), endDate: day(end),
    dimensions: ['date'],
    rowLimit: 500,
  });
  for (const r of daily) {
    await GSCMetricSnapshot.updateOne(
      { project: projectId, siteUrl: prop.siteUrl, date: r.keys[0] },
      { $set: { organization: orgId, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position } },
      { upsert: true },
    );
    await KeywordObservation.updateOne(
      { project: projectId, date: r.keys[0], term: '__site__', source: 'gsc' },
      { $set: { organization: orgId, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position } },
      { upsert: true },
    ).catch(() => undefined);
  }

  // page-level
  const pages = await querySearchAnalytics(prop.siteUrl, accessToken, {
    startDate: day(start), endDate: day(end),
    dimensions: ['page'],
    rowLimit: 1000,
  });
  for (const r of pages) {
    await GSCPage.updateOne(
      { project: projectId, siteUrl: prop.siteUrl, page: r.keys[0], date: day(end) },
      { $set: { organization: orgId, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position } },
      { upsert: true },
    );
  }

  // keyword observations + ranking observations for tracked keywords
  const tracked = await Keyword.find({ organization: orgId, project: projectId, status: 'active' }).lean<{ _id: unknown; term: string; targetUrl?: string; country?: string; device?: string }[]>();
  for (const kw of tracked) {
    const krows = await querySearchAnalytics(prop.siteUrl, accessToken, {
      startDate: day(start), endDate: day(end),
      dimensions: ['date'],
      dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator: 'equals', expression: kw.term }] }],
      rowLimit: 200,
    }).catch(() => [] as SxRow[]);
    for (const r of krows) {
      const date = r.keys[0];
      await KeywordObservation.updateOne(
        { project: projectId, term: kw.term, date, source: 'gsc' },
        { $set: { organization: orgId, keyword: kw._id, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position } },
        { upsert: true },
      );
      await RankingObservation.updateOne(
        { project: projectId, keyword: kw._id, date },
        { $set: { organization: orgId, term: kw.term, position: r.position, source: 'gsc', sourceLabel: 'Google Search Console Average Position', targetUrl: kw.targetUrl ?? null, country: kw.country ?? 'us', device: kw.device ?? 'desktop' } },
        { upsert: true },
      );
    }
  }

  await GSCProperty.updateOne({ _id: prop._id }, { $set: { lastSyncAt: new Date(), lastSyncRows: written } });
  return { rows: written, days: daily.length, siteUrl: prop.siteUrl };
}

const hostOf = (website: string) => {
  try { return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).host.replace(/^www\./, ''); } catch { return website.replace(/^https?:\/\//, '').replace(/\/.*$/, ''); }
};
