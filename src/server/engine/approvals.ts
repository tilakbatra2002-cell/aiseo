import { Approval, Finding, Integration, Task } from '@/models';
import { logActivity } from '../activity';
import { enqueueJob } from './queue';

/**
 * WordPress execution path (real REST API calls; requires a connected
 * WordPress integration with application-password credentials).
 * Returns per-change results. Never claims success without a 2xx response.
 */
async function executeWordpressChanges(orgId: string, changes: { url: string; field: string; proposed: string }[]) {
  const integ = await Integration.findOne({ organization: orgId, provider: 'wordpress', status: 'Connected' }).lean<any>();
  if (!integ?.credentialsEnc) return { executed: false, reason: 'WordPress integration not connected' };
  let creds: { siteUrl?: string; username?: string; appPassword?: string };
  try {
    const { decrypt } = await import('@/lib/crypto');
    creds = JSON.parse(decrypt(integ.credentialsEnc as string));
  } catch {
    return { executed: false, reason: 'Could not read stored credentials' };
  }
  const results: { url: string; ok: boolean; detail: string }[] = [];
  const auth = Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');
  const site = (creds.siteUrl ?? '').replace(/\/$/, '');
  for (const change of changes) {
    try {
      const slug = new URL(change.url).pathname.split('/').filter(Boolean).pop();
      const search = await fetch(`${site}/wp-json/wp/v2/search?search=${encodeURIComponent(slug ?? '')}&per_page=5`, {
        headers: { authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(12_000),
      });
      if (!search.ok) { results.push({ url: change.url, ok: false, detail: `WP search HTTP ${search.status}` }); continue; }
      const hits = (await search.json()) as { url?: string; id: number; type?: string }[];
      const hit = hits.find((h) => h.url?.replace(/\/$/, '') === change.url.replace(/\/$/, '')) ?? hits[0];
      if (!hit) { results.push({ url: change.url, ok: false, detail: 'No matching WP object found' }); continue; }
      const body: Record<string, string> = change.field === 'title' ? { title: change.proposed } : { meta: JSON.stringify({ description: change.proposed }) };
      const upd = await fetch(`${site}/wp-json/wp/v2/${hit.type === 'post' ? 'posts' : 'pages'}/${hit.id}`, {
        method: 'POST',
        headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
      results.push({ url: change.url, ok: upd.ok, detail: `WP update HTTP ${upd.status}` });
    } catch (e) {
      results.push({ url: change.url, ok: false, detail: (e as Error).message.slice(0, 120) });
    }
  }
  return { executed: results.some((r) => r.ok), results };
}

export async function decideApproval(opts: {
  approvalId: string;
  orgId: string;
  decision: 'Approved' | 'Rejected';
  decidedBy: { id: string; name: string };
  note?: string;
}) {
  const approval = await Approval.findOne({ _id: opts.approvalId, organization: opts.orgId });
  if (!approval) throw new Error('Approval not found');
  if (approval.status !== 'Pending') throw new Error('Approval already decided');

  approval.status = opts.decision;
  approval.decidedBy = { type: 'user', id: opts.decidedBy.id, name: opts.decidedBy.name };
  approval.decisionNote = opts.note;
  approval.decidedAt = new Date();
  await approval.save();

  await logActivity({
    orgId: opts.orgId,
    actor: { type: 'user', id: opts.decidedBy.id, name: opts.decidedBy.name },
    action: `Owner ${opts.decision === 'Approved' ? 'approved' : 'rejected'}: ${approval.title}`,
    projectId: approval.project ? String(approval.project) : undefined,
    taskId: approval.task ? String(approval.task) : undefined,
    metadata: { approvalId: String(approval._id), actionType: approval.actionType },
  });

  if (approval.actionType === 'strategy_plan') {
    if (approval.project) await enqueueJob(opts.orgId, 'advance_workflow', { projectId: String(approval.project) });
    return approval;
  }

  if (approval.actionType === 'onpage_change' && approval.task) {
    const task = await Task.findById(approval.task);
    const payload = approval.payload as { changes?: { url: string; field: string; proposed: string }[]; cmsConnected?: boolean };
    if (!task || !payload?.changes) return approval;

    if (opts.decision === 'Rejected') {
      await Task.updateOne({ _id: task._id }, { $set: { status: 'Rejected' }, $push: { logs: { at: new Date(), message: 'Owner rejected the proposed changes.' } } });
      return approval;
    }

    // Approved
    let execution: { executed: boolean; reason?: string; results?: { url: string; ok: boolean; detail: string }[] } = { executed: false, reason: 'No CMS connected — implementation is manual.' };
    if (payload.cmsConnected) {
      execution = await executeWordpressChanges(opts.orgId, payload.changes);
    }
    const executedOkUrls = new Set(execution.results?.filter((r) => r.ok).map((r) => r.url) ?? []);
    await Task.updateOne({ _id: task._id }, {
      $set: { status: 'Completed' },
      $push: { logs: { at: new Date(), message: execution.executed ? `Executed via WordPress (${executedOkUrls.size} change(s)).` : 'Approved by owner. No CMS connected — changes must be implemented manually.' } },
      'result.execution': execution,
    });
    await Finding.updateMany(
      {
        project: approval.project,
        url: { $in: payload.changes.map((c) => c.url) },
        ruleKey: { $in: ['missing_title', 'title_too_long', 'missing_meta'] },
        status: { $in: ['Detected', 'Recommended'] },
      },
      execution.executed
        ? { $set: { status: 'Executing' } }
        : { $set: { status: 'Approved', actualAction: 'Owner-approved recommendation (manual implementation pending — no CMS connected).' } },
    );
  }
  return approval;
}
