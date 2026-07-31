export type AppLanguage = "zh" | "en";
export type AppTheme = "dark" | "light";

export const LANGUAGE_COOKIE = "vidu-language";
export const THEME_COOKIE = "vidu-theme";
export const VIDEO_ANALYSIS_COOKIE = "vidu-video-analysis";

export function appLanguage(value: string | undefined): AppLanguage {
  return value === "zh" ? "zh" : "en";
}

export function appTheme(value: string | undefined): AppTheme {
  return value === "light" ? "light" : "dark";
}

export function appVideoAnalysisEnabled(value: string | undefined) {
  return value !== "disabled";
}

export function localeText(
  language: AppLanguage,
  chinese: string,
  english: string,
) {
  return language === "zh" ? chinese : english;
}
