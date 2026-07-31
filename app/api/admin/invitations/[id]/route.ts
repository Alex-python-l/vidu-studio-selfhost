import {
  deleteAdminInvitation,
  updateAdminInvitation,
} from "@/lib/account-data";
import {
  adminApiError,
  cleanInvitationId,
  parseAdminInvitationPatch,
  requestIdFrom,
  requireSameOrigin,
} from "@/lib/admin-data";
import { requireAdminUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    requireSameOrigin(request);
    const actor = await requireAdminUser({ write: true });
    const invitationId = cleanInvitationId((await context.params).id);
    const input = await parseAdminInvitationPatch(request);
    const invitation = await updateAdminInvitation({
      ...input,
      actorUserId: actor.id,
      invitationId,
      requestId,
    });
    return Response.json(
      { invitation, requestId },
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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    requireSameOrigin(request);
    const actor = await requireAdminUser({ write: true });
    const invitationId = cleanInvitationId((await context.params).id);
    await deleteAdminInvitation({
      actorUserId: actor.id,
      invitationId,
      requestId,
    });
    return Response.json(
      { deleted: true, requestId },
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
