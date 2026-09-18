export const dynamic = 'force-dynamic';

import { handler, ok, toId, ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Report } from '@/models';
import { requireAuth } from '../../_lib';

export const GET = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAuth();
  await dbConnect();
  const report = await Report.findOne({ _id: params.id, organization: session.orgId }).populate('project', 'name website isDemo').lean<any>();
  if (!report) throw new ApiError('Report not found', 404);
  return ok(toId(report));
});
