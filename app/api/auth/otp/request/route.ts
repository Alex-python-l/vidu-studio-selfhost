import { canRequestEmailOtp } from "@/lib/account-data";
import { authRuntimeConfig } from "@/lib/auth";
import {
  assertSameOrigin,
  inviteTokenDigest,
  normalizeAuthEmail,
  normalizeOpaqueInput,
  requireOtpRuntimeConfig,
} from "@/lib/session-security";
import {
  requestSupabaseEmailOtp,
  SupabaseAuthError,
} from "@/lib/supabase-auth";
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
    const inviteToken =
      body.inviteToken === undefined || body.inviteToken === ""
        ? null
        : normalizeOpaqueInput(body.inviteToken, "邀请链接", 512);
    const turnstileToken = normalizeOpaqueInput(
      body.turnstileToken,
      "人机验证",
      2_048,
    );

    // Supabase must verify this token itself. Turnstile tokens are single-use,
    // so verifying it here first would make the upstream CAPTCHA check fail.
    const releaseRateLimits = await enforceAuthRateLimits({
      request,
      email,
      action: "otp_request",
      limit: 3,
      windowSeconds: OTP_WINDOW_SECONDS,
      abuseHashSecret: config.abuseHashSecret,
    });
    const maySend = await canRequestEmailOtp({
      email,
      inviteTokenDigest: inviteToken
        ? await inviteTokenDigest(inviteToken, config.sessionTokenPepper)
        : undefined,
    });
    if (!maySend) {
      return acceptedResponse(requestId);
    }
    try {
      await requestSupabaseEmailOtp(
        { email, captchaToken: turnstileToken },
        {
          config: {
            url: config.supabaseUrl,
            publishableKey: config.supabasePublishableKey,
          },
        },
      );
    } catch (error) {
      if (!(error instanceof SupabaseAuthError)) throw error;
      await releaseRateLimits();
      console.warn("supabase_otp_request_failed", { code: error.code });
    }

    return acceptedResponse(requestId);
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}

function acceptedResponse(requestId: string) {
  return authJson(
    { message: "如果账号可用，验证码邮件将很快送达。" },
    { status: 202 },
    requestId,
  );
}
