/**
 * Webamazee AgentOS internal project-priority score.
 * Combines SEO/business impact, effort, risk and confidence.
 * NOTE: This is an internal work-prioritization score. It does NOT predict
 * search-engine rankings.
 */
export function priorityScore(input: {
  impact: number;   // 1-5
  effort: number;   // 1-5 (higher = more effort)
  confidence: number; // 1-5
  risk: number;     // 1-5
  blockedByCount?: number;
}): number {
  const { impact, effort, confidence, risk, blockedByCount = 0 } = input;
  const raw = (impact * 0.45 + confidence * 0.2) * 10 - effort * 3 - risk * 2 - blockedByCount * 5;
  return Math.max(0, Math.min(100, Math.round(raw * 2)));
}

export function scoreToPriority(score: number): 'Critical' | 'High' | 'Medium' | 'Low' {
  if (score >= 70) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 30) return 'Medium';
  return 'Low';
}
