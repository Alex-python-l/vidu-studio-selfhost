import type { Metadata } from "next";
import { InviteBridge } from "@/app/invite/[token]/InviteBridge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "接受邀请",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const token = safeDecode((await params).token);
  const safeToken =
    token.length >= 32 &&
    token.length <= 512 &&
    /^[a-zA-Z0-9._~-]+$/.test(token)
      ? token
      : "";

  return <InviteBridge token={safeToken} />;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return "";
  }
}
