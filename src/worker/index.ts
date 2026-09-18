/**
 * Webamazee AgentOS Worker — local/persistent worker process.
 *
 * Long-running work (crawls, agent runs, QA verification) never happens
 * inside an HTTP request. API routes enqueue jobs; this worker (or the
 * serverless /api/jobs/process route on Vercel) executes them.
 *
 * Run with:  npm run worker
 */
import { dbConnect } from '@/lib/db';
import { env } from '@/lib/env';
import { processOneJob } from '@/server/engine/process';

async function main() {
  console.log('┌────────────────────────────────────────────┐');
  console.log('│  Webamazee AgentOS — Worker                 │');
  console.log(`│  Polling every ${env.WORKER_POLL_MS}ms                     │`);
  console.log('└────────────────────────────────────────────┘');
  await dbConnect();
  console.log('[worker] connected to MongoDB');

  let idleStreak = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const did = await processOneJob();
      idleStreak = did ? 0 : idleStreak + 1;
      if (!did) {
        await new Promise((r) => setTimeout(r, env.WORKER_POLL_MS));
      }
    } catch (e) {
      console.error('[worker] loop error', e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

main().catch((e) => {
  console.error('[worker] fatal', e);
  process.exit(1);
});
