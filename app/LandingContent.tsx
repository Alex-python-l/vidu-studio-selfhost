"use client";

import Link from "next/link";
import { Play, Video } from "reicon-react";
import {
  PreferencesControls,
  usePreferences,
} from "@/app/PreferencesProvider";
import { AmbientBackdrop } from "@/app/components/AmbientBackdrop";
import BorderGlow from "@/app/components/BorderGlow";
import { FeatureTutorialDialog } from "@/app/components/FeatureTutorialDialog";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/app/components/ui/Card";
import {
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@/app/components/ui/Tabs";
import { SignOutLink } from "@/app/components/SignOutLink";

const COPY = {
  zh: {
    brand: "Vidu 创作台",
    homeLabel: "Vidu 创作台首页",
    navLabel: "主导航",
    modesNav: "创作方式",
    docs: "Vidu 文档",
    signOut: "退出",
    enterStudio: "进入工作台",
    signInStart: "登录开始创作",
    eyebrow: "AI 视频创作工作台",
    headline: "让同一个角色，",
    headlineAccent: "演完下一条视频。",
    lead: "用参考素材生成新镜头、替换原片人物，或把动作迁移到新角色。多个任务可同时生成。",
    continue: "继续创作",
    signIn: "登录开始创作",
    viewModes: "查看创作模式",
    heroAlt: "参考素材与动作视频驱动的视频创作流程",
    heroCaption: "素材输入、任务队列与结果工作台",
    proofLabel: "产品能力",
    referenceProof: "参考生成",
    replacementProof: "人物替换",
    motionProof: "动作迁移",
    modesTitle: "选择素材，直接开始。",
    modesLead: "参考生成以人物替换为主要子模式，并保留自由参考创作；任务提交后可继续准备下一条。",
    flowLabel: "素材流程",
    enter: "进入",
    ctaTitle: "把下一条视频放进队列。",
    ctaBody: "上传素材、创建任务，随后在同一个工作台查看生成进度和结果。",
    openStudio: "打开创作台",
    modes: [
      {
        id: "reference",
        meta: "Video Replacement + 自由参考 · Q2 Pro",
        title: "参考生成",
        body: "默认进入人物替换，用参考图改变原片人物；也可以切换到自由参考生成，组合多张图片、视频与提示词创作新镜头。",
        inputs: ["人物或主体图片", "原片或参考视频"],
        output: "人物替换或一致主体的新镜头",
      },
      {
        id: "motion",
        meta: "Motion Sync",
        title: "动作迁移",
        body: "组合角色图片与动作视频，让同一个角色自然复现舞蹈、表演和肢体动作。",
        inputs: ["角色图片", "动作视频"],
        output: "同步动作的新成片",
      },
    ],
  },
  en: {
    brand: "Vidu Studio",
    homeLabel: "Vidu Studio home",
    navLabel: "Main navigation",
    modesNav: "Workflows",
    docs: "Vidu Docs",
    signOut: "Sign out",
    enterStudio: "Enter studio",
    signInStart: "Sign in to create",
    eyebrow: "AI VIDEO CREATION STUDIO",
    headline: "Keep one character,",
    headlineAccent: "create the next video.",
    lead: "Generate new shots from references, replace a person in existing footage, or transfer motion to a new character. Run multiple tasks in parallel.",
    continue: "Continue creating",
    signIn: "Sign in to create",
    viewModes: "View creation workflows",
    heroAlt: "Video creation workflow driven by reference media and motion footage",
    heroCaption: "Media inputs, task queue, and results in one workspace",
    proofLabel: "Product capabilities",
    referenceProof: "Reference generation",
    replacementProof: "Character replacement",
    motionProof: "Motion transfer",
    modesTitle: "Choose your media and start.",
    modesLead: "Reference generation opens with person replacement as its primary mode while keeping free-form reference creation available.",
    flowLabel: "media flow",
    enter: "Open ",
    ctaTitle: "Put the next video in the queue.",
    ctaBody: "Upload media, create tasks, and review generation progress and results in one workspace.",
    openStudio: "Open studio",
    modes: [
      {
        id: "reference",
        meta: "Video Replacement + Free reference · Q2 Pro",
        title: "Reference generation",
        body: "Start with person replacement to change the subject in source footage, or switch to free reference generation with multiple images, videos, and a prompt.",
        inputs: ["Person or subject image", "Source or reference video"],
        output: "A replacement or a new consistent shot",
      },
      {
        id: "motion",
        meta: "Motion Sync",
        title: "Motion",
        body: "Combine a character image with a motion video so the same character naturally follows the performance and body movement.",
        inputs: ["Character image", "Motion video"],
        output: "A new motion-matched video",
      },
    ],
  },
} as const;

export function LandingContent({
  isSignedIn,
  studioHref,
  replacementHref,
  motionHref,
}: {
  isSignedIn: boolean;
  studioHref: string;
  replacementHref: string;
  motionHref: string;
}) {
  const { language } = usePreferences();
  const copy = COPY[language];

  return (
    <main className="landing-shell">
      <AmbientBackdrop variant="landing" />

      <header className="landing-nav">
        <Link className="brand-lockup" href="/" aria-label={copy.homeLabel}>
          <span className="brand-mark" aria-hidden="true">
            <Video size={19} color="currentColor" />
          </span>
          <span>{copy.brand}</span>
        </Link>
        <nav aria-label={copy.navLabel}>
          <a href="#modes">{copy.modesNav}</a>
          <FeatureTutorialDialog
            triggerClassName="landing-tutorial-trigger"
            triggerVariant="ghost"
            destinationByMode={{
              replacement: replacementHref,
              motion: motionHref,
            }}
          />
          <a
            href="https://platform.vidu.com/docs/introduction"
            target="_blank"
            rel="noreferrer"
          >
            {copy.docs}
          </a>
          {isSignedIn ? (
            <SignOutLink>{copy.signOut}</SignOutLink>
          ) : null}
          <PreferencesControls compact />
          <a className="nav-cta" href={studioHref}>
            {isSignedIn ? copy.enterStudio : copy.signInStart}
          </a>
        </nav>
      </header>

      <section className="product-hero">
        <div className="hero-copy">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>
            {copy.headline}
            <span>{copy.headlineAccent}</span>
          </h1>
          <p className="hero-lead">{copy.lead}</p>
          <div className="hero-actions">
            <a className="primary-button" href={studioHref}>
              <Play size={18} color="currentColor" />
              {isSignedIn ? copy.continue : copy.signIn}
            </a>
            <a className="text-link" href="#modes">
              {copy.viewModes}
            </a>
          </div>
        </div>

        <figure className="hero-product-visual">
          <BorderGlow
            className="hero-border-glow"
            backgroundColor="var(--surface)"
            borderRadius={14}
            glowRadius={30}
            glowIntensity={0.46}
            edgeSensitivity={22}
            coneSpread={18}
            colors={["#d8ff5e", "#b6e95b", "#efffc2"]}
            glowColor="76 100 68"
            fillOpacity={0.14}
            animated
          >
            <div className="hero-product-frame">
              {/* vinext's image optimizer is not stable in every Sites runtime. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero-workflows.png"
                alt={copy.heroAlt}
                width={1672}
                height={941}
                decoding="async"
                fetchPriority="high"
              />
            </div>
          </BorderGlow>
          <figcaption>{copy.heroCaption}</figcaption>
        </figure>
      </section>

      <section className="product-proof" aria-label={copy.proofLabel}>
        <span>
          <strong>1-10s</strong>
          {copy.referenceProof}
        </span>
        <span>
          <strong>2-9.9s</strong>
          {copy.replacementProof}
        </span>
        <span>
          <strong>2-30s</strong>
          {copy.motionProof}
        </span>
      </section>

      <section className="mode-section" id="modes">
        <div className="mode-heading">
          <h2>{copy.modesTitle}</h2>
          <p>{copy.modesLead}</p>
        </div>

        <Tabs
          className="landing-workflow-tabs"
          defaultValue="reference"
        >
          <TabsList
            className="landing-workflow-list"
            aria-label={copy.modesNav}
          >
            {copy.modes.map((mode) => (
              <TabsTab value={mode.id} key={mode.id}>
                <strong>{mode.title}</strong>
                <span>{mode.meta}</span>
              </TabsTab>
            ))}
          </TabsList>

          {copy.modes.map((mode) => (
            <TabsPanel value={mode.id} key={mode.id}>
              <Card className="workflow-panel" render={<article />}>
                <CardHeader className="workflow-panel-copy">
                  <span>{mode.meta}</span>
                  <CardTitle render={<h3 />}>{mode.title}</CardTitle>
                  <CardDescription render={<p />}>
                    {mode.body}
                  </CardDescription>
                </CardHeader>
                <CardPanel
                  className="workflow-route"
                  aria-label={`${mode.title} ${copy.flowLabel}`}
                >
                  <span>{copy.flowLabel}</span>
                  <div>
                    {mode.inputs.map((input) => (
                      <strong key={input}>{input}</strong>
                    ))}
                    <i aria-hidden="true">→</i>
                    <b>{mode.output}</b>
                  </div>
                </CardPanel>
                <CardFooter className="workflow-panel-footer">
                  <a
                    className="workflow-open"
                    href={mode.id === "motion" ? motionHref : replacementHref}
                  >
                    {copy.enter}
                    {mode.title}
                    <span aria-hidden="true">→</span>
                  </a>
                </CardFooter>
              </Card>
            </TabsPanel>
          ))}
        </Tabs>
      </section>

      <Card className="product-cta" render={<section />}>
        <CardHeader>
          <CardTitle render={<h2 />}>{copy.ctaTitle}</CardTitle>
          <CardDescription render={<p />}>{copy.ctaBody}</CardDescription>
        </CardHeader>
        <CardFooter>
          <a className="primary-button" href={studioHref}>
            <Play size={18} color="currentColor" />
            {copy.openStudio}
          </a>
        </CardFooter>
      </Card>

      <footer className="landing-footer">
        <span>{copy.brand}</span>
        <span>Powered by Vidu</span>
      </footer>
    </main>
  );
}
