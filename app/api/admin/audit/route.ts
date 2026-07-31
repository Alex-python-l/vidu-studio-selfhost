import { listAdminAudit } from "@/lib/account-data";
import {
  adminApiError,
  requestIdFrom,
} from "@/lib/admin-data";
import { requireAdminUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    await requireAdminUser();
    const url = new URL(request.url);
    const auditCursor =
      url.searchParams.get("auditCursor")?.trim() ||
      url.searchParams.get("cursor")?.trim() ||
      undefined;
    const ledgerCursor =
      url.searchParams.get("ledgerCursor")?.trim() || undefined;
    if (
      [auditCursor, ledgerCursor].some(
        (cursor) => cursor && cursor.length > 256,
      )
    ) {
      return Response.json(
        { error: "分页游标不合法。", requestId },
        { status: 400 },
      );
    }
    const result = await listAdminAudit({
      auditCursor,
      ledgerCursor,
      limit: 8,
    });

    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    return adminApiError(error, requestId);
  }
}
