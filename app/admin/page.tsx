import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminClient } from "@/app/admin/AdminClient";
import { getAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "运营管理",
  description: "管理 Vidu 创作台邀请、用户额度和访问状态。",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const viewer = await getAppUser();
  if (!viewer) {
    redirect("/login?returnTo=%2Fadmin");
  }
  if (
    viewer.status !== "active" ||
    (viewer.role !== "admin" && viewer.role !== "support")
  ) {
    notFound();
  }
  return <AdminClient viewer={viewer} />;
}
