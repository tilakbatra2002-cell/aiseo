export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { handler, ok, toId, ApiError } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Integration } from '@/models';
import { encrypt } from '@/lib/crypto';
import { parseBody, readJson, requireAuth } from '../../_lib';
import { logActivity } from '@/server/activity';

const ConnectSchema = z.object({
  action: z.enum(['connect_api_key', 'disconnect', 'mark_unavailable']),
  credentials: z.record(z.string()).optional(),
});

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAuth();
  if (!['owner', 'admin'].includes(session.role)) throw new ApiError('Only owners can manage integrations', 403);
  const body = parseBody(ConnectSchema, await readJson(req));
  await dbConnect();
  const integ = await Integration.findOne({ _id: params.id, organization: session.orgId });
  if (!integ) throw new ApiError('Integration not found', 404);

  if (body.action === 'disconnect') {
    integ.status = integ.provider.startsWith('google') ? 'Requires OAuth' : 'Requires API Key';
    integ.credentialsEnc = undefined;
    integ.connectedAt = undefined;
    await integ.save();
    await logActivity({ orgId: session.orgId, actor: { type: 'user', id: session.userId, name: session.name }, action: `Owner disconnected ${integ.label}` });
    return ok(toId({ ...integ.toObject(), credentialsEnc: undefined }));
  }
  if (body.action === 'mark_unavailable') {
    integ.status = 'Unavailable';
    await integ.save();
    return ok(toId({ ...integ.toObject(), credentialsEnc: undefined }));
  }
  // connect_api_key — for OAuth providers we record configuration (client id/secret);
  // a real OAuth redirect flow can be layered on without changing this API.
  if (body.action === 'connect_api_key') {
    if (integ.status === 'Requires OAuth') {
      const hasConfig = body.credentials && (body.credentials.clientId || body.credentials.accessToken);
      if (!hasConfig) throw new ApiError('OAuth integrations require client credentials or an access token', 422);
      integ.credentialsEnc = encrypt(JSON.stringify(body.credentials));
      integ.status = 'Connected';
      integ.connectedAt = new Date();
    } else {
      const creds = body.credentials ?? {};
      if (!Object.values(creds).some((v) => v && v.length > 2)) throw new ApiError('Provide API credentials for this provider', 422);
      integ.credentialsEnc = encrypt(JSON.stringify(creds));
      integ.status = 'Connected';
      integ.connectedAt = new Date();
    }
    await integ.save();
    await logActivity({ orgId: session.orgId, actor: { type: 'user', id: session.userId, name: session.name }, action: `Owner connected ${integ.label}` });
    return ok(toId({ ...integ.toObject(), credentialsEnc: undefined, hasCredentials: true }));
  }
  throw new ApiError('Unknown action', 400);
});
