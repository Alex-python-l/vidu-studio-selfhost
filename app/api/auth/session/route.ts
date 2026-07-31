import { getAppUser } from "@/lib/auth";
import type { AppSessionSummary } from "@/lib/account-contracts";
import {
  authErrorResponse,
  authJson,
  authRequestId,
} from "../_shared";

export async function GET(request: Request) {
  const requestId = authRequestId(request);
  try {
    const user = await getAppUser();
    return authJson(
      {
        authenticated: Boolean(user),
        user,
      } satisfies AppSessionSummary,
      {},
      requestId,
    );
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}
