import {
  consumeRateLimit,
  releaseRateLimit,
} from "@/lib/account-data";
import { AppError, publicErrorDetails } from "@/lib/errors";
import {
  abuseBucketDigest,
  clientIp,
  safeRequestId,
} from "@/lib/session-security";

const MAX_AUTH_BODY_BYTES = 8_192;

export async function readAuthJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_AUTH_BODY_BYTES
  ) {
    throw new AppError("请求内容过大。", 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError("请求内容必须是 JSON。", 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.getPrototypeOf(body) !== Object.prototype
  ) {
    throw new AppError("请求内容无效。", 400);
  }
  return body as Record<string, unknown>;
}

export async function enforceAuthRateLimits(input: {
  request: Request;
  email: string;
  action:
    | "otp_request"
    | "otp_verify"
    | "code_redeem"
    | "password_login"
    | "password_change";
  limit: number;
  windowSeconds: number;
  abuseHashSecret: string;
}) {
  const [emailDigest, ipDigest] = await Promise.all([
    abuseBucketDigest(`email:${input.email}`, input.abuseHashSecret),
    abuseBucketDigest(`ip:${clientIp(input.request)}`, input.abuseHashSecret),
  ]);
  const ipResult = await consumeRateLimit({
    scope: input.action,
    keyDigest: ipDigest,
    limit: input.limit,
    windowSeconds: input.windowSeconds,
  });
  if (!ipResult.allowed) {
    throw new AuthRateLimitError(ipResult.retryAfterSeconds);
  }
  const emailResult = await consumeRateLimit({
    scope: input.action,
    keyDigest: emailDigest,
    limit: input.limit,
    windowSeconds: input.windowSeconds,
  });
  if (!emailResult.allowed) {
    await releaseRateLimit({
      scope: input.action,
      keyDigest: ipDigest,
      windowStart: ipResult.windowStart,
    });
    throw new AuthRateLimitError(emailResult.retryAfterSeconds);
  }
  return async () => {
    await Promise.all([
      releaseRateLimit({
        scope: input.action,
        keyDigest: ipDigest,
        windowStart: ipResult.windowStart,
      }),
      releaseRateLimit({
        scope: input.action,
        keyDigest: emailDigest,
        windowStart: emailResult.windowStart,
      }),
    ]);
  };
}

export class AuthRateLimitError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    super("请求过于频繁，请稍后重试。", 429);
    this.name = "AuthRateLimitError";
  }
}

export function authJson(
  body: unknown,
  init: ResponseInit = {},
  requestId?: string,
) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  if (requestId) headers.set("X-Request-Id", requestId);
  return Response.json(body, { ...init, headers });
}

export function authErrorResponse(error: unknown, requestId?: string) {
  const { status, message } = publicErrorDetails(error);
  const response = Response.json({ error: message }, { status });
  if (!(error instanceof AppError)) {
    console.error("auth_internal_error", {
      requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  if (requestId) headers.set("X-Request-Id", requestId);
  if (error instanceof AuthRateLimitError) {
    headers.set("Retry-After", String(error.retryAfterSeconds));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function authRequestId(request: Request) {
  return safeRequestId(request.headers.get("x-request-id"));
}
