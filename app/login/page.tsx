import { runtimeEnv as env } from "@/lib/runtime-env";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { LoginClient } from "@/app/login/LoginClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "登录",
  description: "使用邮箱密码登录，或通过访问口令注册 Vidu 创作台。",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{
    invite?: string | string[];
    returnTo?: string | string[];
  }>;
}) {
  if (await getAppUser()) {
    redirect("/studio");
  }

  const resolvedSearch = await searchParams;
  const rawInvite = resolvedSearch?.invite;
  const rawReturnTo = resolvedSearch?.returnTo;
  const returnTo = safeReturnTo(
    typeof rawReturnTo === "string" ? rawReturnTo : "/studio",
  );
  const initialInviteToken =
    typeof rawInvite === "string" && rawInvite.length <= 512
      ? rawInvite
      : undefined;
  const runtimeEnv = env as unknown as { TURNSTILE_SITE_KEY?: string };
  const turnstileSiteKey =
    runtimeEnv.TURNSTILE_SITE_KEY?.trim() ??
    process.env.TURNSTILE_SITE_KEY?.trim() ??
    "";

  return (
    <LoginClient
      initialInviteToken={initialInviteToken}
      returnTo={returnTo}
      turnstileSiteKey={turnstileSiteKey}
    />
  );
}

function safeReturnTo(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/studio";
  try {
    const url = new URL(value, "https://vidu.local");
    if (url.origin !== "https://vidu.local") return "/studio";
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/login") ||
      url.pathname.startsWith("/invite/")
    ) {
      return "/studio";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/studio";
  }
}
