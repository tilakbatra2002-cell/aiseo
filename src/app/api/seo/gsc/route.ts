export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { GSCProperty, Integration } from '@/models';
import { enqueueJob } from '@/server/engine/queue';
import { requireAuth } from '../../_lib';
import { resolveProject } from '../_seo';
import { buildGscAuthUrl, gscConfigured } from '@/server/seo/gsc';
import { env } from '@/lib/env';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const [prop, integration] = await Promise.all([
    GSCProperty.findOne({ organization: session.orgId, project: project._id }).lean<any>(),
    Integration.findOne({ organization: session.orgId, provider: 'google_search_console', project: String(project._id) }).select('status connectedAt label').lean<any>(),
  ]);
  return ok(toId({
    configured: gscConfigured(),
    connected: Boolean(prop && prop.status === 'connected'),
    property: prop ? { siteUrl: prop.siteUrl, lastSyncAt: prop.lastSyncAt, lastSyncRows: prop.lastSyncRows, connectedAt: prop.connectedAt } : null,
    integration: integration ?? null,
    redirectUri: gscConfigured() ? `${env.APP_URL}/api/seo/gsc/callback` : null,
    note: gscConfigured()
      ? 'Google OAuth client configured. Connect to pull real Search Console queries, pages and daily metrics.'
      : 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see .env.example). Data is never fabricated — this panel stays "Requires Integration" until connected.',
  }));
});

export const POST = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action === 'auth-url') {
    if (!gscConfigured()) throw new ApiError('Google OAuth is not configured (GOOGLE_CLIENT_ID/SECRET missing)', 400);
    return ok({ url: await buildGscAuthUrl(session.orgId, String(project._id)) });
  }
  if (body.action === 'sync') {
    const prop = await GSCProperty.findOne({ organization: session.orgId, project: project._id });
    if (!prop) throw new ApiError('Search Console is not connected for this project', 400);
    await enqueueJob(session.orgId, 'gsc_sync', { orgId: session.orgId, projectId: String(project._id) }, { dedupeKey: `gsc_sync:${project._id}:${Date.now()}` });
    return ok({ queued: true });
  }
  throw new ApiError('Unknown action', 422);
});
