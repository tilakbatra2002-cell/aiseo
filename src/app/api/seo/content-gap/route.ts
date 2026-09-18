export const dynamic = 'force-dynamic';

import { handler, ok, toId } from '@/lib/http';
import { requireAuth } from '../../_lib';
import { resolveProject } from '../_seo';
import { contentGap } from '@/server/seo/intelligence';
import { aiComplete } from '@/server/ai';

export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  const project = await resolveProject(session, req.url);
  const data = await contentGap(session.orgId, String(project._id), project.toObject?.() ?? (project as never));

  // AI-derived opportunities: ONLY when an AI provider is enabled; labelled separately, grounded in observed data.
  let aiOpportunities: unknown[] | null = null;
  const grounding = {
    competitorTopicGaps: data.competitorTopicGaps.slice(0, 10),
    gscQueryGaps: data.gscQueryGaps.slice(0, 10),
    trackedKeywords: data.unmappedKeywords,
  };
  if ((data.competitorTopicGaps.length || data.gscQueryGaps.length) ) {
    const ai = await aiComplete([
      { role: 'system', content: 'You are an SEO strategist. Given observed gap data, suggest up to 5 content topics. Return ONLY a JSON array of {"topic": string, "reason": string}. Base suggestions strictly on the provided observed data.' },
      { role: 'user', content: JSON.stringify(grounding) },
    ]);
    if (ai) {
      try { aiOpportunities = JSON.parse(ai.text.replace(/```json|```/g, '').trim()); } catch { aiOpportunities = null; }
    }
  }
  return ok(toId({ ...data, aiOpportunities, aiEnabled: aiOpportunities !== null }));
});
