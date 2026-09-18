export const dynamic = 'force-dynamic';

import { handler, ok } from '@/lib/http';
import { ensureSeeded, resetDemoData } from '@/server/seed';
import { env } from '@/lib/env';
import { User } from '@/models';
import { dbConnect } from '@/lib/db';

/**
 * Seeds the database. Allowed when: no users exist yet (first run) or
 * NODE_ENV is development.
 */
export const POST = handler(async (req: Request) => {
  await dbConnect();
  const userCount = await User.countDocuments();
  const body = (await req.json().catch(() => ({}))) as { resetDemo?: boolean };
  if (body.resetDemo && !env.IS_PROD) {
    await resetDemoData();
    return ok({ resetDemo: true });
  }
  if (userCount > 0 && env.IS_PROD) {
    return Response.json({ ok: false, error: 'Already provisioned.' }, { status: 403 });
  }
  const result = await ensureSeeded();
  return ok(result);
});
