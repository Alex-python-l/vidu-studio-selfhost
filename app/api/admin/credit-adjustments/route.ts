import { adjustAdminCredits } from "@/lib/account-data";
import {
  adminApiError,
  parseCreditAdjustment,
  requestIdFrom,
  requireSameOrigin,
} from "@/lib/admin-data";
import { requireAdminUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    requireSameOrigin(request);
    const actor = await requireAdminUser({ write: true });
    const input = await parseCreditAdjustment(request);
    const result = await adjustAdminCredits({
      ...input,
      actorUserId: actor.id,
      requestId,
    });

    return Response.json(
      { result, requestId },
      {
        status: 201,
        headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
      },
    );
  } catch (error) {
    return adminApiError(error, requestId);
  }
}
