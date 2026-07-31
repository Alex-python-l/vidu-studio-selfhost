"use client";

import { Globe, Moon, Sun } from "reicon-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  type AppLanguage,
  type AppTheme,
  LANGUAGE_COOKIE,
  localeText,
  THEME_COOKIE,
} from "@/lib/preferences";

type PreferencesContextValue = {
  language: AppLanguage;
  theme: AppTheme;
  setLanguage: (language: AppLanguage) => void;
  setTheme: (theme: AppTheme) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function writePreference(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

export function PreferencesProvider({
  children,
  initialLanguage,
  initialTheme,
}: {
  children: ReactNode;
  initialLanguage: AppLanguage;
  initialTheme: AppTheme;
}) {
  const [language, setLanguageState] = useState(initialLanguage);
  const [theme, setThemeState] = useState(initialTheme);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    document.documentElement.lang = nextLanguage === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.language = nextLanguage;
    writePreference(LANGUAGE_COOKIE, nextLanguage);
  }, []);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    setThemeState(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    writePreference(THEME_COOKIE, nextTheme);
  }, []);

  const value = useMemo(
    () => ({ language, theme, setLanguage, setTheme }),
    [language, setLanguage, setTheme, theme],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences must be used inside PreferencesProvider.");
  }
  return context;
}

export function PreferencesControls({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { language, setLanguage, setTheme, theme } = usePreferences();
  const isChinese = language === "zh";
  const isDark = theme === "dark";

  return (
    <div
      className={`preference-controls ${compact ? "is-compact" : ""}`}
      role="group"
      aria-label={localeText(language, "显示设置", "Display settings")}
    >
      <button
        type="button"
        className="preference-button"
        aria-label={localeText(
          language,
          isDark ? "切换到日间模式" : "切换到夜间模式",
          isDark ? "Switch to light mode" : "Switch to dark mode",
        )}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        {isDark ? (
          <Moon size={18} color="currentColor" />
        ) : (
          <Sun size={18} color="currentColor" />
        )}
        <span>
          {localeText(
            language,
            isDark ? "夜间" : "日间",
            isDark ? "Dark" : "Light",
          )}
        </span>
      </button>
      <button
        type="button"
        className="preference-button is-language"
        aria-label={localeText(
          language,
          "切换到英文",
          "Switch to Chinese",
        )}
        onClick={() => setLanguage(isChinese ? "en" : "zh")}
      >
        <Globe size={18} color="currentColor" />
        <span>{isChinese ? "English" : "中文"}</span>
      </button>
    </div>
  );
}
