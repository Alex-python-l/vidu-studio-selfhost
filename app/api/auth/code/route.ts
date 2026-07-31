import {
  createAppSession,
  redeemRegistrationCode,
} from "@/lib/account-data";
import { authRuntimeConfig } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { hashPassword, normalizePassword } from "@/lib/password-security";
import {
  APP_SESSION_MAX_AGE_SECONDS,
  assertSameOrigin,
  newSessionToken,
  normalizeAuthEmail,
  normalizeOpaqueInput,
  registrationCodeDigest,
  requireCodeRuntimeConfig,
  sessionCookie,
  sessionTokenDigest,
} from "@/lib/session-security";
import {
  authErrorResponse,
  authJson,
  authRequestId,
  enforceAuthRateLimits,
  readAuthJson,
} from "../_shared";

const CODE_WINDOW_SECONDS = 15 * 60;

export async function POST(request: Request) {
  const requestId = authRequestId(request);
  try {
    assertSameOrigin(request);
    const config = requireCodeRuntimeConfig(authRuntimeConfig());
    const body = await readAuthJson(request);
    const email = normalizeAuthEmail(body.email);
    const manualCode =
      body.code === undefined || body.code === ""
        ? null
        : normalizeOpaqueInput(body.code, "访问口令", 64);
    const inviteToken =
      body.inviteToken === undefined || body.inviteToken === ""
        ? null
        : normalizeOpaqueInput(body.inviteToken, "邀请链接", 64);
    const code = manualCode ?? inviteToken;
    const password = normalizePassword(body.password);
    if (!code) {
      throw new AppError("缺少访问口令。", 400);
    }

    await enforceAuthRateLimits({
      request,
      email,
      action: "code_redeem",
      limit: 10,
      windowSeconds: CODE_WINDOW_SECONDS,
      abuseHashSecret: config.abuseHashSecret,
    });
    const user = await redeemRegistrationCode({
      email,
      tokenDigest: await registrationCodeDigest(
        code,
        config.sessionTokenPepper,
      ),
      channel: manualCode ? "manual" : "email_link",
      credential: await hashPassword(password),
      requestId,
    });
    const token = newSessionToken();
    await createAppSession({
      userId: user.id,
      tokenDigest: await sessionTokenDigest(
        token,
        config.sessionTokenPepper,
      ),
      expiresAt: new Date(
        Date.now() + APP_SESSION_MAX_AGE_SECONDS * 1_000,
      ).toISOString(),
      maxActiveSessions: 5,
    });

    return authJson(
      { authenticated: true, user },
      { headers: { "Set-Cookie": sessionCookie(token) } },
      requestId,
    );
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}
