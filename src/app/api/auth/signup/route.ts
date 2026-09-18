export const dynamic = 'force-dynamic';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { handler, ok } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { setSessionCookie } from '@/lib/session';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { Organization, User } from '@/models';
import { parseBody, readJson } from '../../_lib';
import { provisionOrganization } from '@/server/provision';

const SignupSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(120),
  password: z.string().min(8).max(120),
  agencyName: z.string().min(2).max(80),
});

export const POST = handler(async (req: Request) => {
  if (!rateLimit(`signup:${clientIp(req)}`, 10, 60_000)) {
    return Response.json({ ok: false, error: 'Too many attempts. Wait a minute.' }, { status: 429 });
  }
  const body = parseBody(SignupSchema, await readJson(req));
  await dbConnect();

  const existing = await User.findOne({ email: body.email.toLowerCase() }).select('_id');
  if (existing) {
    return Response.json({ ok: false, error: 'An account with this email already exists.' }, { status: 409 });
  }

  const org = await Organization.create({
    name: body.agencyName,
    slug: `${body.agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${Date.now().toString(36)}`,
  });
  const user = await User.create({
    name: body.name,
    email: body.email.toLowerCase(),
    passwordHash: bcrypt.hashSync(body.password, 12),
    organization: org._id,
    role: 'owner',
  });
  await provisionOrganization(String(org._id));

  await setSessionCookie({ userId: String(user._id), orgId: String(org._id), role: 'owner', name: user.name, email: user.email });
  return ok({ user: { name: user.name, email: user.email, role: user.role }, organization: { id: String(org._id), name: org.name } }, 201);
});
