import {
  removeAdminPassword,
  setUserPassword,
} from "@/lib/account-data";
import {
  adminApiError,
  cleanUserId,
  parseAdminPassword,
  requestIdFrom,
  requireSameOrigin,
} from "@/lib/admin-data";
import { requireAdminUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password-security";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    requireSameOrigin(request);
    const actor = await requireAdminUser({ write: true });
    const targetUserId = cleanUserId((await context.params).id);
    const password = await parseAdminPassword(request);
    await setUserPassword({
      actorUserId: actor.id,
      targetUserId,
      credential: await hashPassword(password),
      requestId,
      preserveSessionDigest: null,
    });
    return Response.json(
      { passwordEnabled: true, requestId },
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
    await removeAdminPassword({
      actorUserId: actor.id,
      targetUserId,
      requestId,
    });
    return Response.json(
      { passwordEnabled: false, requestId },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
    );
  } catch (error) {
    return adminApiError(error, requestId);
  }
}