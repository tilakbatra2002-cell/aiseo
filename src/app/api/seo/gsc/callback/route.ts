export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { finishGscConnect, parseGscState } from '@/server/seo/gsc';
import { requireAuth } from '../../../_lib';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  const error = u.searchParams.get('error');
  if (error) redirect(`/app/seo/gsc?error=${encodeURIComponent(error)}`);
  if (!code || !state) redirect('/app/seo/gsc?error=missing_code');
  try {
    await requireAuth();
    const { orgId, projectId } = await parseGscState(state);
    const { siteUrl } = await finishGscConnect(orgId, projectId, code);
    redirect(`/app/seo/gsc?connected=1&site=${encodeURIComponent(siteUrl)}`);
  } catch (e) {
    // next redirect throws internally — rethrow those
    if ((e as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw e;
    redirect(`/app/seo/gsc?error=${encodeURIComponent((e as Error).message.slice(0, 180))}`);
  }
}
