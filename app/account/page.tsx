import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountClient } from "@/app/account/AccountClient";
import { getAccountOverview } from "@/lib/account-data";
import { getAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "账户与额度 | Vidu 创作台",
  description: "查看个人额度账本并管理登录密码。",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const viewer = await getAppUser();
  if (!viewer) {
    redirect("/login?returnTo=%2Faccount");
  }

  const account = await getAccountOverview(viewer.id);
  return <AccountClient initialAccount={account} />;
}