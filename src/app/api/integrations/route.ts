export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Integration } from '@/models';
import { requireAuth } from '../_lib';

export const GET = handler(async () => {
  const session = await requireAuth();
  await dbConnect();
  const items = await Integration.find({ organization: session.orgId })
    .select('-credentialsEnc')
    .sort({ createdAt: 1 })
    .lean<any>();
  return ok(toId({ items: items.map((i) => ({ ...i, hasCredentials: !!(i as { credentialsEnc?: string }).credentialsEnc })) }));
});
