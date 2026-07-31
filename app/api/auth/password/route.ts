import {
  createAppSession,
  findPasswordCredentialByEmail,
} from "@/lib/account-data";
import { authRuntimeConfig } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import {
  PASSWORD_ALGORITHM,
  normalizePassword,
  verifyPassword,
  type PasswordCredential,
} from "@/lib/password-security";
import {
  APP_SESSION_MAX_AGE_SECONDS,
  assertSameOrigin,
  newSessionToken,
  normalizeAuthEmail,
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

const PASSWORD_WINDOW_SECONDS = 15 * 60;
const DUMMY_CREDENTIAL: PasswordCredential = {
  algorithm: PASSWORD_ALGORITHM,
  iterations: 600_000,
  salt: "7e770f6484873c0d6c3d14a4f997300f",
  passwordHash:
    "e6eced1153b93052e81e41baae898f5de7ed9a7f7b31b9953ee8c94211371a0d",
};

export async function POST(request: Request) {
  const requestId = authRequestId(request);
  try {
    assertSameOrigin(request);
    const config = requireCodeRuntimeConfig(authRuntimeConfig());
    const body = await readAuthJson(request);
    const email = normalizeAuthEmail(body.email);
    const password = normalizePassword(body.password);

    await enforceAuthRateLimits({
      request,
      email,
      action: "password_login",
      limit: 5,
      windowSeconds: PASSWORD_WINDOW_SECONDS,
      abuseHashSecret: config.abuseHashSecret,
    });

    const record = await findPasswordCredentialByEmail(email);
    const valid = await verifyPassword(
      password,
      record?.credential ?? DUMMY_CREDENTIAL,
    );
    if (!record || !valid || record.user.status !== "active") {
      throw new AppError("邮箱或密码错误。", 401);
    }

    const token = newSessionToken();
    await createAppSession({
      userId: record.user.id,
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
      { authenticated: true, user: record.user },
      { headers: { "Set-Cookie": sessionCookie(token) } },
      requestId,
    );
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}
