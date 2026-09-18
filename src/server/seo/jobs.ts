/** Job handlers for SEO Intelligence (claimed by the same worker queue). */
import { dbConnect } from '@/lib/db';
import { Crawl } from '@/models';
import { runSeoCrawl } from './crawl-engine';
import { syncGsc } from './gsc';

export async function processSeoCrawlJob(payload: Record<string, unknown>) {
  await dbConnect();
  const crawlId = String(payload.crawlId ?? '');
  if (!crawlId) throw new Error('seo_crawl job missing crawlId');
  const exists = await Crawl.findById(crawlId).select('_id status');
  if (!exists) throw new Error(`Crawl ${crawlId} not found`);
  if (exists.status === 'completed') return;
  await runSeoCrawl(crawlId);
}

export async function processGscSyncJob(payload: Record<string, unknown>) {
  await dbConnect();
  const orgId = String(payload.orgId ?? '');
  const projectId = String(payload.projectId ?? '');
  if (!orgId || !projectId) throw new Error('gsc_sync job missing identifiers');
  await syncGsc(orgId, projectId);
}
