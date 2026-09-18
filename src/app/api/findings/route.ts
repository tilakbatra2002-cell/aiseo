export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Finding } from '@/models';
import { listQuery, requireAuth } from '../_lib';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const { limit, skip, searchParams } = listQuery(req.url, { limit: 80 });
  await dbConnect();
  const filter: Record<string, unknown> = { organization: session.orgId };
  if (searchParams.get('severity')) filter.severity = searchParams.get('severity');
  if (searchParams.get('status')) filter.status = searchParams.get('status');
  if (searchParams.get('category')) filter.category = searchParams.get('category');
  if (searchParams.get('project')) filter.project = searchParams.get('project');
  const [items, total, bySeverity, byStatus] = await Promise.all([
    Finding.find(filter).populate('project', 'name isDemo').populate('detectedBy', 'name role').sort({ createdAt: -1 }).skip(skip).limit(limit).lean<any>(),
    Finding.countDocuments(filter),
    Finding.aggregate([{ $match: filter as never }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
    Finding.aggregate([{ $match: filter as never }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  return ok(toId({ items, total, bySeverity, byStatus }));
});
