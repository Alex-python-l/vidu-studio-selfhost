import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StudioClient } from "@/app/studio/StudioClient";
import { getAppUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data";
import {
  appLanguage,
  appVideoAnalysisEnabled,
  LANGUAGE_COOKIE,
  VIDEO_ANALYSIS_COOKIE,
} from "@/lib/preferences";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const language = appLanguage(
    (await cookies()).get(LANGUAGE_COOKIE)?.value,
  );

  return {
    title: language === "zh" ? "创作工作台" : "Creation workspace",
    description:
      language === "zh"
        ? "管理 Vidu 视频任务、个人额度与并发创作队列。"
        : "Manage Vidu video tasks, personal credits, and concurrent generation.",
  };
}

export default async function StudioPage({
  searchParams,
}: {
  searchParams?: Promise<{ mode?: string | string[] }>;
}) {
  const requestedMode = (await searchParams)?.mode;
  const initialMode =
    requestedMode === "reference" ||
    requestedMode === "replacement" ||
    requestedMode === "motion"
      ? requestedMode
      : "replacement";
  const initialVideoAnalysisEnabled = appVideoAnalysisEnabled(
    (await cookies()).get(VIDEO_ANALYSIS_COOKIE)?.value,
  );
  const profile = await getAppUser();
  if (!profile) {
    redirect(`/login?returnTo=${encodeURIComponent(`/studio?mode=${initialMode}`)}`);
  }
  const dashboard = await getDashboardData(profile);

  return (
    <StudioClient
      initialDashboard={dashboard}
      initialMode={initialMode}
      initialVideoAnalysisEnabled={initialVideoAnalysisEnabled}
      canAccessAdmin={profile.role === "admin" || profile.role === "support"}
    />
  );
}
