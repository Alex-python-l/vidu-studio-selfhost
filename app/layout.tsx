import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { PreferencesProvider } from "@/app/PreferencesProvider";
import {
  appLanguage,
  appTheme,
  LANGUAGE_COOKIE,
  THEME_COOKIE,
} from "@/lib/preferences";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const language = appLanguage(cookieStore.get(LANGUAGE_COOKIE)?.value);
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";

  return {
    metadataBase: new URL(origin),
    title: {
      default: language === "zh" ? "Vidu 创作台" : "Vidu Studio",
      template:
        language === "zh" ? "%s | Vidu 创作台" : "%s | Vidu Studio",
    },
    description:
      language === "zh"
        ? "使用参考图片、视频与动作素材生成内容，并在一个工作台管理所有任务和结果。"
        : "Create videos from reference images and motion footage, then manage every task and result in one studio.",
    openGraph: {
      title: language === "zh" ? "Vidu 创作台" : "Vidu Studio",
      description:
        language === "zh"
          ? "从参考素材出发，持续生成和管理视频。"
          : "Create and manage videos from reference media.",
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1731,
          height: 909,
          alt:
            language === "zh"
              ? "Vidu 创作台视频创作界面"
              : "Vidu Studio video creation interface",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: language === "zh" ? "Vidu 创作台" : "Vidu Studio",
      description:
        language === "zh"
          ? "从参考素材出发，持续生成和管理视频。"
          : "Create and manage videos from reference media.",
      images: ["/og.png"],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const language = appLanguage(cookieStore.get(LANGUAGE_COOKIE)?.value);
  const theme = appTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <html
      lang={language === "zh" ? "zh-CN" : "en"}
      data-language={language}
      data-theme={theme}
      suppressHydrationWarning
    >
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <PreferencesProvider
          initialLanguage={language}
          initialTheme={theme}
        >
          {children}
        </PreferencesProvider>
      </body>
    </html>
  );
}
