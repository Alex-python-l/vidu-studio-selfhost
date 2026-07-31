import { revokeAppSession } from "@/lib/account-data";
import { authRuntimeConfig } from "@/lib/auth";
import {
  assertSameOrigin,
  clearedSessionCookie,
  sessionTokenDigest,
  sessionTokenFromCookieHeader,
} from "@/lib/session-security";
import {
  authErrorResponse,
  authJson,
  authRequestId,
} from "../_shared";

export async function POST(request: Request) {
  const requestId = authRequestId(request);
  let originValidated = false;
  try {
    assertSameOrigin(request);
    originValidated = true;
    const pepper = authRuntimeConfig().sessionTokenPepper;
    const token = sessionTokenFromCookieHeader(
      request.headers.get("cookie"),
    );
    if (token && pepper) {
      await revokeAppSession(
        await sessionTokenDigest(token, pepper),
      );
    }
    return authJson(
      { authenticated: false, user: null },
      { headers: { "Set-Cookie": clearedSessionCookie() } },
      requestId,
    );
  } catch (error) {
    const response = authErrorResponse(error, requestId);
    return originValidated ? withClearedCookie(response) : response;
  }
}

function withClearedCookie(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Set-Cookie", clearedSessionCookie());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
