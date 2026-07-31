import { AppError } from "@/lib/errors";

export const APP_SESSION_COOKIE = "vidu-session";
export const APP_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_SESSION_TOKEN_LENGTH = 128;
const encoder = new TextEncoder();

export type AuthRuntimeConfig = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  turnstileSecretKey?: string;
  sessionTokenPepper?: string;
  abuseHashSecret?: string;
};

export function requireOtpRuntimeConfig(config: AuthRuntimeConfig) {
  const missing: string[] = [];
  if (!config.supabaseUrl?.trim()) missing.push("SUPABASE_URL");
  if (!config.supabasePublishableKey?.trim()) {
    missing.push("SUPABASE_PUBLISHABLE_KEY");
  }
  if (!config.turnstileSecretKey?.trim()) {
    missing.push("TURNSTILE_SECRET_KEY");
  }
  if (!config.sessionTokenPepper?.trim()) {
    missing.push("SESSION_TOKEN_PEPPER");
  }
  if (!config.abuseHashSecret?.trim()) missing.push("ABUSE_HASH_SECRET");
  if (missing.length) {
    throw new AuthConfigurationError(missing);
  }

  return {
    supabaseUrl: config.supabaseUrl!.trim(),
    supabasePublishableKey: config.supabasePublishableKey!.trim(),
    turnstileSecretKey: config.turnstileSecretKey!.trim(),
    sessionTokenPepper: config.sessionTokenPepper!.trim(),
    abuseHashSecret: config.abuseHashSecret!.trim(),
  };
}

export function requireCodeRuntimeConfig(config: AuthRuntimeConfig) {
  const missing: string[] = [];
  if (!config.sessionTokenPepper?.trim()) {
    missing.push("SESSION_TOKEN_PEPPER");
  }
  if (!config.abuseHashSecret?.trim()) missing.push("ABUSE_HASH_SECRET");
  if (missing.length) {
    throw new AuthConfigurationError(missing);
  }
  return {
    sessionTokenPepper: config.sessionTokenPepper!.trim(),
    abuseHashSecret: config.abuseHashSecret!.trim(),
  };
}

export function requireInvitationSigningConfig(config: AuthRuntimeConfig) {
  if (!config.sessionTokenPepper?.trim()) {
    throw new AuthConfigurationError(["SESSION_TOKEN_PEPPER"]);
  }
  return { sessionTokenPepper: config.sessionTokenPepper.trim() };
}

export class AuthConfigurationError extends AppError {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(`登录暂不可用：缺少 ${missing.join("、")} 配置。`, 503);
    this.name = "AuthConfigurationError";
    this.missing = missing;
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  let expectedOrigin: string;
  try {
    const url = new URL(request.url);
    const forwardedHost = firstForwarded(request.headers.get("x-forwarded-host"));
    const forwardedProto = firstForwarded(
      request.headers.get("x-forwarded-proto"),
    );
    if (forwardedProto && forwardedProto !== "http" && forwardedProto !== "https") {
      throw new TypeError("Invalid forwarded protocol");
    }
    expectedOrigin = forwardedHost
      ? new URL(`${forwardedProto ?? url.protocol.slice(0, -1)}://${forwardedHost}`)
          .origin
      : url.origin;
  } catch {
    throw new AppError("请求地址无效。", 400);
  }

  if (!origin || origin !== expectedOrigin) {
    throw new AppError("请求来源校验失败。", 403);
  }
}

function firstForwarded(value: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

export function normalizeAuthEmail(value: unknown): string {
  if (typeof value !== "string") throw new AppError("邮箱格式无效。", 400);
  const email = value.trim().toLowerCase();
  if (
    !email ||
    email.length > 254 ||
    /[\u0000-\u001f\u007f\s]/.test(email) ||
    !/^[^@]+@[^@]+\.[^@]+$/.test(email)
  ) {
    throw new AppError("邮箱格式无效。", 400);
  }
  return email;
}

export function normalizeOpaqueInput(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new AppError(`${label}无效。`, 400);
  }
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new AppError(`${label}无效。`, 400);
  }
  return normalized;
}

export function normalizeOtpCode(value: unknown): string {
  const code = normalizeOpaqueInput(value, "验证码", 12);
  if (!/^\d{6}$/.test(code)) {
    throw new AppError("验证码格式无效。", 400);
  }
  return code;
}

export function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

export async function sessionTokenDigest(
  token: string,
  pepper: string,
): Promise<string> {
  const normalized = normalizeSessionToken(token);
  return hmacSha256Hex(pepper, `session:v1:${normalized}`);
}

export async function inviteTokenDigest(
  token: string,
  pepper: string,
): Promise<string> {
  const normalized = normalizeOpaqueInput(token, "邀请链接", 512);
  return hmacSha256Hex(pepper, `invite:v1:${normalized}`);
}

export async function registrationCodeDigest(
  code: string,
  pepper: string,
): Promise<string> {
  const normalized = normalizeOpaqueInput(code, "访问口令", 64).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{5,63}$/.test(normalized)) {
    throw new AppError("访问口令格式无效。", 400);
  }
  return hmacSha256Hex(pepper, `registration-code:v1:${normalized}`);
}

export async function abuseBucketDigest(
  value: string,
  secret: string,
): Promise<string> {
  return hmacSha256Hex(secret, `abuse:v1:${value}`);
}

export function sessionCookie(token: string): string {
  return [
    `${APP_SESSION_COOKIE}=${encodeURIComponent(normalizeSessionToken(token))}`,
    "Path=/",
    `Max-Age=${APP_SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function clearedSessionCookie(): string {
  return [
    `${APP_SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function safeRequestId(value: string | null): string {
  if (
    value &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    return value;
  }
  return crypto.randomUUID();
}

export function clientIp(request: Request): string {
  const value = request.headers.get("cf-connecting-ip")?.trim();
  if (!value || value.length > 64 || /[\u0000-\u0020\u007f]/.test(value)) {
    return "unknown";
  }
  return value;
}

export function sessionTokenFromCookieHeader(
  cookieHeader: string | null,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== APP_SESSION_COOKIE) continue;
    try {
      return normalizeSessionToken(
        decodeURIComponent(part.slice(separator + 1).trim()),
      );
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeSessionToken(token: string): string {
  const normalized = token.trim();
  if (
    !normalized ||
    normalized.length > MAX_SESSION_TOKEN_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    throw new AppError("会话无效。", 401);
  }
  return normalized;
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  if (!secret.trim()) throw new AuthConfigurationError(["HMAC secret"]);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
