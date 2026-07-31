import {
  createAdminInvitation,
  listAdminInvitations,
} from "@/lib/account-data";
import {
  adminApiError,
  parseAdminInvitation,
  requestIdFrom,
  requireSameOrigin,
} from "@/lib/admin-data";
import { authRuntimeConfig, requireAdminUser } from "@/lib/auth";
import {
  registrationCodeDigest,
  requireInvitationSigningConfig,
} from "@/lib/session-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    await requireAdminUser();
    const invitations = await listAdminInvitations();
    return Response.json(
      { invitations, requestId },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      },
    );
  } catch (error) {
    return adminApiError(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    requireSameOrigin(request);
    const actor = await requireAdminUser({ write: true });
    const input = await parseAdminInvitation(request);
    const origin = new URL(request.url).origin;
    const config = requireInvitationSigningConfig(authRuntimeConfig());
    const tokenDigest = await registrationCodeDigest(
      input.code,
      config.sessionTokenPepper,
    );
    const invitation = await createAdminInvitation({
      ...input,
      actorUserId: actor.id,
      origin,
      tokenDigest,
      requestId,
    });

    return Response.json(
      { invitation, requestId },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "X-Request-Id": requestId,
        },
      },
    );
  } catch (error) {
    return adminApiError(error, requestId);
  }
}
