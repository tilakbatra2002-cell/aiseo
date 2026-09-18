export const dynamic = 'force-dynamic';

import mongoose from 'mongoose';
import { ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Project } from '@/models';
import type { SessionPayload } from '@/lib/session';

/** ObjectId for $match stages — Mongoose aggregates never cast strings. */
export const oid = (id: string) => new mongoose.Types.ObjectId(id);

/** Resolve the project for SEO pages: explicit ?project= else org's latest project. */
export async function resolveProject(session: SessionPayload, url: string) {
  await dbConnect();
  const id = new URL(url).searchParams.get('project');
  if (id) {
    const p = await Project.findOne({ _id: id, organization: session.orgId }).select('_id name website isDemo competitors targetKeywords');
    if (!p) throw new ApiError('Project not found', 404);
    return p;
  }
  const p = await Project.findOne({ organization: session.orgId }).sort({ lastActivityAt: -1, createdAt: -1 }).select('_id name website isDemo competitors targetKeywords');
  if (!p) throw new ApiError('No project found. Create a project first.', 404);
  return p;
}
