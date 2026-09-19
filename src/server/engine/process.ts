import { dbConnect } from '@/lib/db';
import { claimNextJob, completeJob } from './queue';
import { runTask } from './dispatch';
import { advanceWorkflow } from './workflow';

import '@/models'; // register all models

/** Process a single job from the queue. Returns true if a job was executed. */
export async function processOneJob(): Promise<boolean> {
  await dbConnect();
  const job = await claimNextJob();
  if (!job) return false;
  try {
    switch (job.type) {
      case 'run_task': {
        // runTask returns { ok:false, error } for already-known failures
        // (missing task/project/unassigned agent) — surface them as real job
        // failures instead of silently marking the job completed.
        const r = await runTask(String((job.payload as { taskId: string }).taskId));
        if (!r.ok) throw new Error(r.error ?? 'runTask failed');
        break;
      }
      case 'advance_workflow':
        await advanceWorkflow(String((job.payload as { projectId: string }).projectId));
        break;
      case 'seo_crawl':
        await (await import('@/server/seo/jobs')).processSeoCrawlJob(job.payload as Record<string, unknown>);
        break;
      case 'gsc_sync':
        await (await import('@/server/seo/jobs')).processGscSyncJob(job.payload as Record<string, unknown>);
        break;
      default:
        throw new Error(`Unknown job type "${job.type}"`);
    }
    await completeJob(String(job._id), true);
  } catch (e) {
    console.error(`[AgentOS Worker] job ${job.type} failed:`, e);
    await completeJob(String(job._id), false, (e as Error).message);
  }
  return true;
}

/**
 * Drain jobs for a bounded duration — used by the serverless API route
 * (Vercel Cron / manual trigger) so no HTTP request stays open long.
 */
export async function processJobsFor(maxMs: number, maxJobs = 20): Promise<number> {
  const start = Date.now();
  let count = 0;
  while (Date.now() - start < maxMs && count < maxJobs) {
    const did = await processOneJob();
    if (!did) break;
    count++;
  }
  return count;
}
