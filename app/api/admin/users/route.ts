import { listAdminUsers } from "@/lib/account-data";
import {
  adminApiError,
  parseAdminUsersQuery,
  requestIdFrom,
} from "@/lib/admin-data";
import { requireAdminUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    await requireAdminUser();
    const query = parseAdminUsersQuery(new URL(request.url));
    const result = await listAdminUsers(query);

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
