export const dynamic = 'force-dynamic';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { handler, ok } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { setSessionCookie } from '@/lib/session';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { User } from '@/models';
import { parseBody, readJson } from '../../_lib';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = handler(async (req: Request) => {
  if (!rateLimit(`login:${clientIp(req)}`, 12, 60_000)) {
    return Response.json({ ok: false, error: 'Too many attempts. Wait a minute.' }, { status: 429 });
  }
  const body = parseBody(LoginSchema, await readJson(req));
  await dbConnect();

  const user = await User.findOne({ email: body.email.toLowerCase() });
  if (!user || !bcrypt.compareSync(body.password, user.passwordHash)) {
    return Response.json({ ok: false, error: 'Invalid email or password.' }, { status: 401 });
  }
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await setSessionCookie({
    userId: String(user._id),
    orgId: String(user.organization),
    role: user.role,
    name: user.name,
    email: user.email,
  });
  return ok({ user: { name: user.name, email: user.email, role: user.role, orgId: String(user.organization) } });
});
