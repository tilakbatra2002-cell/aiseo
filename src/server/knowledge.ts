import { KnowledgeDocument } from '@/models';

/**
 * Knowledge retrieval: returns only relevant SOPs/docs for an agent —
 * never the whole knowledge base (task-scoped context, §27).
 */
export async function retrieveKnowledge(orgId: string, specialistKey: string, limit = 3) {
  const docs = await KnowledgeDocument.find({
    organization: orgId,
    $or: [{ forAgents: specialistKey }, { forAgents: { $size: 0 } }, { forAgents: { $exists: false } }],
  })
    .select('title type category content tags forAgents')
    .limit(limit)
    .lean<any>();
  return docs;
}
