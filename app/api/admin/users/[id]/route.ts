import {
  deleteAdminUser,
  revokeUserSessions,
  updateAdminUser,
} from "@/lib/account-data";
import {
  adminApiError,
  cleanUserId,
  parseAdminUserPatch,
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
    const targetUserId = cleanUserId((await context.params).id);
    const patch = await parseAdminUserPatch(request);

    const user =
      patch.role !== undefined ||
      patch.status !== undefined ||
      patch.concurrencyLimit !== undefined ||
      patch.dailyCreditLimit !== undefined
        ? await updateAdminUser({
            actorUserId: actor.id,
            targetUserId,
            role: patch.role,
            status: patch.status,
            concurrencyLimit: patch.concurrencyLimit,
            dailyCreditLimit: patch.dailyCreditLimit,
            requestId,
          })
        : undefined;

    const revokedSessions = patch.revokeSessions
      ? await revokeUserSessions({
          actorUserId: actor.id,
          targetUserId,
          requestId,
        })
      : 0;

    return Response.json(
      { user, revokedSessions, requestId },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
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
    const targetUserId = cleanUserId((await context.params).id);
    const result = await deleteAdminUser({
      actorUserId: actor.id,
      targetUserId,
      requestId,
    });
    return Response.json(
      { ...result, requestId },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
    );
  } catch (error) {
    return adminApiError(error, requestId);
  }
}
