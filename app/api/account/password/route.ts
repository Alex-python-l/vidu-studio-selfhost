import {
  findPasswordCredentialByEmail,
  setUserPassword,
} from "@/lib/account-data";
import { authRuntimeConfig, requireApiUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import {
  hashPassword,
  normalizePassword,
  verifyPassword,
} from "@/lib/password-security";
import {
  assertSameOrigin,
  requireCodeRuntimeConfig,
  sessionTokenDigest,
  sessionTokenFromCookieHeader,
} from "@/lib/session-security";
import {
  authErrorResponse,
  authJson,
  authRequestId,
  enforceAuthRateLimits,
  readAuthJson,
} from "../../auth/_shared";

export const dynamic = "force-dynamic";
const PASSWORD_CHANGE_WINDOW_SECONDS = 15 * 60;

export async function PUT(request: Request) {
  const requestId = authRequestId(request);
  try {
    assertSameOrigin(request);
    const config = requireCodeRuntimeConfig(authRuntimeConfig());
    const user = await requireApiUser();
    const body = await readAuthJson(request);
    const password = normalizePassword(body.password);
    const existing = await findPasswordCredentialByEmail(user.email);
    if (existing) {
      if (body.currentPassword === undefined || body.currentPassword === "") {
        throw new AppError("请输入当前密码。", 400);
      }
      const currentPassword = normalizePassword(body.currentPassword);
      await enforceAuthRateLimits({
        request,
        email: user.email,
        action: "password_change",
        limit: 5,
        windowSeconds: PASSWORD_CHANGE_WINDOW_SECONDS,
        abuseHashSecret: config.abuseHashSecret,
      });
      if (!(await verifyPassword(currentPassword, existing.credential))) {
        throw new AppError("当前密码错误。", 403);
      }
    }

    const sessionToken = sessionTokenFromCookieHeader(
      request.headers.get("cookie"),
    );
    await setUserPassword({
      actorUserId: user.id,
      targetUserId: user.id,
      credential: await hashPassword(password),
      reason: "用户在账户页更新登录密码",
      requestId,
      preserveSessionDigest: sessionToken
        ? await sessionTokenDigest(sessionToken, config.sessionTokenPepper)
        : undefined,
    });
    return authJson(
      { passwordEnabled: true, requestId },
      {},
      requestId,
    );
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}
