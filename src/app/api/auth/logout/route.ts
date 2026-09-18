export const dynamic = 'force-dynamic';

import { handler, ok } from '@/lib/http';
import { clearSessionCookie } from '@/lib/session';

export const POST = handler(async () => {
  clearSessionCookie();
  return ok({ loggedOut: true });
});
