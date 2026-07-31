import { requireApiUser } from "@/lib/auth";
import {
  clearTaskHistory,
  ensureStudioUser,
} from "@/lib/data";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/session-security";

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const profile = await requireApiUser();
    const user = await ensureStudioUser(profile);
    const deletedCount = await clearTaskHistory(user.id);

    return Response.json({ deletedCount });
  } catch (error) {
    return errorResponse(error);
  }
}
