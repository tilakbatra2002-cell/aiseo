import { Job } from '@/models';

/** Create a background job (Vercel-safe: API routes only enqueue, workers execute). */
export async function enqueueJob(
  orgId: string,
  type: string,
  payload: Record<string, unknown>,
  opts?: { runAfter?: Date; dedupeKey?: string; maxAttempts?: number },
) {
  return Job.create({
    organization: orgId,
    type,
    payload,
    status: 'queued',
    runAfter: opts?.runAfter ?? new Date(),
    maxAttempts: opts?.maxAttempts ?? 3,
    dedupeKey: opts?.dedupeKey,
  });
}

/** Claim the next runnable job (atomic). Also recovers stale locks. */
export async function claimNextJob(orgId?: string) {
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  await Job.updateMany(
    { status: 'running', lockedAt: { $lt: staleBefore } },
    { $set: { status: 'queued' } },
  );
  const job = await Job.findOneAndUpdate(
    {
      status: 'queued',
      runAfter: { $lte: new Date() },
      ...(orgId ? { organization: orgId } : {}),
    },
    { $set: { status: 'running', lockedAt: new Date() }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, new: true },
  );
  return job;
}

export async function completeJob(jobId: string, ok: boolean, lastError?: string) {
  const job = await Job.findById(jobId);
  if (!job) return;
  if (ok) {
    job.status = 'completed';
    await job.save();
    return;
  }
  const attemptsLeft = job.attempts < job.maxAttempts;
  job.status = attemptsLeft ? 'queued' : 'failed';
  job.lastError = lastError?.slice(0, 500);
  if (attemptsLeft) job.runAfter = new Date(Date.now() + Math.pow(2, job.attempts) * 15_000);
  await job.save();
}
