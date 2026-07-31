"use client";

import {
  ArrowLeft,
  ArrowRight,
  Help,
  Play,
  Task,
  Video,
  VideoReplace,
} from "reicon-react";
import { useEffect, useState } from "react";
import {
  usePreferences,
} from "@/app/PreferencesProvider";
import { Button } from "@/app/components/ui/Button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/Dialog";
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/app/components/ui/Progress";
import { localeText } from "@/lib/preferences";

export type TutorialMode = "replacement" | "motion";

type TutorialProps = {
  defaultMode?: TutorialMode;
  destinationByMode?: Partial<Record<TutorialMode, string>>;
  onStart?: (mode: TutorialMode) => void;
  triggerClassName?: string;
  triggerVariant?: "ghost" | "outline" | "secondary";
  compactTrigger?: boolean;
  autoOpen?: boolean;
  dismissStorageKey?: string;
  showTrigger?: boolean;
};

type Text = (chinese: string, english: string) => string;

const REPLACEMENT_PROMPT = {
  zh: "基于参考人物生成一张清晰身份参考表：正面脸部特写、45°脸部特写，以及正面、侧面、背面全身视图。所有视图必须是同一人物，保持脸型、五官比例、发型、肤色、服装和身材一致；无遮挡、自然中性表情、均匀光线、纯净背景，不添加文字。",
  en: "Create a clear identity reference sheet from the reference person: a front facial close-up, a 45-degree facial close-up, plus front, side, and back full-body views. Every view must show the same person with consistent facial structure, features, hair, skin tone, outfit, and proportions. Use no occlusion, a neutral expression, even lighting, a clean background, and no text.",
} as const;

const MOTION_PROMPT = {
  zh: "参考这张动作视频首帧，仅保持构图、景别、人物朝向和肢体姿势；将人物替换为［角色描述］。9:16 竖屏，四肢完整可见，背景简洁。",
  en: "Use this motion video's first frame only for composition, shot size, facing direction, and pose. Replace the subject with [character description]. Use 9:16 portrait framing, show the full limbs, and keep the background simple.",
} as const;

function TutorialFigure({
  src,
  alt,
  label,
  className,
}: {
  src: string;
  alt: string;
  label: string;
  className?: string;
}) {
  return (
    <figure className={["tutorial-figure", className].filter(Boolean).join(" ")}>
      {/* vinext's image optimizer is not stable in every Sites runtime. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} decoding="async" />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function PromptCard({
  prompt,
  copied,
  onCopy,
  text,
}: {
  prompt: string;
  copied: boolean;
  onCopy: () => void;
  text: Text;
}) {
  return (
    <aside className="tutorial-prompt-card">
      <div>
        <span>{text("生图提示词", "Image prompt")}</span>
        <Button
          variant="ghost"
          size="xs"
          type="button"
          onClick={onCopy}
        >
          {copied ? text("已复制", "Copied") : text("复制", "Copy")}
        </Button>
      </div>
      <p>{prompt}</p>
    </aside>
  );
}

function ReplacementStep({
  step,
  text,
  copied,
  onCopy,
}: {
  step: number;
  text: Text;
  copied: boolean;
  onCopy: () => void;
}) {
  if (step === 0) {
    return (
      <div className="tutorial-step-layout tutorial-step-layout--logic">
        <div className="tutorial-step-copy">
          <span className="tutorial-kicker">
            {text("底层逻辑", "How it works")}
          </span>
          <h3>
            {text(
              "人物参考锁身份，AI 分析锁现场运动。",
              "References lock identity. AI analysis locks the live action.",
            )}
          </h3>
          <p>
            {text(
              "人物参考图决定新人物是谁。AI 视频分析只提取原片的动作、手与物体接触、遮挡、构图和运镜，不采用原人物外观；两者共同约束生成结果。",
              "Character references decide who the new person is. AI video analysis extracts only motion, hand-object contact, occlusion, composition, and camera movement—not the source person's appearance. Both constraints guide the result.",
            )}
          </p>
        </div>
        <div className="tutorial-logic-flow" aria-label={text("人物替换素材关系", "Character replacement input relationship")}>
          <article>
            <span className="tutorial-logic-icon">
              <Video size={22} color="currentColor" />
            </span>
            <small>{text("原视频", "Source video")}</small>
            <strong>{text("动作 · 接触 · 运镜", "Motion · contact · camera")}</strong>
          </article>
          <span aria-hidden="true">+</span>
          <article>
            <span className="tutorial-logic-icon">
              <VideoReplace size={22} color="currentColor" />
            </span>
            <small>{text("人物参考", "Character reference")}</small>
            <strong>{text("脸部身份 · 发型 · 穿搭", "Facial identity · hair · outfit")}</strong>
          </article>
          <span aria-hidden="true">→</span>
          <article className="is-result">
            <span className="tutorial-logic-icon">
              <Play size={22} color="currentColor" />
            </span>
            <small>{text("生成结果", "Generated result")}</small>
            <strong>{text("身份稳定 · 动作连贯", "Stable identity · continuous action")}</strong>
          </article>
        </div>
        <p className="tutorial-tip">
          {text(
            "保持 AI 视频分析开启：关闭后最容易丢失交互物体、遮挡关系和镜头运动；参考视频里的叠加字幕会被忽略。",
            "Keep AI video analysis on. Turning it off most often loses object interaction, occlusion, and camera movement. Overlaid captions in the reference video are ignored.",
          )}
        </p>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="tutorial-step-layout">
        <div className="tutorial-step-copy">
          <span className="tutorial-kicker">
            {text("参考人物", "Character reference")}
          </span>
          <h3>
            {text(
              "按原片景别准备 1–4 张同一人物。",
              "Prepare 1–4 images of the same person for the source shot.",
            )}
          </h3>
          <p>
            {text(
              "近景原片优先提供清晰、无遮挡、脸部占比较大的正面特写，再补 45° 和接近原片首帧角度的照片；全身原片再增加上半身、全身或三视图。",
              "For close shots, start with a clear, unobstructed frontal close-up where the face is large, then add a 45-degree view and an image close to the source video's first-frame angle. Add upper-body, full-body, or turnaround views for wider shots.",
            )}
          </p>
          <ul className="tutorial-quality-list">
            <li>{text("所有图片必须是同一人物", "Every image must show the same person")}</li>
            <li>{text("第一张优先正面大脸特写", "Use a large frontal close-up first")}</li>
            <li>{text("全身三视图不能替代脸部特写", "A full-body turnaround cannot replace facial close-ups")}</li>
          </ul>
        </div>
        <div className="tutorial-replacement-gallery">
          <TutorialFigure
            src="/tutorial/character-portrait.webp"
            alt={text("户外拍摄的金发人物近景参考", "Close portrait reference of a blonde person outdoors")}
            label={text("1 · 单张人物近景", "1 · Single portrait")}
          />
          <span className="tutorial-gallery-arrow" aria-hidden="true">
            <ArrowRight size={20} color="currentColor" />
          </span>
          <TutorialFigure
            src="/tutorial/character-turnaround.webp"
            alt={text("同一人物的正面侧面背面全身三视图", "Front, side, and back full-body views of the same person")}
            label={text("2 · AI 补成三视图", "2 · Generate a turnaround")}
            className="is-wide"
          />
        </div>
        <PromptCard
          prompt={text(REPLACEMENT_PROMPT.zh, REPLACEMENT_PROMPT.en)}
          copied={copied}
          onCopy={onCopy}
          text={text}
        />
      </div>
    );
  }

  return (
    <div className="tutorial-step-layout tutorial-step-layout--checklist">
      <div className="tutorial-step-copy">
        <span className="tutorial-kicker">
          {text("提交前检查", "Before generating")}
        </span>
        <h3>
          {text(
            "保留分析，用短说明补充目标。",
            "Keep analysis on and identify the target briefly.",
          )}
        </h3>
        <p>
          {text(
            "上传人物参考图和原视频后，等待 AI 视频分析成功再提交。多人画面只需用一句短描述说明替换谁，不要继续堆叠复杂提示词。",
            "Upload the character references and source video, then wait for AI video analysis to finish before generating. For group shots, use one short sentence to identify the target instead of stacking complex prompts.",
          )}
        </p>
      </div>
      <div className="tutorial-check-grid">
        <article>
          <span>01</span>
          <strong>{text("身份参考", "Identity evidence")}</strong>
          <p>{text("1–4 张同一人物，第一张优先正面脸部特写。", "Use 1–4 images of one person, starting with a frontal facial close-up.")}</p>
        </article>
        <article>
          <span>02</span>
          <strong>{text("分析就绪", "Analysis ready")}</strong>
          <p>{text("保持分析开启，锁住接触、遮挡、构图与运镜。", "Keep analysis on to lock contact, occlusion, composition, and camera movement.")}</p>
        </article>
        <article>
          <span>03</span>
          <strong>{text("指定目标", "Name the target")}</strong>
          <p>{text("多人画面说明替换谁，补充提示只写素材特有要求。", "For group shots, name the person to replace and add only source-specific requirements.")}</p>
        </article>
      </div>
      <p className="tutorial-tip">
        {text(
          "结果更像原人物：补正面大脸特写和接近首帧角度的参考；交互物体或运镜漂移：重新分析后再提交。不要靠追加长提示词补救，实拍镜头感与自然粗糙感会被保留。",
          "If the result resembles the source person, add a large frontal close-up and a reference near the first-frame angle. If object interaction or camera movement drifts, run analysis again before generating. Do not compensate with a long prompt; live-action camera texture and natural imperfections are preserved.",
        )}
      </p>
    </div>
  );
}

function MotionStep({
  step,
  text,
  copied,
  onCopy,
}: {
  step: number;
  text: Text;
  copied: boolean;
  onCopy: () => void;
}) {
  if (step === 0) {
    return (
      <div className="tutorial-step-layout tutorial-motion-intro">
        <div className="tutorial-step-copy">
          <span className="tutorial-kicker">
            {text("动作参考", "Motion reference")}
          </span>
          <h3>
            {text(
              "先选主体和四肢都看得清的视频。",
              "Start with a video where the subject and limbs are clear.",
            )}
          </h3>
          <p>
            {text(
              "动作迁移会读取参考视频中的姿态、节奏和重心变化，再让你提供的角色图片复现这些动作。动作越明确，迁移越可靠。",
              "Motion transfer reads pose, timing, and weight shifts from the reference video, then applies them to the character image. Clearer motion is easier to reproduce.",
            )}
          </p>
          <ul className="tutorial-quality-list">
            <li>{text("主体人物尽量单一", "Prefer one main subject")}</li>
            <li>{text("手臂和腿部完整可见", "Keep arms and legs visible")}</li>
            <li>{text("动作幅度和节奏清楚", "Use readable movement and timing")}</li>
            <li>{text("少遮挡、少切镜、少剧烈运镜", "Avoid occlusion, cuts, and heavy camera shake")}</li>
          </ul>
        </div>
        <figure className="tutorial-video-frame">
          <video
            controls
            muted
            playsInline
            preload="metadata"
            poster="/tutorial/motion-reference-poster.webp"
            src="/tutorial/motion-reference.mp4"
          />
          <figcaption>
            <span>{text("示例动作视频", "Sample motion video")}</span>
            <strong>14s · 9:16</strong>
          </figcaption>
        </figure>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="tutorial-step-layout">
        <div className="tutorial-step-copy">
          <span className="tutorial-kicker">
            {text("首帧匹配", "First-frame match")}
          </span>
          <h3>
            {text(
              "让角色图尽量接近视频首帧。",
              "Match the character image to the video's first frame.",
            )}
          </h3>
          <p>
            {text(
              "构图、景别、人物朝向与初始姿势越接近，角色开始运动时越自然。没有合适图片时，可让生图 AI 参考视频首帧重新生成。",
              "Matching framing, shot size, facing direction, and starting pose makes the first movement more natural. If needed, generate a new image from the video's first frame.",
            )}
          </p>
        </div>
        <div className="tutorial-motion-gallery">
          <TutorialFigure
            src="/tutorial/motion-reference-poster.webp"
            alt={text("竖屏动作视频的首帧", "First frame of the portrait motion video")}
            label={text("动作首帧", "Motion first frame")}
            className="is-source"
          />
          <span className="tutorial-gallery-arrow" aria-hidden="true">
            <ArrowRight size={20} color="currentColor" />
          </span>
          <TutorialFigure
            src="/tutorial/motion-target-2b.webp"
            alt={text("白发角色的竖屏目标图片", "Portrait target image of a white-haired character")}
            label={text("角色图 A", "Character A")}
          />
          <TutorialFigure
            src="/tutorial/motion-target-tifa.webp"
            alt={text("黑发角色的竖屏目标图片", "Portrait target image of a dark-haired character")}
            label={text("角色图 B", "Character B")}
          />
        </div>
        <PromptCard
          prompt={text(MOTION_PROMPT.zh, MOTION_PROMPT.en)}
          copied={copied}
          onCopy={onCopy}
          text={text}
        />
      </div>
    );
  }

  return (
    <div className="tutorial-step-layout tutorial-step-layout--checklist">
      <div className="tutorial-step-copy">
        <span className="tutorial-kicker">
          {text("提交前检查", "Before generating")}
        </span>
        <h3>
          {text(
            "动作视频负责“怎么动”，角色图负责“谁来动”。",
            "The video decides how to move. The image decides who moves.",
          )}
        </h3>
        <p>
          {text(
            "上传一张角色图片和一个动作视频后即可提交。生成前重点检查首帧构图与可见肢体，不需要额外编写长提示词。",
            "Upload one character image and one motion video. Before generating, check first-frame composition and visible limbs; a long prompt is not required.",
          )}
        </p>
      </div>
      <div className="tutorial-check-grid">
        <article>
          <span>01</span>
          <strong>{text("景别接近", "Match shot size")}</strong>
          <p>{text("全身动作优先使用全身角色图。", "Use a full-body image for full-body motion.")}</p>
        </article>
        <article>
          <span>02</span>
          <strong>{text("姿势接近", "Match the pose")}</strong>
          <p>{text("人物朝向和重心尽量贴近首帧。", "Keep facing direction and balance close to frame one.")}</p>
        </article>
        <article>
          <span>03</span>
          <strong>{text("留出空间", "Leave movement room")}</strong>
          <p>{text("手脚不要贴边，避免动作超出画面。", "Keep hands and feet away from the edges.")}</p>
        </article>
      </div>
      <p className="tutorial-tip">
        {text(
          "如果首帧差异很大，先生成一张匹配首帧的角色图，通常比直接反复提交更有效。",
          "If the first frames differ substantially, generating a better-matched character image is usually more effective than repeatedly resubmitting.",
        )}
      </p>
    </div>
  );
}

export function FeatureTutorialDialog({
  defaultMode = "replacement",
  destinationByMode,
  onStart,
  triggerClassName,
  triggerVariant = "outline",
  compactTrigger = false,
  autoOpen = false,
  dismissStorageKey,
  showTrigger = true,
}: TutorialProps) {
  const { language } = usePreferences();
  const text: Text = (chinese, english) =>
    localeText(language, chinese, english);
  const [open, setOpen] = useState(false);
  const [skipAutoOpen, setSkipAutoOpen] = useState(false);
  const [mode, setMode] = useState<TutorialMode>(defaultMode);
  const [step, setStep] = useState(0);
  const [copiedPrompt, setCopiedPrompt] = useState<TutorialMode | null>(null);
  useEffect(() => {
    if (!autoOpen || !dismissStorageKey) return;
    if (window.localStorage.getItem(dismissStorageKey) === "1") return;
    const timer = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [autoOpen, dismissStorageKey]);
  const stepLabels =
    mode === "replacement"
      ? [
          text("理解双锁", "Understand locks"),
          text("准备身份", "Prepare identity"),
          text("检查提交", "Check and generate"),
        ]
      : [
          text("选择动作", "Choose motion"),
          text("匹配首帧", "Match frame one"),
          text("提交生成", "Generate"),
        ];

  function changeMode(nextMode: TutorialMode) {
    setMode(nextMode);
    setStep(0);
    setCopiedPrompt(null);
  }

  async function copyPrompt() {
    const prompt =
      mode === "replacement"
        ? localeText(language, REPLACEMENT_PROMPT.zh, REPLACEMENT_PROMPT.en)
        : localeText(language, MOTION_PROMPT.zh, MOTION_PROMPT.en);

    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(mode);
    } catch {
      setCopiedPrompt(null);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      changeMode(defaultMode);
      return;
    }
    if (dismissStorageKey && skipAutoOpen) {
      window.localStorage.setItem(dismissStorageKey, "1");
    }
  }

  const destination = destinationByMode?.[mode];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {showTrigger ? (
      <DialogTrigger
        render={
          <Button
            className={triggerClassName}
            variant={triggerVariant}
            size={compactTrigger ? "icon" : "sm"}
            type="button"
          />
        }
      >
        <Help size={18} color="currentColor" />
        {compactTrigger ? (
          <span className="sr-only">
            {text("打开功能教程", "Open feature tutorial")}
          </span>
        ) : (
          <span>{text("功能教程", "Tutorial")}</span>
        )}
      </DialogTrigger>
      ) : null}

      <DialogPopup
        className="tutorial-dialog"
        closeLabel={text("关闭教程", "Close tutorial")}
      >
        <DialogHeader className="tutorial-dialog-header">
          <div className="tutorial-title-row">
            <span>{text("素材准备指南", "MEDIA PREP GUIDE")}</span>
            <strong>{step + 1} / 3</strong>
          </div>
          <DialogTitle>
            {mode === "replacement"
              ? text("三步做好人物替换", "Character replacement in three steps")
              : text("三步做好动作迁移", "Motion transfer in three steps")}
          </DialogTitle>
          <DialogDescription>
            {mode === "replacement"
              ? text(
                  "人物参考图锁身份，AI 视频分析锁动作、交互与运镜。",
                  "Character references lock identity; AI video analysis locks motion, interaction, and camera movement.",
                )
              : text(
                  "用清晰动作视频与匹配首帧，让角色图自然动起来。",
                  "Pair clear motion footage with a matching first frame to animate a character image.",
                )}
          </DialogDescription>
          <div
            className="tutorial-mode-switch"
            role="group"
            aria-label={text("选择教程", "Choose tutorial")}
          >
            <Button
              className={mode === "replacement" ? "is-active" : undefined}
              variant="ghost"
              size="sm"
              type="button"
              aria-pressed={mode === "replacement"}
              onClick={() => changeMode("replacement")}
            >
              <VideoReplace size={18} color="currentColor" />
              {text("人物替换", "Replacement")}
            </Button>
            <Button
              className={mode === "motion" ? "is-active" : undefined}
              variant="ghost"
              size="sm"
              type="button"
              aria-pressed={mode === "motion"}
              onClick={() => changeMode("motion")}
            >
              <Task size={18} color="currentColor" />
              {text("动作迁移", "Motion")}
            </Button>
          </div>
          <nav className="tutorial-step-nav" aria-label={text("教程步骤", "Tutorial steps")}>
            <ol>
              {stepLabels.map((label, index) => (
                <li key={label}>
                  <Button
                    className={step === index ? "is-active" : undefined}
                    variant="ghost"
                    size="sm"
                    type="button"
                    aria-current={step === index ? "step" : undefined}
                    onClick={() => {
                      setStep(index);
                      setCopiedPrompt(null);
                    }}
                  >
                    <span>{index + 1}</span>
                    <strong>{label}</strong>
                  </Button>
                </li>
              ))}
            </ol>
            <Progress
              className="tutorial-progress"
              value={((step + 1) / 3) * 100}
              aria-label={text(
                `教程进度：第 ${step + 1} 步，共 3 步`,
                `Tutorial progress: step ${step + 1} of 3`,
              )}
            >
              <ProgressTrack>
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
          </nav>
        </DialogHeader>

        <DialogPanel className="tutorial-dialog-panel">
          <div
            className="tutorial-step-content"
            key={`${mode}-${step}`}
            aria-live="polite"
          >
            {mode === "replacement" ? (
              <ReplacementStep
                step={step}
                text={text}
                copied={copiedPrompt === mode}
                onCopy={() => void copyPrompt()}
              />
            ) : (
              <MotionStep
                step={step}
                text={text}
                copied={copiedPrompt === mode}
                onCopy={() => void copyPrompt()}
              />
            )}
          </div>
        </DialogPanel>

        <DialogFooter className="tutorial-dialog-footer">
          {dismissStorageKey ? (
            <label className="tutorial-dismiss-control">
              <input
                type="checkbox"
                checked={skipAutoOpen}
                onChange={(event) => setSkipAutoOpen(event.target.checked)}
              />
              <span>{text("以后不再自动显示", "Do not open automatically again")}</span>
            </label>
          ) : null}
          <DialogClose
            render={
              <Button variant="ghost" size="sm" type="button" />
            }
          >
            {text("稍后再看", "Maybe later")}
          </DialogClose>
          <div className="tutorial-footer-actions">
            {step > 0 ? (
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setStep((current) => Math.max(0, current - 1));
                  setCopiedPrompt(null);
                }}
              >
                <ArrowLeft size={17} color="currentColor" />
                {text("上一步", "Back")}
              </Button>
            ) : null}
            {step < 2 ? (
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  setStep((current) => Math.min(2, current + 1));
                  setCopiedPrompt(null);
                }}
              >
                {text("下一步", "Next")}
                <ArrowRight size={17} color="currentColor" />
              </Button>
            ) : destination ? (
              <Button
                size="sm"
                render={<a href={destination} />}
              >
                <Play size={17} color="currentColor" />
                {mode === "replacement"
                  ? text("去人物替换", "Start replacement")
                  : text("去动作迁移", "Start motion")}
              </Button>
            ) : (
              <DialogClose
                render={
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => onStart?.(mode)}
                  />
                }
              >
                <Play size={17} color="currentColor" />
                {mode === "replacement"
                  ? text("开始人物替换", "Start replacement")
                  : text("开始动作迁移", "Start motion")}
              </DialogClose>
            )}
          </div>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
