export const dynamic = 'force-dynamic';

import { handler, ok, requireAuth } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Organization, User } from '@/models';
import { aiStatus } from '@/server/ai';

export const GET = handler(async () => {
  const session = await requireAuth();
  await dbConnect();
  const [user, org] = await Promise.all([
    User.findById(session.userId).select('name email role organization lastLoginAt').lean<any>(),
    Organization.findById(session.orgId).select('name slug settings').lean<any>(),
  ]);
  return ok({
    user: { ...user, id: session.userId },
    organization: org,
    ai: aiStatus(),
    product: { name: 'Webamazee AgentOS', company: 'Webamazee', tagline: 'AI Employees for Your Digital Agency' },
  });
});
