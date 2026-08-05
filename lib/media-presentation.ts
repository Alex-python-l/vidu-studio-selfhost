import type { AppLanguage } from "@/lib/preferences";

const STORED_MEDIA_PATH = /^\/api\/media\/[A-Za-z0-9-]+$/;

export function taskMediaThumbnailUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;

  try {
    const parsed = new URL(trimmed, "https://vidu.local");
    if (!STORED_MEDIA_PATH.test(parsed.pathname)) return value;
    return `${parsed.pathname}?variant=thumbnail`;
  } catch {
    return value;
  }
}

export function formatStudioTaskDate(
  value: string,
  language: AppLanguage,
): string {
  return new Date(value).toLocaleString(language === "zh" ? "zh-CN" : "en-US", {
    timeZone: "Asia/Shanghai",
  });
}
