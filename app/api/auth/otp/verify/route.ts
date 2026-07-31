import {
  acceptEmailInvitation,
  createAppSession,
  resolveIdentityClaims,
} from "@/lib/account-data";
import type { IdentityClaims } from "@/lib/account-contracts";
import { authRuntimeConfig } from "@/lib/auth";
import {
  APP_SESSION_MAX_AGE_SECONDS,
  assertSameOrigin,
  inviteTokenDigest,
  newSessionToken,
  normalizeAuthEmail,
  normalizeOpaqueInput,
  normalizeOtpCode,
  requireOtpRuntimeConfig,
  sessionCookie,
  sessionTokenDigest,
} from "@/lib/session-security";
import { AppError } from "@/lib/errors";
import { verifySupabaseEmailOtp } from "@/lib/supabase-auth";
import {
  authErrorResponse,
  authJson,
  authRequestId,
  enforceAuthRateLimits,
  readAuthJson,
} from "../../_shared";

const OTP_WINDOW_SECONDS = 15 * 60;

export async function POST(request: Request) {
  const requestId = authRequestId(request);
  try {
    assertSameOrigin(request);
    const config = requireOtpRuntimeConfig(authRuntimeConfig());
    const body = await readAuthJson(request);
    const email = normalizeAuthEmail(body.email);
    const code = normalizeOtpCode(body.otp);
    const inviteToken =
      body.inviteToken === undefined || body.inviteToken === ""
        ? null
        : normalizeOpaqueInput(body.inviteToken, "邀请链接", 512);

    await enforceAuthRateLimits({
      request,
      email,
      action: "otp_verify",
      limit: 10,
      windowSeconds: OTP_WINDOW_SECONDS,
      abuseHashSecret: config.abuseHashSecret,
    });
    const verified = await verifySupabaseEmailOtp(
      { email, code },
      {
        config: {
          url: config.supabaseUrl,
          publishableKey: config.supabasePublishableKey,
        },
      },
    );
    if (verified.email !== email) {
      return authJson(
        { error: "验证码验证的邮箱与请求邮箱不一致。" },
        { status: 401 },
        requestId,
      );
    }

    const claims: IdentityClaims = {
      provider: "supabase_email",
      subject: verified.subject,
      email,
      emailVerified: true,
      displayName: email.split("@", 1)[0] || email,
      fullName: null,
    };
    let user = await resolveIdentityClaims(claims);
    if (!user) {
      if (!inviteToken) {
        throw new AppError("需要有效邀请才能首次登录。", 403);
      }
      user = await acceptEmailInvitation({
        claims,
        inviteTokenDigest: await inviteTokenDigest(
          inviteToken,
          config.sessionTokenPepper,
        ),
      });
    }

    const token = newSessionToken();
    const digest = await sessionTokenDigest(
      token,
      config.sessionTokenPepper,
    );
    await createAppSession({
      userId: user.id,
      tokenDigest: digest,
      expiresAt: new Date(
        Date.now() + APP_SESSION_MAX_AGE_SECONDS * 1_000,
      ).toISOString(),
      maxActiveSessions: 5,
    });

    return authJson(
      {
        authenticated: true,
        user: { ...user, authProvider: "supabase_email" },
      },
      { headers: { "Set-Cookie": sessionCookie(token) } },
      requestId,
    );
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}
