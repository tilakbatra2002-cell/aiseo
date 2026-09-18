export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Workflow, WorkflowRun } from '@/models';
import { requireAuth } from '../_lib';

export const GET = handler(async () => {
  const session = await requireAuth();
  await dbConnect();
  const [templates, runs] = await Promise.all([
    Workflow.find({ isTemplate: true }).lean<any>(),
    WorkflowRun.find({ organization: session.orgId }).populate('project', 'name isDemo').sort({ createdAt: -1 }).limit(30).lean<any>(),
  ]);
  return ok(toId({ templates, runs }));
});
