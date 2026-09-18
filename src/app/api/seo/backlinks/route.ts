export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { Backlink, BacklinkImport } from '@/models';
import { requireAuth } from '../../_lib';
import { resolveProject, oid } from '../_seo';
import { importBacklinksCsv, SRC } from '@/server/seo/intelligence';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const u = new URL(req.url);
  const filter: Record<string, unknown> = { organization: session.orgId, project: project._id };
  if (u.searchParams.get('source')) filter.source = u.searchParams.get('source');
  if (u.searchParams.get('followType')) filter.followType = u.searchParams.get('followType');
  const q = (u.searchParams.get('q') ?? '').trim();
  if (q) filter.$or = [{ sourceUrl: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { targetUrl: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { anchor: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }];
  const limit = Math.min(Number(u.searchParams.get('limit') ?? 50), 200);
  const skip = Number(u.searchParams.get('skip') ?? 0);
  const [items, total, bySource, byFollow, imports] = await Promise.all([
    Backlink.find(filter).sort({ firstSeenAt: -1 }).skip(skip).limit(limit).lean<any>(),
    Backlink.countDocuments(filter),
    Backlink.aggregate([{ $match: { organization: oid(session.orgId), project: project._id } as never }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Backlink.aggregate([{ $match: { organization: oid(session.orgId), project: project._id } as never }, { $group: { _id: '$followType', count: { $sum: 1 } } }]),
    BacklinkImport.find({ organization: session.orgId, project: project._id }).sort({ createdAt: -1 }).limit(10).lean<any>(),
  ]);
  return ok(toId({
    items, total, bySource, byFollow, imports,
    label: 'Discovered Backlinks',
    disclaimer: 'This is a discovered backlink dataset, not a complete internet-wide backlink index. Sources: ' + SRC.crawler + ', user CSV imports, connected Google data where available.',
  }));
});

export const POST = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const contentType = req.headers.get('content-type') ?? '';
  let csv = ''; let filename: string | undefined;
  if (contentType.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    csv = String(body.csv ?? '');
    filename = typeof body.filename === 'string' ? body.filename : undefined;
  } else {
    csv = await req.text();
    filename = req.headers.get('x-filename') ?? undefined;
  }
  if (!csv.trim()) throw new ApiError('CSV body required (columns: source_url,target_url,anchor_text,rel,discovered_at)', 422);
  const result = await importBacklinksCsv(session.orgId, String(project._id), csv, filename);
  return ok(toId({ ...result, label: 'Imported backlinks are labelled as "Discovered Backlinks" (user import), not a complete index.' }));
});
