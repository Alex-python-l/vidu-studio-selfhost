import { runtimeEnv as env } from "@/lib/runtime-env";
import { cookies } from "next/headers";
import {
  bootstrapAdminByEmail,
  findUserBySessionDigest,
} from "@/lib/account-data";
import type {
  AppUserProfile,
  AuthProvider,
} from "@/lib/account-contracts";
import {
  APP_SESSION_COOKIE,
  type AuthRuntimeConfig,
  sessionTokenDigest,
} from "@/lib/session-security";
import { AppError } from "@/lib/errors";

type RuntimeEnv = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  SESSION_TOKEN_PEPPER?: string;
  ABUSE_HASH_SECRET?: string;
  ADMIN_EMAILS?: string;
};

const LOCAL_USER: AppUserProfile = {
  id: "local@vidu-studio.test",
  displayName: "本地创作者",
  email: "local@vidu-studio.test",
  fullName: "本地创作者",
  role: "admin",
  status: "active",
  authProvider: "supabase_email",
};

export function authRuntimeConfig(): AuthRuntimeConfig {
  const runtimeEnv = env as unknown as RuntimeEnv;
  return {
    supabaseUrl:
      runtimeEnv.SUPABASE_URL?.trim() ?? process.env.SUPABASE_URL?.trim(),
    supabasePublishableKey:
      runtimeEnv.SUPABASE_PUBLISHABLE_KEY?.trim() ??
      process.env.SUPABASE_PUBLISHABLE_KEY?.trim(),
    turnstileSecretKey:
      runtimeEnv.TURNSTILE_SECRET_KEY?.trim() ??
      process.env.TURNSTILE_SECRET_KEY?.trim(),
    sessionTokenPepper:
      runtimeEnv.SESSION_TOKEN_PEPPER?.trim() ??
      process.env.SESSION_TOKEN_PEPPER?.trim(),
    abuseHashSecret:
      runtimeEnv.ABUSE_HASH_SECRET?.trim() ??
      process.env.ABUSE_HASH_SECRET?.trim(),
  };
}

export async function getAppUser(): Promise<AppUserProfile | null> {
  const sessionToken = (await cookies()).get(APP_SESSION_COOKIE)?.value;
  const pepper = authRuntimeConfig().sessionTokenPepper;
  if (sessionToken && pepper) {
    try {
      const digest = await sessionTokenDigest(sessionToken, pepper);
      const profile = await findUserBySessionDigest(digest);
      if (profile) {
        return maybeBootstrapAdmin(withProvider(profile, "supabase_email"));
      }
    } catch (error) {
      if (!(error instanceof ApiAuthError) && !isInvalidSessionError(error)) {
        throw error;
      }
    }
  }

  return process.env.NODE_ENV === "development" ? LOCAL_USER : null;
}

export async function requireApiUser(): Promise<AppUserProfile> {
  const user = await getAppUser();
  if (!user) throw new ApiAuthError();
  if (user.status !== "active") {
    throw new ApiAuthError("账号已暂停使用。", 403);
  }
  return user;
}

export async function requireAdminUser(
  options: { write?: boolean } = {},
): Promise<AppUserProfile> {
  const user = await requireApiUser();
  const allowed = options.write
    ? user.role === "admin"
    : user.role === "admin" || user.role === "support";
  if (!allowed) {
    throw new ApiAuthError("没有管理员权限。", 403);
  }
  return user;
}

export class ApiAuthError extends AppError {
  constructor(
    message = "请先登录后再继续。",
    status = 401,
  ) {
    super(message, status);
    this.name = "ApiAuthError";
  }
}

function withProvider(
  profile: AppUserProfile,
  authProvider: AuthProvider,
): AppUserProfile {
  return { ...profile, authProvider };
}

async function maybeBootstrapAdmin(
  profile: AppUserProfile,
): Promise<AppUserProfile> {
  if (
    profile.role === "admin" ||
    profile.status !== "active" ||
    !adminBootstrapEmails().has(profile.email)
  ) {
    return profile;
  }
  return (await bootstrapAdminByEmail(profile.email))
    ? { ...profile, role: "admin" }
    : profile;
}

function adminBootstrapEmails() {
  const runtimeEnv = env as unknown as RuntimeEnv;
  const value =
    runtimeEnv.ADMIN_EMAILS?.trim() ?? process.env.ADMIN_EMAILS?.trim() ?? "";
  return new Set(
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isInvalidSessionError(error: unknown) {
  return (
    error instanceof Error &&
    "status" in error &&
    (error as Error & { status?: unknown }).status === 401
  );
}
