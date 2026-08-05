"use client";

import Link from "next/link";
import {
  CloudUpload,
  Logout,
  Play,
  Refresh,
  Settings,
  Task,
  UserCircle,
  Video,
  VideoReplace,
  Wallet,
} from "reicon-react";
import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PreferencesControls,
  useLanguagePreference,
} from "@/app/PreferencesProvider";
import { AmbientBackdrop } from "@/app/components/AmbientBackdrop";
import BorderGlow from "@/app/components/BorderGlow";
import { FeatureTutorialDialog } from "@/app/components/FeatureTutorialDialog";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/AlertDialog";
import { Button } from "@/app/components/ui/Button";
import {
  Card,
  CardFooter,
  CardHeader,
  CardPanel,
} from "@/app/components/ui/Card";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/app/components/ui/Dialog";
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/app/components/ui/Progress";
import {
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@/app/components/ui/Tabs";
import { Switch } from "@/app/components/ui/Switch";
import {
  type AppLanguage,
  localeText,
  VIDEO_ANALYSIS_COOKIE,
} from "@/lib/preferences";
import {
  formatStudioTaskDate,
  taskMediaThumbnailUrl,
} from "@/lib/media-presentation";
import {
  reserveMotionCredits,
  reserveReferenceCredits,
} from "@/lib/pricing";
import { V16_REPLACEMENT_PROMPTS } from "@/lib/prompts";
import { SignOutLink } from "@/app/components/SignOutLink";
import type {
  ReferenceTaskInput,
  StudioDashboard,
  StudioTask,
  TaskState,
  VideoAnalysisResponse,
  VideoAnalysisSummary,
} from "@/lib/types";

type Props = {
  initialDashboard: StudioDashboard;
  initialMode?: ComposerMode;
  initialVideoAnalysisEnabled: boolean;
  canAccessAdmin: boolean;
};

type ComposerMode = "reference" | "replacement" | "motion";
type PrimaryComposerMode = "reference" | "motion";
type ReferenceComposerMode = Exclude<ComposerMode, "motion">;
type AspectRatio = "16:9" | "9:16" | "4:3" | "3:4" | "1:1";
type Resolution = ReferenceTaskInput["resolution"];
type ReplacementAnalysisState =
  | { status: "idle" }
  | { status: "uploading"; sourceVersion: number }
  | { status: "analyzing"; sourceVersion: number }
  | {
      status: "ready";
      sourceVersion: number;
      cacheHit: boolean;
      summary: VideoAnalysisSummary;
    }
  | { status: "failed"; sourceVersion: number; message: string };

const MODE_DETAILS: Record<
  AppLanguage,
  Record<ComposerMode, { title: string; estimate: string }>
> = {
  zh: {
    reference: {
      title: "参考生成",
      estimate: "Vidu Q2 Pro",
    },
    replacement: {
      title: "人物替换",
      estimate: "Q2 Pro 参考生成",
    },
    motion: {
      title: "动作迁移",
      estimate: "预计 10 credits / 秒",
    },
  },
  en: {
    reference: {
      title: "Reference",
      estimate: "Vidu Q2 Pro",
    },
    replacement: {
      title: "Character replacement",
      estimate: "Q2 Pro reference",
    },
    motion: {
      title: "Motion transfer",
      estimate: "Est. 10 credits / sec",
    },
  },
};

const PASSWORD_REMINDER_STORAGE_KEY = "vidu_password_setup_reminder";
const TUTORIAL_DISMISS_STORAGE_KEY = "vidu_feature_tutorial_dismissed";

const DEFAULT_REPLACEMENT_OBJECT = {
  zh: "原视频中的主要人物",
  en: "the main person in the source video",
} as const;

const STATE_LABELS: Record<AppLanguage, Record<TaskState, string>> = {
  zh: {
    submitting: "上传中",
    created: "已提交",
    queueing: "排队",
    processing: "生成中",
    success: "完成",
    failed: "失败",
  },
  en: {
    submitting: "Uploading",
    created: "Submitted",
    queueing: "Queued",
    processing: "Generating",
    success: "Complete",
    failed: "Failed",
  },
};

function fileList(event: ChangeEvent<HTMLInputElement>) {
  return Array.from(event.target.files ?? []);
}

function fileIdentity(file: File) {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${file.type}`;
}

function urlLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function validHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function waitForAnalysisRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function referenceDurationFromSource(duration: number) {
  return Math.min(10, Math.max(1, Math.round(duration)));
}

function sourceAspectRatio(width: number, height: number): AspectRatio {
  if (!width || !height) return "9:16";
  if (Math.abs(width - height) / Math.max(width, height) < 0.05) return "1:1";
  return width > height ? "16:9" : "9:16";
}

type FilePreviewProps = {
  file: File;
  className?: string;
  label?: string;
  onDuration?: (duration: number) => void;
  onAspectRatio?: (aspectRatio: AspectRatio) => void;
};

function ImageFilePreview({
  file,
  className = "upload-preview",
  label,
}: FilePreviewProps) {
  const { language } = useLanguagePreference();
  const resolvedLabel =
    label ??
    localeText(
      language,
      "已选择的角色图片预览",
      "Selected character image preview",
    );
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    const image = imageRef.current;
    if (image) image.src = objectUrl;

    return () => {
      image?.removeAttribute("src");
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return (
    <span className={className}>
      {/* Blob URLs are local previews and cannot use the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imageRef} alt={resolvedLabel} />
    </span>
  );
}

function VideoFilePreview({
  file,
  className = "upload-preview",
  label,
  onDuration,
  onAspectRatio,
}: FilePreviewProps) {
  const { language } = useLanguagePreference();
  const resolvedLabel =
    label ??
    localeText(
      language,
      "已选择的动作参考视频预览",
      "Selected motion reference video preview",
    );
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    const video = videoRef.current;
    if (video) video.src = objectUrl;

    return () => {
      video?.removeAttribute("src");
      video?.load();
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return (
    <span className={className}>
      <video
        ref={videoRef}
        aria-label={resolvedLabel}
        muted
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration)) onDuration?.(duration);
          onAspectRatio?.(
            sourceAspectRatio(
              event.currentTarget.videoWidth,
              event.currentTarget.videoHeight,
            ),
          );
        }}
        playsInline
        preload="metadata"
      />
    </span>
  );
}

type DurationSliderProps = {
  id: string;
  label: string;
  min: number;
  max: number;
  name: string;
  value: number;
  hint?: string;
  onChange: (value: number) => void;
};

function DurationSlider({
  id,
  label,
  min,
  max,
  name,
  value,
  hint,
  onChange,
}: DurationSliderProps) {
  const { language } = useLanguagePreference();
  const seconds = localeText(language, "秒", "sec");
  const progress = ((value - min) / (max - min)) * 100;

  return (
    <label className="duration-field" htmlFor={id}>
      <span className="duration-heading">
        <span>
          {label}
          <small className="duration-limits">
            {min}–{max} {seconds}
          </small>
        </span>
        <output htmlFor={id} aria-live="polite">
          {value} {seconds}
        </output>
      </span>
      <input
        id={id}
        className="duration-slider"
        name={name}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        style={
          {
            "--duration-progress": `${progress}%`,
          } as CSSProperties
        }
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? <small className="duration-hint">{hint}</small> : null}
    </label>
  );
}

const MEDIA_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_MEDIA_SIZE = 50 * 1024 * 1024;

type UploadSession = {
  id: string;
  publicToken: string;
  r2Key: string;
  uploadId: string;
  fileName: string;
  kind: "image" | "video";
  contentType: string;
  sizeBytes: number;
};

type UploadedPart = {
  partNumber: number;
  etag: string;
};

async function parseApiResponse<T>(
  response: Response,
  fallback: string,
  language: AppLanguage = "zh",
) {
  const responseText = await response.text();
  if (!responseText) throw new Error(fallback);

  try {
    return JSON.parse(responseText) as T;
  } catch {
    if (
      response.status === 413 ||
      /payload too large/i.test(responseText)
    ) {
      throw new Error(
        localeText(
          language,
          "素材上传请求过大，请重试或改用可公开访问的素材 URL。",
          "The upload request is too large. Try again or use a publicly accessible media URL.",
        ),
      );
    }
    throw new Error(
      response.ok
        ? localeText(
            language,
            `${fallback}（服务返回格式异常）`,
            `${fallback} (Unexpected server response)`,
          )
        : fallback,
    );
  }
}

function apiErrorMessage(
  language: AppLanguage,
  serverError: string | undefined,
  chineseFallback: string,
  englishFallback: string,
) {
  if (language === "zh" && serverError) return serverError;
  return localeText(language, chineseFallback, englishFallback);
}

async function uploadMedia(
  file: File,
  kind: "image" | "video",
  language: AppLanguage,
  signal?: AbortSignal,
) {
  if (file.size <= 0 || file.size > MAX_MEDIA_SIZE) {
    throw new Error(
      kind === "image"
        ? localeText(
            language,
            "站内上传图片需要在 50MB 以内。",
            "Uploaded images must be no larger than 50MB.",
          )
        : localeText(
            language,
            "站内上传视频需要在 50MB 以内；更大的视频请使用可公开访问的 URL。",
            "Uploaded videos must be no larger than 50MB. Use a public URL for larger videos.",
          ),
    );
  }

  let session: UploadSession | null = null;
  try {
    const initResponse = await fetch("/api/media?action=init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        kind,
        contentType: file.type,
        sizeBytes: file.size,
      }),
      signal,
    });
    const initData = await parseApiResponse<UploadSession & { error?: string }>(
      initResponse,
      localeText(
        language,
        "无法初始化素材上传。",
        "Could not initialize the media upload.",
      ),
      language,
    );
    if (!initResponse.ok || !initData.uploadId) {
      throw new Error(
        apiErrorMessage(
          language,
          initData.error,
          "无法初始化素材上传。",
          "Could not initialize the media upload.",
        ),
      );
    }
    session = initData;

    const parts: UploadedPart[] = [];
    for (
      let offset = 0, partNumber = 1;
      offset < file.size;
      offset += MEDIA_CHUNK_SIZE, partNumber += 1
    ) {
      const params = new URLSearchParams({
        action: "part",
        uploadId: session.uploadId,
        r2Key: session.r2Key,
        partNumber: String(partNumber),
      });
      const partResponse = await fetch(`/api/media?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file.slice(offset, offset + MEDIA_CHUNK_SIZE),
        signal,
      });
      const part = await parseApiResponse<UploadedPart & { error?: string }>(
        partResponse,
        localeText(
          language,
          `素材分块 ${partNumber} 上传失败。`,
          `Media part ${partNumber} failed to upload.`,
        ),
        language,
      );
      if (!partResponse.ok || !part.etag) {
        throw new Error(
          apiErrorMessage(
            language,
            part.error,
            `素材分块 ${partNumber} 上传失败。`,
            `Media part ${partNumber} failed to upload.`,
          ),
        );
      }
      parts.push(part);
    }

    const completeResponse = await fetch("/api/media?action=complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...session, parts }),
      signal,
    });
    const completeData = await parseApiResponse<{
      url?: string;
      error?: string;
    }>(
      completeResponse,
      localeText(
        language,
        "无法完成素材上传。",
        "Could not complete the media upload.",
      ),
      language,
    );
    if (!completeResponse.ok || !completeData.url) {
      throw new Error(
        apiErrorMessage(
          language,
          completeData.error,
          "无法完成素材上传。",
          "Could not complete the media upload.",
        ),
      );
    }
    return completeData.url;
  } catch (error) {
    if (session) {
      try {
        await fetch("/api/media?action=abort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploadId: session.uploadId,
            r2Key: session.r2Key,
          }),
        });
      } catch {
        // R2 will automatically expire unfinished multipart uploads.
      }
    }
    throw error;
  }
}

async function requestVideoAnalysis(
  videoUrl: string,
  mimeType: string | undefined,
  language: AppLanguage,
  signal: AbortSignal,
  force = false,
) {
  const deadline = Date.now() + 420_000;
  let forceNextRequest = force;

  while (Date.now() < deadline) {
    const response = await fetch("/api/video-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoUrl,
        mimeType: mimeType || undefined,
        force: forceNextRequest,
      }),
      signal,
    });
    forceNextRequest = false;
    const data = await parseApiResponse<VideoAnalysisResponse & {
      error?: string;
    }>(
      response,
      localeText(
        language,
        "AI 视频分析暂时不可用。",
        "AI video analysis is temporarily unavailable.",
      ),
      language,
    );
    if (!response.ok) {
      throw new Error(
        data.message ||
          data.error ||
          localeText(
            language,
            "AI 视频分析暂时不可用。",
            "AI video analysis is temporarily unavailable.",
          ),
      );
    }
    if (data.status !== "analyzing") return data;

    await waitForAnalysisRetry(
      Math.min(5_000, Math.max(500, data.retryAfterMs ?? 1_000)),
      signal,
    );
  }

  return {
    status: "failed",
    message: localeText(
      language,
      "AI 视频分析等待超时，请重新分析或关闭分析。",
      "AI video analysis timed out. Retry the analysis or turn it off.",
    ),
  } satisfies VideoAnalysisResponse;
}

type VideoMetadata = {
  duration: number;
  aspectRatio: AspectRatio;
};

async function readVideoMetadata(file: File, language: AppLanguage = "zh") {
  return new Promise<VideoMetadata>((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => {
      video.removeAttribute("src");
      URL.revokeObjectURL(objectUrl);
    };

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      cleanup();
      if (!Number.isFinite(duration)) {
        reject(
          new Error(
            localeText(
              language,
              `无法读取 ${file.name} 的时长。`,
              `Could not read the duration of ${file.name}.`,
            ),
          ),
        );
        return;
      }
      resolve({
        duration,
        aspectRatio: sourceAspectRatio(videoWidth, videoHeight),
      });
    };
    video.onerror = () => {
      cleanup();
      reject(
        new Error(
          localeText(
            language,
            `无法读取 ${file.name}，请检查视频格式。`,
            `Could not read ${file.name}. Check the video format.`,
          ),
        ),
      );
    };
    video.src = objectUrl;
  });
}

async function readVideoDuration(
  file: File,
  language: AppLanguage = "zh",
) {
  return (await readVideoMetadata(file, language)).duration;
}

async function validateReferenceVideoFiles(
  files: File[],
  language: AppLanguage,
) {
  if (!files.length) return;
  const durations = await Promise.all(
    files.map((file) => readVideoDuration(file, language)),
  );
  const maxDuration = files.length === 1 ? 8 : 5;
  const invalidIndex = durations.findIndex((duration) => duration > maxDuration + 0.1);
  if (invalidIndex >= 0) {
    throw new Error(
      files.length === 1
        ? localeText(
            language,
            `${files[invalidIndex].name} 超过 8 秒，请裁剪后重试。`,
            `${files[invalidIndex].name} is longer than 8 seconds. Trim it and try again.`,
          )
        : localeText(
            language,
            `${files[invalidIndex].name} 超过 5 秒；上传两个参考视频时，每个最长 5 秒。`,
            `${files[invalidIndex].name} is longer than 5 seconds. Each of two reference videos must be 5 seconds or shorter.`,
          ),
    );
  }
}

function SourceMediaDock({
  images,
  language,
  videos,
  overlay = false,
}: {
  images: string[];
  language: AppLanguage;
  videos: string[];
  overlay?: boolean;
}) {
  const text = (chinese: string, english: string) =>
    localeText(language, chinese, english);
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const triggerMedia = [
    ...images.map((url) => ({ type: "image" as const, url })),
    ...videos.map((url) => ({ type: "video" as const, url })),
  ].slice(0, 2);
  const visibleImages = images.slice(0, 3);
  const visibleVideos = videos.slice(0, 2);
  const hiddenMediaCount =
    images.length +
    videos.length -
    visibleImages.length -
    visibleVideos.length;
  const mediaCount = images.length + videos.length;

  if (!mediaCount) return null;

  return (
    <div
      className={`task-source-dock ${overlay ? "is-overlay" : ""} ${
        isOpen ? "is-open" : ""
      }`}
      onMouseEnter={() => {
        if (window.matchMedia("(hover: hover)").matches) setIsOpen(true);
      }}
      onMouseLeave={() => {
        if (window.matchMedia("(hover: hover)").matches) setIsOpen(false);
      }}
      onBlurCapture={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        ) {
          setIsOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setIsOpen(false);
      }}
    >
      <Button
        className="task-source-trigger"
        variant="outline"
        size="sm"
        type="button"
        aria-controls={panelId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="task-source-stack" aria-hidden="true">
          {triggerMedia.map((media, index) => (
            <span
              className="task-source-stack-item"
              key={`${media.type}-${media.url}-${index}`}
            >
              {media.type === "image" ? (
                <>
                  {/* Dynamic task media can come from approved HTTPS hosts. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={taskMediaThumbnailUrl(media.url)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </>
              ) : (
                <Video size={14} color="currentColor" />
              )}
            </span>
          ))}
        </span>
        <span className="task-source-trigger-label">
          {text("原素材", "Source")} <b>{mediaCount}</b>
        </span>
      </Button>

      {isOpen ? (
        <div className="task-source-panel" id={panelId}>
          <div className="task-source-panel-head">
            <strong>{text("原素材", "Source media")}</strong>
            <span className="task-source-panel-actions">
              <span>
                {images.length} {text("图", "images")} · {videos.length}{" "}
                {text("视频", "videos")}
              </span>
              <Button
                variant="ghost"
                size="xs"
                type="button"
                onClick={() => setIsOpen(false)}
              >
                {text("收起", "Collapse")}
              </Button>
            </span>
          </div>
          <div
            className="task-input-media"
            aria-label={text("任务输入素材", "Task input media")}
          >
            {visibleImages.map((url, index) => (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                aria-label={`${text("查看参考图片", "View reference image")} ${index + 1}`}
                key={`image-${url}-${index}`}
              >
                {/* Dynamic user media can come from arbitrary approved HTTPS hosts. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={taskMediaThumbnailUrl(url)}
                  alt={`${text("任务参考图片", "Task reference image")} ${index + 1}`}
                  loading="lazy"
                  decoding="async"
                />
                <span>{text("参考图片", "Reference image")}</span>
              </a>
            ))}
            {visibleVideos.map((url, index) => (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                aria-label={`${text("查看参考视频", "View reference video")} ${index + 1}`}
                key={`video-${url}-${index}`}
              >
                <video src={url} preload="none" muted playsInline />
                <span>
                  <Video size={13} color="currentColor" />
                  {text("参考视频", "Reference video")}
                </span>
              </a>
            ))}
            {hiddenMediaCount > 0 ? (
              <span className="task-media-overflow">+{hiddenMediaCount}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const TaskCard = memo(function TaskCard({
  language,
  task,
}: {
  language: AppLanguage;
  task: StudioTask;
}) {
  const text = (chinese: string, english: string) =>
    localeText(language, chinese, english);
  const kindLabel = {
    reference: text("参考生成", "Reference"),
    replacement: text("人物替换", "Replacement"),
    motion: text("动作迁移", "Motion"),
  }[task.kind];
  const isWaiting = ["submitting", "created", "queueing"].includes(
    task.state,
  );
  const isProcessing = task.state === "processing";
  const isComplete = task.state === "success";
  const groupedStateLabel = isWaiting
    ? text("等待中", "Waiting")
    : isProcessing
      ? text("生成中", "Generating")
      : isComplete
        ? text("生成完成", "Complete")
        : STATE_LABELS[language][task.state];
  const stateHeadline = isWaiting
    ? task.state === "submitting"
      ? text("正在提交素材与参数", "Submitting inputs and settings")
      : task.state === "created"
        ? text("任务已提交，等待调度", "Submitted and waiting to start")
        : text("等待生成槽位", "Waiting for a generation slot")
    : isProcessing
      ? text("正在生成视频", "Generating your video")
      : isComplete
        ? text("视频已生成", "Your video is ready")
        : "";
  const stateDetail = isWaiting
    ? task.state === "submitting"
      ? text("提交完成后会自动进入生成队列", "It will join the queue automatically")
      : text("并行槽位释放后自动开始", "Starts automatically when a slot opens")
      : isProcessing
        ? text("结果完成后会自动出现在这里", "The result will appear here automatically")
        : isComplete
          ? task.outputUrl
            ? text(
                "可直接预览，或在新窗口查看结果",
                "Preview it here or open the result in a new tab",
              )
            : text(
                "结果地址正在同步，请稍后刷新",
                "The result link is still syncing. Refresh shortly.",
              )
          : "";
  const stateTone = isWaiting
    ? "is-waiting"
    : isProcessing
      ? "is-processing"
      : "is-complete";

  const card = (
    <Card
      className={`task-card state-${task.state}`}
      render={<article />}
    >
      <CardHeader className="task-card-header">
        <div className="task-card-head">
          <span className="task-kind">
            {task.kind === "reference" ? (
              <Video size={16} color="currentColor" />
            ) : task.kind === "replacement" ? (
              <VideoReplace size={16} color="currentColor" />
            ) : (
              <Task size={16} color="currentColor" />
            )}
            {kindLabel}
          </span>
          <span className="status-badge">{groupedStateLabel}</span>
        </div>
        <h3>{task.title}</h3>
        <p className="task-meta">
          {task.duration}s · {task.resolution} · {task.aspectRatio}
        </p>
      </CardHeader>
      <CardPanel className="task-card-body">
        {isWaiting || isProcessing || isComplete ? (
          <div className={`task-state-panel ${stateTone}`} role="status">
            <span className="task-state-signal" aria-hidden="true" />
            <span className="task-state-copy">
              <strong>{stateHeadline}</strong>
              <span>{stateDetail}</span>
            </span>
            {isWaiting ? (
              <span className="task-wait-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            ) : null}
            {isProcessing ? (
              <Progress
                className="task-progress"
                aria-label={text(
                  "视频正在生成",
                  "Video generation in progress",
                )}
              >
                <ProgressTrack>
                  <ProgressIndicator />
                </ProgressTrack>
              </Progress>
            ) : null}
          </div>
        ) : null}
        {!task.outputUrl ? (
          <SourceMediaDock
            images={task.inputImages}
            language={language}
            videos={task.inputVideos}
          />
        ) : null}
        {task.prompt ? <p className="task-prompt">{task.prompt}</p> : null}
        {task.outputUrl ? (
          <div className="task-result">
            <video
              className="task-result-video"
              controls
              preload="none"
              poster={task.coverUrl ?? undefined}
              src={task.outputUrl}
            >
              {text(
                "当前浏览器不支持视频播放。",
                "Your browser does not support video playback.",
              )}
            </video>
            <SourceMediaDock
              images={task.inputImages}
              language={language}
              videos={task.inputVideos}
              overlay
            />
            <a
              className="task-result-link"
              href={task.outputUrl}
              target="_blank"
              rel="noreferrer"
            >
              {text("查看视频", "View video")}
            </a>
          </div>
        ) : null}
        {task.errorMessage ? (
          <p className="task-error">
            {language === "en" && /[\u3400-\u9fff]/u.test(task.errorMessage)
              ? "Task failed. Review the inputs and try again."
              : task.errorMessage}
          </p>
        ) : null}
      </CardPanel>
      <CardFooter className="task-card-foot">
        <span>
          {formatStudioTaskDate(task.createdAt, language)}
        </span>
        <strong>{task.chargedCredits} credits</strong>
      </CardFooter>
    </Card>
  );

  return isProcessing ? (
    <BorderGlow
      className="task-border-glow"
      backgroundColor="var(--control)"
      borderRadius={10}
      glowRadius={18}
      glowIntensity={0.34}
      edgeSensitivity={24}
      coneSpread={14}
      colors={["#d8ff5e", "#b6e95b", "#efffc2"]}
      glowColor="76 100 68"
      fillOpacity={0.08}
      animated
    >
      {card}
    </BorderGlow>
  ) : (
    card
  );
});


function PasswordSetupReminder({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { language } = useLanguagePreference();
  const text = (chinese: string, english: string) =>
    localeText(language, chinese, english);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="password-reminder-dialog" closeLabel={text("关闭提醒", "Close reminder")}>
        <DialogHeader>
          <DialogTitle>{text("设置登录密码", "Set a login password")}</DialogTitle>
          <DialogDescription>
            {text(
              "你刚通过邮箱验证码登录。现在无需设置密码；如需以后直接用密码登录，可前往账户页设置 8–128 位密码。",
              "You signed in with an email code. A password is optional, but you can set an 8–128 character password for direct sign-in later.",
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel />
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" size="sm" type="button" />}>
            {text("稍后再说", "Maybe later")}
          </DialogClose>
          <Button size="sm" render={<Link href="/account" />}>
            <Wallet size={16} aria-hidden="true" />
            {text("去设置密码", "Set password")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function StudioClient({
  initialDashboard,
  initialMode = "replacement",
  initialVideoAnalysisEnabled,
  canAccessAdmin,
}: Props) {
  const { language } = useLanguagePreference();
  const text = useCallback(
    (chinese: string, english: string) =>
      localeText(language, chinese, english),
    [language],
  );
  const modeDetails = MODE_DETAILS[language];
  const referencePromptPresets = useMemo(
    () => [
      {
        label: text("人物替换 · Q2 Pro", "Character replacement · Q2 Pro"),
        prompt: V16_REPLACEMENT_PROMPTS[language],
      },
    ],
    [language, text],
  );
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [passwordReminderOpen, setPasswordReminderOpen] = useState(false);
  const [autoTutorialEnabled, setAutoTutorialEnabled] = useState(false);
  const postOtpLoginRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (postOtpLoginRef.current === null) {
      postOtpLoginRef.current =
        window.sessionStorage.getItem(PASSWORD_REMINDER_STORAGE_KEY) === "1";
      window.sessionStorage.removeItem(PASSWORD_REMINDER_STORAGE_KEY);
    }
    const remindPassword = postOtpLoginRef.current && !dashboard.user.passwordEnabled;
    const timer = window.setTimeout(() => {
      if (remindPassword) {
        setPasswordReminderOpen(true);
        return;
      }
      setAutoTutorialEnabled(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dashboard.user.passwordEnabled]);
  const [mode, setMode] = useState<ComposerMode>(initialMode);
  const [referenceMode, setReferenceMode] = useState<ReferenceComposerMode>(
    initialMode === "reference" ? "reference" : "replacement",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [clearHistoryError, setClearHistoryError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [referenceVideoFiles, setReferenceVideoFiles] = useState<File[]>([]);
  const [referenceImageUrls, setReferenceImageUrls] = useState("");
  const [referenceVideoUrls, setReferenceVideoUrls] = useState("");
  const [referencePrompt, setReferencePrompt] = useState("");
  const [referenceDuration, setReferenceDuration] = useState(5);
  const [referenceResolution, setReferenceResolution] =
    useState<Resolution>("720p");
  const [referenceAspectRatio, setReferenceAspectRatio] =
    useState<AspectRatio>("9:16");
  const [replacementImages, setReplacementImages] = useState<File[]>([]);
  const [replacementVideo, setReplacementVideo] = useState<File | null>(null);
  const [replacementImageUrls, setReplacementImageUrls] = useState("");
  const [replacementVideoUrl, setReplacementVideoUrl] = useState("");
  const [replacementObject, setReplacementObject] = useState<string>(
    DEFAULT_REPLACEMENT_OBJECT[language],
  );
  const [replacementPrompt, setReplacementPrompt] = useState("");
  const [videoAnalysisEnabled, setVideoAnalysisEnabled] = useState(
    initialVideoAnalysisEnabled,
  );
  const [replacementAnalysis, setReplacementAnalysis] =
    useState<ReplacementAnalysisState>({ status: "idle" });
  const [replacementAnalysisAttempt, setReplacementAnalysisAttempt] =
    useState(0);
  const [replacementDuration, setReplacementDuration] = useState(5);
  const [replacementResolution, setReplacementResolution] =
    useState<Resolution>("720p");
  const [replacementAspectRatio, setReplacementAspectRatio] =
    useState<AspectRatio>("9:16");
  const [motionImage, setMotionImage] = useState<File | null>(null);
  const [motionVideo, setMotionVideo] = useState<File | null>(null);
  const [motionDuration, setMotionDuration] = useState(8);
  const referenceFormRef = useRef<HTMLFormElement>(null);
  const replacementFormRef = useRef<HTMLFormElement>(null);
  const previousLanguageRef = useRef(language);
  const measuredReferenceFileRef = useRef<File | null>(null);
  const measuredReferenceUrlRef = useRef("");
  const measuredReplacementFileRef = useRef<File | null>(null);
  const measuredReplacementUrlRef = useRef("");
  const replacementSourceDurationRef = useRef<number | null>(null);
  const replacementSourceVersionRef = useRef(0);
  const replacementAnalysisForceRef = useRef(false);
  const replacementAnalysisControllerRef = useRef<AbortController | null>(null);
  const replacementUploadRef = useRef<{
    file: File;
    promise: Promise<string>;
    controller: AbortController;
  } | null>(null);
  const replacementUploadedRef = useRef<{
    file: File;
    url: string;
  } | null>(null);
  const replacementDurationUpdateRef = useRef<(duration: number) => void>(
    () => undefined,
  );
  const videoAnalysisDescriptionId = useId();
  const videoAnalysisStatusId = useId();
  const replacementPromptHelpId = useId();
  const primaryMode: PrimaryComposerMode =
    mode === "motion" ? "motion" : "reference";

  const selectComposerMode = useCallback((nextMode: ComposerMode) => {
    setMode(nextMode);
    if (nextMode !== "motion") {
      setReferenceMode(nextMode);
    }
  }, []);

  const hasActiveTasks = useMemo(
    () =>
      dashboard.tasks.some((task) =>
        ["submitting", "created", "queueing", "processing"].includes(task.state),
      ),
    [dashboard.tasks],
  );
  const referenceImageCount =
    referenceFiles.length + urlLines(referenceImageUrls).length;
  const referenceVideoCount =
    referenceVideoFiles.length + urlLines(referenceVideoUrls).length;
  const referenceImageLimit = referenceVideoCount ? 4 : 7;
  const referenceEstimatedCredits = reserveReferenceCredits({
    duration: referenceDuration,
    resolution: referenceResolution,
  });
  const replacementEstimatedCredits = reserveReferenceCredits({
    duration: replacementDuration,
    resolution: replacementResolution,
  });
  const motionEstimatedCredits = reserveMotionCredits({
    duration: motionDuration,
  });
  const firstReferenceVideoFile = referenceVideoFiles[0];
  const firstReferenceVideoUrl =
    referenceVideoFiles.length === 0
      ? (urlLines(referenceVideoUrls)[0] ?? "")
      : "";
  const firstReplacementVideoUrl = replacementVideo
    ? ""
    : replacementVideoUrl.trim();
  const replacementHasAnalyzableSource = Boolean(
    replacementVideo || validHttpsUrl(firstReplacementVideoUrl),
  );
  const replacementAnalysisBusy =
    videoAnalysisEnabled &&
    replacementHasAnalyzableSource &&
    (replacementAnalysis.status === "idle" ||
      replacementAnalysis.status === "uploading" ||
      replacementAnalysis.status === "analyzing");
  const replacementAnalysisBlocking =
    videoAnalysisEnabled &&
    replacementHasAnalyzableSource &&
    replacementAnalysis.status !== "ready";
  const retryReplacementAnalysis = useCallback(() => {
    if (!videoAnalysisEnabled || !replacementHasAnalyzableSource) return;
    replacementAnalysisForceRef.current = true;
    replacementAnalysisControllerRef.current?.abort();
    replacementAnalysisControllerRef.current = null;
    setReplacementAnalysis({ status: "idle" });
    setReplacementAnalysisAttempt((current) => current + 1);
  }, [replacementHasAnalyzableSource, videoAnalysisEnabled]);
  const replacementPromptLimit = 2000;
  const replacementPromptOverLimit =
    replacementPrompt.length > replacementPromptLimit;
  const updateReferenceDurationFromSource = useCallback((duration: number) => {
    if (!Number.isFinite(duration)) return;
    setReferenceDuration(referenceDurationFromSource(duration));
  }, []);
  const updateMotionDurationFromSource = useCallback((duration: number) => {
    if (duration < 1.9 || duration > 30.1) {
      setError(
        text(
          "源动作视频需要在 2 到 30 秒之间。",
          "The source motion video must be between 2 and 30 seconds.",
        ),
      );
      return;
    }
    setMotionDuration(Math.min(30, Math.max(2, Math.round(duration))));
  }, [text]);
  const updateReferenceAspectRatioFromSource = useCallback(
    (aspectRatio: AspectRatio) => {
      setReferenceAspectRatio(aspectRatio);
    },
    [],
  );
  const updateReplacementAspectRatioFromSource = useCallback(
    (aspectRatio: AspectRatio) => {
      setReplacementAspectRatio(aspectRatio);
    },
    [],
  );
  const updateReplacementDurationFromSource = useCallback(
    (duration: number) => {
      if (duration < 0.9 || duration > 8.1) {
        setError(
          text(
            "Q2 Pro 的参考视频最长 8 秒。",
            "Q2 Pro supports reference videos up to 8 seconds.",
          ),
        );
        return;
      }
      setError("");
      setReplacementDuration(Math.min(8, Math.max(1, Math.round(duration))));
    },
    [text],
  );

  useEffect(() => {
    replacementDurationUpdateRef.current =
      updateReplacementDurationFromSource;
  }, [updateReplacementDurationFromSource]);


  const ensureReplacementVideoUploaded = useCallback(
    (file: File) => {
      if (replacementUploadedRef.current?.file === file) {
        return Promise.resolve(replacementUploadedRef.current.url);
      }
      if (replacementUploadRef.current?.file === file) {
        return replacementUploadRef.current.promise;
      }

      const controller = new AbortController();
      const promise = uploadMedia(file, "video", language, controller.signal)
        .then((url) => {
          if (
            !controller.signal.aborted &&
            replacementUploadRef.current?.file === file
          ) {
            replacementUploadedRef.current = { file, url };
          }
          return url;
        })
        .finally(() => {
          if (replacementUploadRef.current?.controller === controller) {
            replacementUploadRef.current = null;
          }
        });
      replacementUploadRef.current = { file, promise, controller };
      return promise;
    },
    [language],
  );

  const invalidateReplacementAnalysis = useCallback(() => {
    replacementSourceVersionRef.current += 1;
    replacementAnalysisControllerRef.current?.abort();
    replacementAnalysisControllerRef.current = null;
    setReplacementAnalysis({ status: "idle" });
  }, []);

  const changeReplacementVideo = useCallback(
    (nextVideo: File | null) => {
      invalidateReplacementAnalysis();
      const upload = replacementUploadRef.current;
      if (upload && upload.file !== nextVideo) {
        upload.controller.abort();
        replacementUploadRef.current = null;
      }
      if (replacementUploadedRef.current?.file !== nextVideo) {
        replacementUploadedRef.current = null;
      }
      setReplacementVideo(nextVideo);
    },
    [invalidateReplacementAnalysis],
  );

  const changeVideoAnalysisEnabled = useCallback(
    (enabled: boolean) => {
      document.cookie = `${VIDEO_ANALYSIS_COOKIE}=${
        enabled ? "enabled" : "disabled"
      }; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      if (!enabled) invalidateReplacementAnalysis();
      setVideoAnalysisEnabled(enabled);
    },
    [invalidateReplacementAnalysis],
  );

  useEffect(() => {
    replacementAnalysisControllerRef.current?.abort();

    const file = replacementVideo;
    const externalUrl = firstReplacementVideoUrl;
    if (
      !videoAnalysisEnabled ||
      (!file && (!externalUrl || !validHttpsUrl(externalUrl)))
    ) {
      return;
    }

    const sourceVersion = replacementSourceVersionRef.current + 1;
    const force = replacementAnalysisForceRef.current;
    replacementAnalysisForceRef.current = false;
    replacementSourceVersionRef.current = sourceVersion;
    const controller = new AbortController();
    replacementAnalysisControllerRef.current = controller;

    const isCurrentSource = () =>
      !controller.signal.aborted &&
      replacementSourceVersionRef.current === sourceVersion;

    const run = async () => {
      try {
        let videoUrl = externalUrl;
        if (file) {
          setReplacementAnalysis({ status: "uploading", sourceVersion });
          videoUrl = await ensureReplacementVideoUploaded(file);
          if (!isCurrentSource()) return;
        }

        setReplacementAnalysis({ status: "analyzing", sourceVersion });
        const result = await requestVideoAnalysis(
          videoUrl,
          file?.type,
          language,
          controller.signal,
          force,
        );
        if (!isCurrentSource()) return;

        if (result.status === "ready" && result.summary) {
          setReplacementAnalysis({
            status: "ready",
            sourceVersion,
            cacheHit: Boolean(result.cacheHit),
            summary: result.summary,
          });
          return;
        }

        setReplacementAnalysis({
          status: "failed",
          sourceVersion,
          message:
            result.message ||
            localeText(
              language,
              "AI 视频分析失败，请重新分析或关闭分析。",
              "AI video analysis failed. Retry it or turn analysis off.",
            ),
        });
      } catch (analysisError) {
        if (!isCurrentSource()) return;
        setReplacementAnalysis({
          status: "failed",
          sourceVersion,
          message:
            analysisError instanceof Error
              ? analysisError.message
              : localeText(
                  language,
                  "AI 视频分析失败，请重新分析或关闭分析。",
                  "AI video analysis failed. Retry it or turn analysis off.",
                ),
        });
      }
    };

    const timer = file ? null : window.setTimeout(() => void run(), 600);
    if (file) void run();

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    ensureReplacementVideoUploaded,
    firstReplacementVideoUrl,
    language,
    replacementVideo,
    replacementAnalysisAttempt,
    videoAnalysisEnabled,
  ]);

  useEffect(
    () => () => {
      replacementUploadRef.current?.controller.abort();
      replacementAnalysisControllerRef.current?.abort();
    },
    [],
  );

  const refreshDashboard = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const data = await parseApiResponse<StudioDashboard & {
        error?: string;
      }>(
        response,
        text("刷新任务失败。", "Could not refresh tasks."),
        language,
      );
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(
            language,
            data.error,
            "刷新任务失败。",
            "Could not refresh tasks.",
          ),
        );
      }
      setDashboard(data);
      if (!quiet) setError("");
    } catch (refreshError) {
      if (!quiet) {
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : text("刷新任务失败。", "Could not refresh tasks."),
        );
      }
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, [language, text]);

  const clearHistory = useCallback(async () => {
    setClearingHistory(true);
    setClearHistoryError("");

    try {
      const response = await fetch("/api/tasks/history", {
        method: "DELETE",
      });
      const data = await parseApiResponse<{
        deletedCount?: number;
        error?: string;
      }>(
        response,
        text("清空历史失败。", "Could not clear task history."),
        language,
      );

      if (!response.ok || typeof data.deletedCount !== "number") {
        throw new Error(
          apiErrorMessage(
            language,
            data.error,
            "清空历史失败。",
            "Could not clear task history.",
          ),
        );
      }

      setDashboard((current) => ({
        ...current,
        stats: {
          ...current.stats,
          completed: 0,
          history: 0,
        },
        tasks: current.tasks.filter(
          (task) => task.state !== "success" && task.state !== "failed",
        ),
      }));
      setNotice(
        text(
          `已清空 ${data.deletedCount} 条历史任务，等待中和生成中的任务已保留。`,
          `Cleared ${data.deletedCount} historical tasks. Waiting and generating tasks were kept.`,
        ),
      );
      setClearHistoryOpen(false);
      await refreshDashboard(true);
    } catch (clearError) {
      setClearHistoryError(
        clearError instanceof Error
          ? clearError.message
          : text("清空历史失败。", "Could not clear task history."),
      );
    } finally {
      setClearingHistory(false);
    }
  }, [language, refreshDashboard, text]);

  useEffect(() => {
    if (!hasActiveTasks) return;
    const timer = window.setInterval(() => {
      void refreshDashboard(true);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [hasActiveTasks, refreshDashboard]);

  useEffect(() => {
    const previousLanguage = previousLanguageRef.current;
    setReplacementObject((current) =>
      current === DEFAULT_REPLACEMENT_OBJECT[previousLanguage]
        ? DEFAULT_REPLACEMENT_OBJECT[language]
        : current,
    );
    setReferencePrompt((current) =>
      current === V16_REPLACEMENT_PROMPTS[previousLanguage]
        ? V16_REPLACEMENT_PROMPTS[language]
        : current,
    );
    previousLanguageRef.current = language;
  }, [language]);

  useEffect(() => {
    if (!firstReferenceVideoFile) return;
    if (measuredReferenceFileRef.current === firstReferenceVideoFile) return;

    let cancelled = false;
    void readVideoMetadata(firstReferenceVideoFile)
      .then((metadata) => {
        if (!cancelled) {
          measuredReferenceFileRef.current = firstReferenceVideoFile;
          updateReferenceDurationFromSource(metadata.duration);
          updateReferenceAspectRatioFromSource(metadata.aspectRatio);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    firstReferenceVideoFile,
    updateReferenceAspectRatioFromSource,
    updateReferenceDurationFromSource,
  ]);

  useEffect(() => {
    if (!firstReferenceVideoUrl) return;
    if (measuredReferenceUrlRef.current === firstReferenceVideoUrl) return;

    const video = document.createElement("video");
    const timer = window.setTimeout(() => {
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        measuredReferenceUrlRef.current = firstReferenceVideoUrl;
        updateReferenceDurationFromSource(video.duration);
        updateReferenceAspectRatioFromSource(
          sourceAspectRatio(video.videoWidth, video.videoHeight),
        );
      };
      video.src = firstReferenceVideoUrl;
    }, 450);

    return () => {
      window.clearTimeout(timer);
      video.onloadedmetadata = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [
    firstReferenceVideoUrl,
    updateReferenceAspectRatioFromSource,
    updateReferenceDurationFromSource,
  ]);

  useEffect(() => {
    if (!replacementVideo) return;
    if (measuredReplacementFileRef.current === replacementVideo) return;

    let cancelled = false;
    void readVideoMetadata(replacementVideo)
      .then((metadata) => {
        if (!cancelled) {
          measuredReplacementFileRef.current = replacementVideo;
          replacementSourceDurationRef.current = metadata.duration;
          updateReplacementDurationFromSource(metadata.duration);
          updateReplacementAspectRatioFromSource(metadata.aspectRatio);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    replacementVideo,
    updateReplacementAspectRatioFromSource,
    updateReplacementDurationFromSource,
  ]);

  useEffect(() => {
    if (!firstReplacementVideoUrl) return;
    if (measuredReplacementUrlRef.current === firstReplacementVideoUrl) return;

    const video = document.createElement("video");
    const timer = window.setTimeout(() => {
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        measuredReplacementUrlRef.current = firstReplacementVideoUrl;
        replacementSourceDurationRef.current = video.duration;
        updateReplacementDurationFromSource(video.duration);
        updateReplacementAspectRatioFromSource(
          sourceAspectRatio(video.videoWidth, video.videoHeight),
        );
      };
      video.src = firstReplacementVideoUrl;
    }, 450);

    return () => {
      window.clearTimeout(timer);
      video.onloadedmetadata = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [
    firstReplacementVideoUrl,
    updateReplacementAspectRatioFromSource,
    updateReplacementDurationFromSource,
  ]);

  useEffect(() => {
    if (!firstReferenceVideoFile) measuredReferenceFileRef.current = null;
    if (!firstReferenceVideoUrl) measuredReferenceUrlRef.current = "";
  }, [firstReferenceVideoFile, firstReferenceVideoUrl]);

  useEffect(() => {
    if (!replacementVideo) measuredReplacementFileRef.current = null;
    if (!firstReplacementVideoUrl) measuredReplacementUrlRef.current = "";
    if (!replacementVideo && !firstReplacementVideoUrl) {
      replacementSourceDurationRef.current = null;
    }
  }, [firstReplacementVideoUrl, replacementVideo]);

  function clearReferenceComposer() {
    referenceFormRef.current?.reset();
    setReferenceFiles([]);
    setReferenceVideoFiles([]);
    setReferenceImageUrls("");
    setReferenceVideoUrls("");
    setReferencePrompt("");
    setReferenceDuration(5);
    setReferenceResolution("720p");
    setReferenceAspectRatio("9:16");
    setNotice("");
    setError("");
  }

  function clearReplacementComposer() {
    replacementFormRef.current?.reset();
    setReplacementImages([]);
    changeReplacementVideo(null);
    setReplacementImageUrls("");
    setReplacementVideoUrl("");
    setReplacementObject(DEFAULT_REPLACEMENT_OBJECT[language]);
    setReplacementPrompt("");
    setReplacementDuration(5);
    setReplacementResolution("720p");
    setReplacementAspectRatio("9:16");
    setNotice("");
    setError("");
  }

  async function submitReference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      const pastedUrls = urlLines(referenceImageUrls);
      const pastedVideoUrls = urlLines(referenceVideoUrls);
      const imageCount = referenceImageCount;
      const videoCount = referenceVideoCount;

      if (!imageCount && !videoCount) {
        throw new Error(
          text(
            "请至少提供一张参考图片或一个参考视频。",
            "Add at least one reference image or video.",
          ),
        );
      }
      if (imageCount > (videoCount ? 4 : 7)) {
        throw new Error(
          videoCount
            ? text(
                "使用视频参考时，参考图片最多 4 张。",
                "You can use up to 4 images when a video reference is included.",
              )
            : text(
                "参考图片最多 7 张。",
                "You can use up to 7 reference images.",
              ),
        );
      }
      if (videoCount > 2) {
        throw new Error(
          text(
            "参考视频最多 2 个。",
            "You can use up to 2 reference videos.",
          ),
        );
      }
      await validateReferenceVideoFiles(referenceVideoFiles, language);
      const [uploadedImageUrls, uploadedVideoUrls] = await Promise.all([
        Promise.all(
          referenceFiles.map((file) => uploadMedia(file, "image", language)),
        ),
        Promise.all(
          referenceVideoFiles.map((file) =>
            uploadMedia(file, "video", language),
          ),
        ),
      ]);
      const images = [...uploadedImageUrls, ...pastedUrls];
      const videos = [...uploadedVideoUrls, ...pastedVideoUrls];

      const response = await fetch("/api/tasks/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:
            String(form.get("title") ?? "").trim() ||
            text("参考生成", "Reference generation"),
          prompt: form.get("prompt"),
          images,
          videos,
          model: "viduq2-pro",
          duration: referenceDuration,
          resolution: form.get("resolution"),
          aspectRatio: referenceAspectRatio,
          bgm: form.get("bgm") === "on",
          offPeak: form.get("offPeak") === "on",
        }),
      });
      const data = await parseApiResponse<{ error?: string }>(
        response,
        text("任务提交失败。", "Could not submit the task."),
        language,
      );
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(
            language,
            data.error,
            "任务提交失败。",
            "Could not submit the task.",
          ),
        );
      }

      setNotice(
        text(
          "参考生成任务已创建，当前输入已保留。",
          "Reference task created. Your current inputs were kept.",
        ),
      );
      await refreshDashboard(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : text("任务提交失败。", "Could not submit the task."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      if (motionVideo) {
        const detectedDuration = await readVideoDuration(motionVideo, language);
        if (detectedDuration < 1.9 || detectedDuration > 30.1) {
          throw new Error(
            text(
              "源动作视频需要在 2 到 30 秒之间。",
              "The source motion video must be between 2 and 30 seconds.",
            ),
          );
        }
      }
      const imageUrl = motionImage
        ? await uploadMedia(motionImage, "image", language)
        : String(form.get("imageUrl") ?? "").trim();
      const videoUrl = motionVideo
        ? await uploadMedia(motionVideo, "video", language)
        : String(form.get("videoUrl") ?? "").trim();

      const response = await fetch("/api/tasks/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:
            String(form.get("title") ?? "").trim() ||
            text("动作迁移", "Motion transfer"),
          imageUrl,
          videoUrl,
          duration: motionDuration,
        }),
      });
      const data = await parseApiResponse<{ error?: string }>(
        response,
        text("任务提交失败。", "Could not submit the task."),
        language,
      );
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(
            language,
            data.error,
            "任务提交失败。",
            "Could not submit the task.",
          ),
        );
      }

      formElement.reset();
      setMotionImage(null);
      setMotionVideo(null);
      setMotionDuration(8);
      setNotice(text("动作迁移任务已创建。", "Motion task created."));
      await refreshDashboard(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : text("任务提交失败。", "Could not submit the task."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReplacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (replacementAnalysisBlocking) {
      setError(
        text(
          "请等待 AI 视频分析成功；失败时请强制再次分析，或关闭分析后提交。",
          "Wait for AI video analysis to succeed. If it fails, force a retry or turn analysis off before submitting.",
        ),
      );
      document.getElementById(videoAnalysisStatusId)?.focus();
      return;
    }
    if (replacementPromptOverLimit) {
      setError(
        text(
          `当前补充提示词不能超过 ${replacementPromptLimit} 个字符。`,
          `The additional prompt cannot exceed ${replacementPromptLimit} characters in the current mode.`,
        ),
      );
      document.getElementById("replacement-prompt")?.focus();
      return;
    }
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      let duration = replacementDuration;

      if (replacementVideo) {
        const detectedDuration = await readVideoDuration(
          replacementVideo,
          language,
        );
        if (detectedDuration < 0.9 || detectedDuration > 8.1) {
          throw new Error(
            text(
              "Q2 Pro 的参考视频最长 8 秒。",
              "Q2 Pro reference videos can be up to 8 seconds.",
            ),
          );
        }
        duration = Math.min(8, Math.max(1, Math.round(detectedDuration)));
        setReplacementDuration(duration);
      }

      const pastedImageUrls = urlLines(replacementImageUrls);
      const imageCount = replacementImages.length + pastedImageUrls.length;
      if (!imageCount || imageCount > 4) {
        throw new Error(
          text(
            "请提供 1 到 4 张同一人物的参考图；近景原视频请至少加入一张清晰面部特写。",
            "Add 1–4 images of the same character. For close-up source video, include at least one clear face close-up.",
          ),
        );
      }
      const imageUrls = [
        ...(
          await Promise.all(
            replacementImages.map((file) =>
              uploadMedia(file, "image", language),
            ),
          )
        ),
        ...pastedImageUrls,
      ];
      const videoUrl = replacementVideo
        ? await ensureReplacementVideoUploaded(replacementVideo)
        : replacementVideoUrl.trim();

      const response = await fetch("/api/tasks/replacement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:
            String(form.get("title") ?? "").trim() ||
            text("人物替换", "Character replacement"),
          imageUrls,
          videoUrl,
          object: replacementObject,
          prompt: replacementPrompt,
          aiAnalysisEnabled: videoAnalysisEnabled,
          duration,
          resolution: replacementResolution,
          aspectRatio: replacementAspectRatio,
          language,
        }),
      });
      const data = await parseApiResponse<{
        error?: string;
      }>(
        response,
        text("任务提交失败。", "Could not submit the task."),
        language,
      );
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(
            language,
            data.error,
            "任务提交失败。",
            "Could not submit the task.",
          ),
        );
      }

      setNotice(
        text(
          "人物参考生成任务已创建，当前输入已保留。",
          "Character-reference task created. Your current inputs were kept.",
        ),
      );
      await refreshDashboard(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : text("任务提交失败。", "Could not submit the task."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="studio-shell">
      <AmbientBackdrop variant="studio" />
      <PasswordSetupReminder
        open={passwordReminderOpen}
        onOpenChange={(open) => {
          setPasswordReminderOpen(open);
          if (!open) setAutoTutorialEnabled(true);
        }}
      />
      <FeatureTutorialDialog
        autoOpen={autoTutorialEnabled}
        defaultMode="replacement"
        dismissStorageKey={TUTORIAL_DISMISS_STORAGE_KEY}
        onStart={selectComposerMode}
        showTrigger={false}
      />

      <Tabs
        className="studio-tabs-root"
        value={primaryMode}
        onValueChange={(value) =>
          selectComposerMode(
            value === "motion" ? "motion" : referenceMode,
          )
        }
      >
        <header className="studio-sidebar">
        <Link
          className="brand-lockup"
          href="/"
          aria-label={text("返回 Vidu 创作台首页", "Back to Vidu Studio home")}
        >
          <span className="brand-mark" aria-hidden="true">
            <Video size={19} color="currentColor" />
          </span>
          <span>{text("Vidu 创作台", "Vidu Studio")}</span>
        </Link>

        <TabsList
          className="sidebar-section"
          aria-label={text("创作方式", "Creation modes")}
        >
          <span className="sidebar-label">{text("创作", "Create")}</span>
          <TabsTab
            className={
              primaryMode === "reference"
                ? "sidebar-item is-active"
                : "sidebar-item"
            }
            value="reference"
          >
            <Video size={20} color="currentColor" />
            <span className="sidebar-item-copy">
              <strong>{text("参考生成", "Reference generation")}</strong>
              <small>{text("人物替换为主", "Replace-first")}</small>
            </span>
          </TabsTab>
          <TabsTab
            className={
              primaryMode === "motion"
                ? "sidebar-item is-active"
                : "sidebar-item"
            }
            value="motion"
          >
            <Task size={20} color="currentColor" />
            <span className="sidebar-item-copy">
              <strong>{text("动作迁移", "Motion transfer")}</strong>
              <small>Motion</small>
            </span>
          </TabsTab>
        </TabsList>

        <div className="studio-toolbar">
          <PreferencesControls compact />
          <Button
            className="icon-button refresh-button"
            variant="outline"
            type="button"
            onClick={() => void refreshDashboard()}
            disabled={refreshing}
            aria-label={text("刷新任务状态", "Refresh task status")}
          >
            <Refresh
              size={20}
              color="currentColor"
              className={refreshing ? "is-spinning" : undefined}
            />
            <span>
              {refreshing
                ? text("刷新中", "Refreshing")
                : text("刷新", "Refresh")}
            </span>
          </Button>
        </div>

        <div className="sidebar-account">
          <span className="sidebar-account-avatar" aria-hidden="true">
            <UserCircle size={20} color="currentColor" />
          </span>
          <div className="sidebar-account-identity">
            <strong>{dashboard.user.displayName}</strong>
            <span>{dashboard.user.email}</span>
          </div>
          <div className="sidebar-account-actions">
            <a href="/account" aria-label={text("打开账户与额度", "Open account and credits")}>
              <Wallet size={15} aria-hidden="true" />
              <span>{text("账户", "Account")}</span>
            </a>
            {canAccessAdmin ? (
              <a href="/admin" aria-label={text("打开用户管理", "Open admin")}>
                <Settings size={15} aria-hidden="true" />
                <span>{text("管理", "Admin")}</span>
              </a>
            ) : null}
            <SignOutLink className="sidebar-signout">
              <Logout size={15} aria-hidden="true" />
              <span>{text("退出", "Sign out")}</span>
            </SignOutLink>
          </div>
        </div>
        </header>

        <section className="studio-main">
        <Card
          className="studio-stats studio-status-deck"
          render={
            <section
              aria-label={text(
                "额度与任务状态",
                "Credit and task status",
              )}
            />
          }
        >
          <CardPanel className="studio-status-grid">
            <article className="status-metric is-credit">
              <div className="status-metric-copy">
                <span className="status-metric-label">
                  <Wallet size={18} color="currentColor" />
                  {text("可用额度", "Available credits")}
                </span>
                <div className="status-metric-value">
                  <strong>{dashboard.user.creditBalance.toLocaleString()}</strong>
                  <small>credits</small>
                </div>
              </div>
            </article>

            <article className="status-metric is-active">
              <div className="status-metric-heading">
                <span className="status-metric-label">
                  <Task size={18} color="currentColor" />
                  {text("生成并发", "Generation slots")}
                </span>
                <strong>
                  {dashboard.stats.active}
                  <span> / {dashboard.user.concurrencyLimit}</span>
                </strong>
              </div>
              <Progress
                className="concurrency-progress"
                value={dashboard.stats.active}
                max={dashboard.user.concurrencyLimit}
                aria-label={text(
                  `正在使用 ${dashboard.stats.active} 个，共 ${dashboard.user.concurrencyLimit} 个并行槽位`,
                  `${dashboard.stats.active} of ${dashboard.user.concurrencyLimit} parallel slots in use`,
                )}
              >
                <ProgressTrack>
                  <ProgressIndicator />
                </ProgressTrack>
              </Progress>
              <div className="concurrency-summary">
                <small>
                  {text(
                    `生成中 ${dashboard.stats.active}`,
                    `${dashboard.stats.active} generating`,
                  )}
                </small>
                <span className={dashboard.stats.queued ? "has-queue" : undefined}>
                  {text(
                    `等待 ${dashboard.stats.queued}`,
                    `${dashboard.stats.queued} waiting`,
                  )}
                </span>
              </div>
            </article>

            <article className="status-metric is-completed">
              <span className="status-metric-label">
                <Video size={18} color="currentColor" />
                {text("最近完成", "Completed")}
              </span>
              <div className="status-metric-value">
                <strong>{dashboard.stats.completed}</strong>
                <small>{text("累计生成结果", "generated results")}</small>
              </div>
            </article>
          </CardPanel>
        </Card>

        <div className="workspace-grid">
          <Card className="composer-panel" render={<section />}>
            <CardHeader className="composer-heading">
              <div>
                <h2>{modeDetails[primaryMode].title}</h2>
              </div>
              <div className="composer-actions">
                {mode === "replacement" || mode === "motion" ? (
                  <FeatureTutorialDialog
                    defaultMode={mode}
                    onStart={selectComposerMode}
                    triggerClassName="composer-tutorial-trigger"
                    triggerVariant="ghost"
                  />
                ) : null}
                <span className="credit-estimate">
                  {mode === "replacement"
                    ? text(
                        "Q2 Pro 参考生成 · 按清晰度预留",
                        "Q2 Pro reference · Estimated by resolution",
                      )
                    : modeDetails[mode].estimate}
                </span>
                {mode === "reference" || mode === "replacement" ? (
                  <Button
                    className="clear-composer-button"
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={
                      mode === "reference"
                        ? clearReferenceComposer
                        : clearReplacementComposer
                    }
                    disabled={submitting}
                  >
                    {text("清空输入", "Clear inputs")}
                  </Button>
                ) : null}
              </div>
            </CardHeader>

            <CardPanel className="composer-body">
            {error ? (
              <p className="form-message is-error" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="form-message is-success" aria-live="polite">
                {notice}
              </p>
            ) : null}

            <TabsPanel className="composer-tab-panel" value={primaryMode}>
              {primaryMode === "reference" ? (
                <Tabs
                  className="reference-submode-tabs"
                  value={referenceMode}
                  onValueChange={(value) =>
                    selectComposerMode(value as ReferenceComposerMode)
                  }
                >
                  <TabsList
                    className="reference-submode-list"
                    aria-label={text(
                      "参考生成子模式",
                      "Reference generation modes",
                    )}
                  >
                    <TabsTab value="replacement">
                      <VideoReplace size={17} color="currentColor" />
                      <span>
                        <strong>{text("人物替换", "Replace person")}</strong>
                        <small>
                          {text("主要模式 · 推荐", "Primary · Recommended")}
                        </small>
                      </span>
                    </TabsTab>
                    <TabsTab value="reference">
                      <Video size={17} color="currentColor" />
                      <span>
                        <strong>
                          {text("自由参考生成", "Free reference generation")}
                        </strong>
                        <small>
                          {text("多图 · 多视频 · 提示词", "Images · Video · Prompt")}
                        </small>
                      </span>
                    </TabsTab>
                  </TabsList>

                  <TabsPanel
                    className="reference-submode-panel"
                    value="reference"
                  >
                    <form
                      className="creation-form"
                      ref={referenceFormRef}
                      onSubmit={submitReference}
                    >
                <label>
                  {text("名称（可选）", "Name (optional)")}
                  <input
                    name="title"
                    placeholder={text(
                      "例如：同一角色的雨夜追逐镜头",
                      "Example: Rainy-night chase with the same character",
                    )}
                    maxLength={80}
                  />
                </label>

                <div className="reference-source-grid">
                <fieldset className="reference-source">
                  <legend>
                    <span className="reference-source-label">
                      <span>{text("图片参考", "Image references")}</span>
                      <span className="source-helper">
                        {text(
                          "用图片保持人物、商品或场景的一致性。",
                          "Keep a person, product, or scene consistent with images.",
                        )}
                      </span>
                    </span>
                    <small
                      className={
                        referenceImageCount > referenceImageLimit
                          ? "is-over-limit"
                          : undefined
                      }
                    >
                      {referenceImageCount} / {referenceImageLimit}
                    </small>
                  </legend>
                  <div className="media-input-grid">
                    <label className="upload-zone">
                      <CloudUpload size={24} color="currentColor" />
                      <strong>{text("添加图片", "Add images")}</strong>
                      <span>
                        {text(
                          "JPG · PNG · WebP · 最大 50MB",
                          "JPG · PNG · WebP · Up to 50MB",
                        )}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={(event) =>
                          setReferenceFiles(
                            fileList(event).slice(
                              0,
                              referenceImageLimit,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="url-input">
                      {text("图片链接（每行一个）", "Image URLs (one per line)")}
                      <textarea
                        name="imageUrls"
                        rows={3}
                        value={referenceImageUrls}
                        onChange={(event) =>
                          setReferenceImageUrls(event.target.value)
                        }
                        placeholder={"https://example.com/subject-01.jpg\nhttps://example.com/subject-02.jpg"}
                      />
                    </label>
                  </div>
                  {referenceFiles.length ? (
                    <ul
                      className="file-thumbnail-list"
                      aria-label={text(
                        "已选择的参考图片",
                        "Selected reference images",
                      )}
                    >
                      {referenceFiles.map((file, index) => (
                        <li key={`${file.name}-${file.lastModified}`}>
                          <ImageFilePreview
                            file={file}
                            className="file-thumbnail-media"
                            label={text(
                              `${file.name} 图片缩略图`,
                              `${file.name} image thumbnail`,
                            )}
                          />
                          <span className="file-thumbnail-meta">
                            <span title={file.name}>{file.name}</span>
                            <Button
                              variant="ghost"
                              size="xs"
                              type="button"
                              aria-label={text(
                                `移除图片 ${file.name}`,
                                `Remove image ${file.name}`,
                              )}
                              onClick={() =>
                                setReferenceFiles((current) =>
                                  current.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  ),
                                )
                              }
                            >
                              {text("移除", "Remove")}
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </fieldset>

                <fieldset className="reference-source">
                  <legend>
                    <span className="reference-source-label">
                      <span>{text("视频参考", "Video references")}</span>
                      <span className="source-helper">
                        {text(
                          "Q2 Pro · 1 个最长 8 秒，或 2 个各不超过 5 秒",
                          "Q2 Pro · One video up to 8s, or two videos up to 5s each",
                        )}
                      </span>
                    </span>
                    <small
                      className={
                        referenceVideoCount > 2 ? "is-over-limit" : undefined
                      }
                    >
                      {referenceVideoCount} / 2
                    </small>
                  </legend>
                  <div className="media-input-grid">
                    <label className="upload-zone">
                      <CloudUpload size={24} color="currentColor" />
                      <strong>{text("添加参考视频", "Add reference videos")}</strong>
                      <span>
                        {text(
                          "MP4 · MOV · AVI · 最大 50MB",
                          "MP4 · MOV · AVI · Up to 50MB",
                        )}
                      </span>
                      <input
                        type="file"
                        accept="video/mp4,video/quicktime,video/x-msvideo"
                        multiple
                        onChange={(event) => {
                          const selected = fileList(event).slice(0, 2);
                          setReferenceVideoFiles(selected);
                          if (selected.length) {
                            setReferenceFiles((current) => current.slice(0, 4));
                          } else if (!urlLines(referenceVideoUrls).length) {
                            setReferenceAspectRatio("9:16");
                          }
                        }}
                      />
                    </label>
                    <label className="url-input">
                      {text("视频链接（每行一个）", "Video URLs (one per line)")}
                      <textarea
                        name="videoUrls"
                        rows={3}
                        value={referenceVideoUrls}
                        onChange={(event) => {
                          const nextUrls = event.target.value;
                          setReferenceVideoUrls(nextUrls);
                          if (urlLines(nextUrls).length) {
                            setReferenceFiles((current) => current.slice(0, 4));
                          } else if (!referenceVideoFiles.length) {
                            setReferenceAspectRatio("9:16");
                          }
                        }}
                        placeholder={"https://example.com/reference-01.mp4\nhttps://example.com/reference-02.mp4"}
                      />
                    </label>
                  </div>
                  {referenceVideoFiles.length ? (
                    <ul
                      className="file-thumbnail-list"
                      aria-label={text(
                        "已选择的参考视频",
                        "Selected reference videos",
                      )}
                    >
                      {referenceVideoFiles.map((file, index) => (
                        <li key={`${file.name}-${file.lastModified}`}>
                          <VideoFilePreview
                            file={file}
                            className="file-thumbnail-media"
                            label={text(
                              `${file.name} 视频缩略图`,
                              `${file.name} video thumbnail`,
                            )}
                          />
                          <span className="file-thumbnail-meta">
                            <span title={file.name}>{file.name}</span>
                            <Button
                              variant="ghost"
                              size="xs"
                              type="button"
                              aria-label={text(
                                `移除视频 ${file.name}`,
                                `Remove video ${file.name}`,
                              )}
                              onClick={() => {
                                const nextFiles = referenceVideoFiles.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                );
                                setReferenceVideoFiles(nextFiles);
                                if (
                                  !nextFiles.length &&
                                  !urlLines(referenceVideoUrls).length
                                ) {
                                  setReferenceAspectRatio("9:16");
                                }
                              }}
                            >
                              {text("移除", "Remove")}
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </fieldset>
                </div>

                <div className="prompt-field">
                  <div className="prompt-field-heading">
                    <label htmlFor="reference-prompt">
                      {text("提示词", "Prompt")} <b aria-hidden="true">*</b>
                    </label>
                    <div
                      className="prompt-presets"
                      aria-label={text("提示词预设", "Prompt presets")}
                    >
                      {referencePromptPresets.map((preset) => (
                        <Button
                          key={preset.label}
                          variant="secondary"
                          size="xs"
                          type="button"
                          aria-pressed={referencePrompt === preset.prompt}
                          onClick={() => setReferencePrompt(preset.prompt)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    id="reference-prompt"
                    name="prompt"
                    rows={3}
                    required
                    maxLength={5000}
                    value={referencePrompt}
                    onChange={(event) => setReferencePrompt(event.target.value)}
                    placeholder={text(
                      "描述动作、镜头、场景和节奏",
                      "Describe the action, camera, scene, and pacing",
                    )}
                  />
                </div>

                <div className="generation-settings-row">
                  <DurationSlider
                    id="reference-duration"
                    label={text("时长", "Duration")}
                    name="duration"
                    min={1}
                    max={10}
                    value={referenceDuration}
                    onChange={setReferenceDuration}
                    hint={text(
                      "添加参考视频后，将自动采用第一个视频的时长。",
                      "The first reference video's duration will be used automatically.",
                    )}
                  />

                  <div className="form-grid form-grid-two">
                    <label>
                      {text("清晰度", "Resolution")}
                      <select
                        name="resolution"
                        value={referenceResolution}
                        onChange={(event) =>
                          setReferenceResolution(
                            event.target.value as Resolution,
                          )
                        }
                      >
                        <option value="540p">540p</option>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                      </select>
                    </label>
                    <label>
                      {text("比例", "Aspect ratio")}
                      <select
                        name="aspectRatio"
                        value={referenceAspectRatio}
                        onChange={(event) =>
                          setReferenceAspectRatio(
                            event.target.value as AspectRatio,
                          )
                        }
                      >
                        <option value="16:9">
                          {text("16:9 横屏", "16:9 Landscape")}
                        </option>
                        <option value="9:16">
                          {text("9:16 竖屏", "9:16 Portrait")}
                        </option>
                        <option value="4:3">
                          {text("4:3 横屏", "4:3 Landscape")}
                        </option>
                        <option value="3:4">
                          {text("3:4 竖屏", "3:4 Portrait")}
                        </option>
                        <option value="1:1">
                          {text("1:1 方形", "1:1 Square")}
                        </option>
                      </select>
                      <span className="field-help">
                        {text(
                          "默认竖屏；添加参考视频后自动匹配横竖方向。",
                          "Defaults to portrait and follows the first reference video's orientation.",
                        )}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="form-action-row">
                  <div className="toggle-row">
                    <label>
                      <input type="checkbox" name="bgm" />
                      <span>{text("生成配乐", "Generate soundtrack")}</span>
                    </label>
                    <label>
                      <input type="checkbox" name="offPeak" />
                      <span>{text("错峰生成", "Off-peak generation")}</span>
                    </label>
                  </div>

                  <Button
                    className="submit-button"
                    size="lg"
                    type="submit"
                    loading={submitting}
                  >
                    {submitting ? (
                      text("正在创建", "Creating")
                    ) : (
                      <>
                        <Play size={18} color="currentColor" />
                        <span>{text("开始生成", "Generate")}</span>
                        <span
                          className="submit-credit-estimate"
                          key={referenceEstimatedCredits}
                        >
                          {text(
                            `预计 ${referenceEstimatedCredits} credits`,
                            `Est. ${referenceEstimatedCredits} credits`,
                          )}
                        </span>
                      </>
                    )}
                  </Button>
                </div>
                    </form>
                  </TabsPanel>

                  <TabsPanel
                    className="reference-submode-panel"
                    value="replacement"
                  >
                    <form
                      className="creation-form"
                      ref={replacementFormRef}
                      onSubmit={submitReplacement}
                    >
                <label>
                  {text("名称（可选）", "Name (optional)")}
                  <input
                    name="title"
                    placeholder={text(
                      "例如：将主角替换为品牌代言人",
                      "Example: Replace the lead with a brand ambassador",
                    )}
                    maxLength={80}
                  />
                </label>


                <div className="paired-media-sources">
                <fieldset className="reference-source replacement-source media-source-card">
                  <legend>{text("人物参考图（1–4 张）", "Character images (1–4)")}</legend>
                  <p className="field-help">
                    {text(
                      "请上传同一个人物；近景原视频至少加入一张清晰、无遮挡、脸部占比较大的特写，再补充全身或多角度图。只有全身小脸参考时，Q2 Pro 更容易沿用原视频人物。",
                      "Use images of the same person. For close-up source video, include at least one clear, unobstructed face close-up, then add full-body or alternate angles. A distant face alone makes Q2 Pro more likely to retain the source person.",
                    )}
                  </p>
                  <div className="media-input-grid">
                    <div className="replacement-image-picker">
                      {replacementImages.length ? (
                        <div
                          className="replacement-image-list"
                          aria-label={text(
                            "已选择的人物参考图",
                            "Selected character reference images",
                          )}
                        >
                          {replacementImages.map((file, index) => (
                            <div
                              className="replacement-image-item"
                              key={fileIdentity(file)}
                            >
                              <ImageFilePreview
                                file={file}
                                className="replacement-image-preview"
                                label={text(
                                  `第 ${index + 1} 张人物参考图预览`,
                                  `Character reference image ${index + 1}`,
                                )}
                              />
                              <Button
                                className="replacement-image-remove"
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={text(
                                  `删除第 ${index + 1} 张人物参考图`,
                                  `Remove character reference image ${index + 1}`,
                                )}
                                title={text("删除这张图片", "Remove this image")}
                                onClick={() =>
                                  setReplacementImages((current) =>
                                    current.filter(
                                      (candidate) =>
                                        fileIdentity(candidate) !==
                                        fileIdentity(file),
                                    ),
                                  )
                                }
                              >
                                ×
                              </Button>
                              <span className="replacement-image-caption">
                                <b>{index + 1}</b>
                                <span title={file.name}>{file.name}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {replacementImages.length < 4 ? (
                        <label
                          className={`upload-zone replacement-image-add ${
                            replacementImages.length ? "" : "is-empty"
                          }`}
                        >
                          <CloudUpload size={24} color="currentColor" />
                          <strong>
                            {replacementImages.length
                              ? text("继续添加图片", "Add more images")
                              : text("选择人物图片", "Choose character images")}
                          </strong>
                          <span>
                            {replacementImages.length
                              ? text(
                                  `已选择 ${replacementImages.length}/4 张，可继续单张或多张添加`,
                                  `${replacementImages.length}/4 selected · Add one or several more`,
                                )
                              : text(
                                  "支持单张或多张选择，JPG · PNG · WebP · 每张最大 50MB",
                                  "Choose one or several · JPG · PNG · WebP · Up to 50MB each",
                                )}
                          </span>
                          <input
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(event) => {
                              const selectedImages = fileList(event);
                              event.currentTarget.value = "";
                              const existingFiles = new Set(
                                replacementImages.map(fileIdentity),
                              );
                              const newImages = selectedImages.filter((file) => {
                                const identity = fileIdentity(file);
                                if (existingFiles.has(identity)) return false;
                                existingFiles.add(identity);
                                return true;
                              });
                              const availableSlots = 4 - replacementImages.length;
                              const acceptedImages = newImages.slice(
                                0,
                                availableSlots,
                              );
                              setReplacementImages([
                                ...replacementImages,
                                ...acceptedImages,
                              ]);
                              if (newImages.length > acceptedImages.length) {
                                setError(
                                  text(
                                    "人物参考图最多 4 张，超出的图片没有添加。",
                                    "Character references support up to 4 images; extra images were not added.",
                                  ),
                                );
                              }
                            }}
                          />
                        </label>
                      ) : (
                        <p className="replacement-image-limit" role="status">
                          {text(
                            "已添加 4/4 张。删除任意一张后可继续添加。",
                            "4/4 images added. Remove one to add another.",
                          )}
                        </p>
                      )}
                    </div>
                    <details className="media-url-disclosure">
                      <summary>
                        <span>{text("或粘贴图片链接", "Or paste image URLs")}</span>
                        <small>URL</small>
                      </summary>
                      <div className="media-url-body">
                        <label className="url-input">
                          {text("图片链接（每行一个）", "Image URLs (one per line)")}
                          <textarea
                            name="imageUrls"
                            rows={3}
                            value={replacementImageUrls}
                            onChange={(event) =>
                              setReplacementImageUrls(event.target.value)
                            }
                            placeholder={"https://example.com/face.jpg\nhttps://example.com/full-body.jpg"}
                          />
                        </label>
                      </div>
                    </details>
                  </div>
                </fieldset>

                <fieldset className="reference-source replacement-source media-source-card">
                  <legend>{text("原视频", "Source video")}</legend>
                  <p className="field-help">
                    {text(
                      "保留这段视频的动作、构图、镜头运动、背景和光照。",
                      "Preserve the source action, framing, camera motion, background, and lighting.",
                    )}
                  </p>
                  <div className="media-input-grid">
                    <label
                      className={`upload-zone ${
                        replacementVideo ? "has-preview" : ""
                      }`}
                    >
                      {replacementVideo ? (
                        <>
                          <VideoFilePreview
                            file={replacementVideo}
                            label={text(
                              "待替换原视频预览",
                              "Source video preview",
                            )}
                            onDuration={updateReplacementDurationFromSource}
                            onAspectRatio={setReplacementAspectRatio}
                          />
                          <span className="upload-preview-copy">
                            <strong>{replacementVideo.name}</strong>
                            <span>{text("点击更换", "Click to replace")}</span>
                          </span>
                        </>
                      ) : (
                        <>
                          <CloudUpload size={24} color="currentColor" />
                          <strong>{text("选择原视频", "Choose source video")}</strong>
                          <span>
                            {text(
                              "MP4 / MOV / AVI，最长 8 秒",
                              "MP4 / MOV / AVI, up to 8s",
                            )}
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="video/mp4,video/quicktime,video/x-msvideo"
                        onChange={(event) => {
                          const nextVideo = event.target.files?.[0] ?? null;
                          changeReplacementVideo(nextVideo);
                          if (!nextVideo && !replacementVideoUrl.trim()) {
                            setReplacementAspectRatio("9:16");
                          }
                        }}
                      />
                    </label>
                    <details className="media-url-disclosure">
                      <summary>
                        <span>{text("或粘贴视频链接", "Or paste a video URL")}</span>
                        <small>URL</small>
                      </summary>
                      <div className="media-url-body">
                        <label className="url-input">
                          {text("视频链接", "Video URL")}
                          <textarea
                            name="videoUrl"
                            rows={2}
                            value={replacementVideoUrl}
                            onChange={(event) => {
                              const nextUrl = event.target.value;
                              if (!replacementVideo) {
                                invalidateReplacementAnalysis();
                              }
                              setReplacementVideoUrl(nextUrl);
                              if (!nextUrl.trim() && !replacementVideo) {
                                setReplacementAspectRatio("9:16");
                              }
                            }}
                            placeholder="https://example.com/source.mp4"
                          />
                        </label>
                      </div>
                    </details>
                  </div>
                  <section
                    className="video-analysis-panel"
                    data-state={
                      videoAnalysisEnabled
                        ? replacementAnalysis.status
                        : "disabled"
                    }
                    aria-busy={replacementAnalysisBusy || undefined}
                  >
                    <div className="video-analysis-heading">
                      <div>
                        <label htmlFor="replacement-video-analysis">
                          {text("AI 视频分析", "AI video analysis")}
                        </label>
                        <p id={videoAnalysisDescriptionId}>
                          {text(
                            "AI 分析仅支持已上传到本站的视频；成功后解锁提交，失败可强制重试或关闭分析。",
                            "AI analysis requires a video uploaded here. Submission unlocks on success; force a retry after failure or turn analysis off.",
                          )}
                        </p>
                      </div>
                      <Switch
                        id="replacement-video-analysis"
                        checked={videoAnalysisEnabled}
                        disabled={submitting}
                        onCheckedChange={changeVideoAnalysisEnabled}
                        aria-describedby={`${videoAnalysisDescriptionId} ${videoAnalysisStatusId}`}
                      />
                    </div>

                    <div
                      id={videoAnalysisStatusId}
                      className="video-analysis-status"
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                      tabIndex={-1}
                    >
                      {!videoAnalysisEnabled ? (
                        <p>
                          {text(
                            "已关闭，将使用默认提示词提交。",
                            "Off. The default prompt will be used.",
                          )}
                        </p>
                      ) : !replacementVideo && !firstReplacementVideoUrl ? (
                        <p>
                          {text(
                            "添加原视频后将自动分析。",
                            "Analysis starts automatically after a source video is added.",
                          )}
                        </p>
                      ) : !replacementVideo &&
                        !validHttpsUrl(firstReplacementVideoUrl) ? (
                        <p>
                          {text(
                            "请输入有效的 HTTPS 视频链接。",
                            "Enter a valid HTTPS video URL.",
                          )}
                        </p>
                      ) : replacementAnalysis.status === "uploading" ? (
                        <p>
                          <span
                            className="video-analysis-spinner"
                            aria-hidden="true"
                          />
                          {text(
                            "正在准备分析素材；分析成功前暂不可提交。",
                            "Preparing the analysis source; submission stays locked until it succeeds.",
                          )}
                        </p>
                      ) : replacementAnalysis.status === "analyzing" ? (
                        <p>
                          <span
                            className="video-analysis-spinner"
                            aria-hidden="true"
                          />
                          {text(
                            "正在提取构图、运镜、动作、关键物体与接触关系；成功后自动解锁提交。",
                            "Extracting compact composition, camera, action, object, and contact locks; submission unlocks on success.",
                          )}
                        </p>
                      ) : replacementAnalysis.status === "ready" ? (
                        <div className="video-analysis-summary">
                          <strong>
                            {replacementAnalysis.cacheHit
                              ? text(
                                  "已复用这段视频的分析",
                                  "Reused this video's analysis",
                                )
                              : text(
                                  "已生成专属内容约束",
                                  "Source-specific constraints are ready",
                                )}
                          </strong>
                          <p>
                            {
                              replacementAnalysis.summary.overview[
                                language
                              ]
                            }
                          </p>
                          {replacementAnalysis.summary.preserve.length ? (
                            <div>
                              <b>{text("重点保留", "Preserve")}</b>
                              <ul>
                                {replacementAnalysis.summary.preserve
                                  .slice(0, 3)
                                  .map((item, index) => (
                                    <li key={`${item.en}-${index}`}>
                                      {item[language]}
                                    </li>
                                  ))}
                              </ul>
                            </div>
                          ) : null}
                          {replacementAnalysis.summary.risks.length ? (
                            <div>
                              <b>{text("注意", "Watch for")}</b>
                              <ul>
                                {replacementAnalysis.summary.risks
                                  .slice(0, 2)
                                  .map((item, index) => (
                                    <li key={`${item.en}-${index}`}>
                                      {item[language]}
                                    </li>
                                  ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : replacementAnalysis.status === "failed" ? (
                        <p>
                          {replacementAnalysis.message}{" "}
                          {text(
                            "请强制再次分析，或关闭 AI 视频分析后提交。",
                            "Force another analysis, or turn AI video analysis off before submitting.",
                          )}
                        </p>
                      ) : (
                        <p>
                          {text(
                            "正在准备分析…",
                            "Preparing analysis…",
                          )}
                        </p>
                      )}
                    </div>
                    {videoAnalysisEnabled &&
                    replacementHasAnalyzableSource &&
                    !replacementAnalysisBusy ? (
                      <div className="video-analysis-actions">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={submitting}
                          onClick={retryReplacementAnalysis}
                        >
                          <Refresh size={14} color="currentColor" />
                          {replacementAnalysis.status === "failed"
                            ? text("强制再次分析", "Force reanalysis")
                            : text("重新分析", "Reanalyze")}
                        </Button>
                      </div>
                    ) : null}
                  </section>
                </fieldset>
                </div>

                <label>
                  {text("要替换的人物", "Person to replace")}{" "}
                  <b aria-hidden="true">*</b>
                  <input
                    name="object"
                    required
                    maxLength={100}
                    value={replacementObject}
                    onChange={(event) => setReplacementObject(event.target.value)}
                    placeholder={text(
                      "例如：画面中央穿黑色上衣的人",
                      "Example: The person in black at the center",
                    )}
                  />
                  <span className="field-help">
                    {text(
                      "多人画面时，用位置或衣着说明目标人物。",
                      "For group scenes, identify the target by position or clothing.",
                    )}
                  </span>
                </label>

                <div className="prompt-field">
                  <div className="prompt-field-heading">
                    <label htmlFor="replacement-prompt">
                      {text("补充提示词（可选）", "Additional prompt (optional)")}
                    </label>
                    <small
                      className={`prompt-character-count ${
                        replacementPromptOverLimit ? "is-over-limit" : ""
                      }`}
                      aria-live="polite"
                    >
                      {replacementPrompt.length}/{replacementPromptLimit}
                    </small>
                  </div>
                  <textarea
                    id="replacement-prompt"
                    name="prompt"
                    rows={3}
                    maxLength={replacementPromptLimit}
                    value={replacementPrompt}
                    onChange={(event) => setReplacementPrompt(event.target.value)}
                    aria-describedby={replacementPromptHelpId}
                    aria-invalid={replacementPromptOverLimit || undefined}
                    placeholder={text(
                      "补充人物与原场景融合所需的少量约束",
                      "Add only constraints specific to this source",
                    )}
                  />
                  <span
                    id={replacementPromptHelpId}
                    className={`field-help ${
                      replacementPromptOverLimit ? "is-error" : ""
                    }`}
                  >
                    {replacementPromptOverLimit
                      ? text(
                          `当前模式最多允许 ${replacementPromptLimit} 个字符；已有内容不会被截断。`,
                          `This mode allows up to ${replacementPromptLimit} characters. Existing text was not truncated.`,
                        )
                      : null}
                    {replacementPromptOverLimit ? " " : null}
                    {text(
                      "Q2 Pro 人物参考模板已自动启用；这里只填写本次素材特有的补充要求。",
                      "The Q2 Pro character-reference template is applied automatically; only add source-specific constraints here.",
                    )}
                  </span>
                </div>

                <DurationSlider
                  id="replacement-duration"
                  label={text("源视频时长", "Source duration")}
                  name="duration"
                  min={1}
                  max={8}
                  value={replacementDuration}
                  onChange={setReplacementDuration}
                  hint={text(
                    "上传后自动读取，并作为 Q2 Pro 输出时长与额度估算依据。",
                    "Detected on upload and used for Q2 Pro duration and credit estimation.",
                  )}
                />

                  <div className="form-grid form-grid-two">
                    <label>
                      {text("清晰度", "Resolution")}
                      <select
                        name="resolution"
                        value={replacementResolution}
                        onChange={(event) =>
                          setReplacementResolution(
                            event.target.value as Resolution,
                          )
                        }
                      >
                        <option value="540p">540p</option>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                      </select>
                    </label>
                    <label>
                      {text("比例", "Aspect ratio")}
                      <select
                        name="aspectRatio"
                        value={replacementAspectRatio}
                        onChange={(event) =>
                          setReplacementAspectRatio(
                            event.target.value as AspectRatio,
                          )
                        }
                      >
                        <option value="16:9">
                          {text("16:9 横屏", "16:9 Landscape")}
                        </option>
                        <option value="9:16">
                          {text("9:16 竖屏", "9:16 Portrait")}
                        </option>
                        <option value="4:3">
                          {text("4:3 横屏", "4:3 Landscape")}
                        </option>
                        <option value="3:4">
                          {text("3:4 竖屏", "3:4 Portrait")}
                        </option>
                        <option value="1:1">
                          {text("1:1 方形", "1:1 Square")}
                        </option>
                      </select>
                      <span className="field-help">
                        {text(
                          "默认竖屏；添加原视频后自动匹配横竖方向。",
                          "Defaults to portrait and follows the source video's orientation.",
                        )}
                      </span>
                    </label>
                  </div>

                <Button
                  className="submit-button"
                  size="lg"
                  type="submit"
                  loading={submitting}
                  disabled={replacementAnalysisBlocking}
                  aria-describedby={
                    replacementAnalysisBlocking
                      ? videoAnalysisStatusId
                      : undefined
                  }
                >
                  {submitting ? (
                    text("正在创建", "Creating")
                  ) : (
                    <>
                      <VideoReplace size={18} color="currentColor" />
                      <span>{text("开始替换", "Replace person")}</span>
                      <span
                        className="submit-credit-estimate"
                        key={replacementEstimatedCredits}
                      >
                        {text(
                          `预计 ${replacementEstimatedCredits} credits`,
                          `Est. ${replacementEstimatedCredits} credits`,
                        )}
                      </span>
                    </>
                  )}
                </Button>
                    </form>
                  </TabsPanel>
                </Tabs>
              ) : (
              <form className="creation-form" onSubmit={submitMotion}>
                <label>
                  {text("名称（可选）", "Name (optional)")}
                  <input
                    name="title"
                    placeholder={text(
                      "例如：街舞练习",
                      "Example: Street dance practice",
                    )}
                    maxLength={80}
                  />
                </label>

                <div className="paired-media-sources">
                <fieldset className="reference-source motion-source media-source-card">
                  <legend>{text("角色图片", "Character image")}</legend>
                  <p className="field-help">
                    {text(
                      "选择一张正面、清晰的单人图片。",
                      "Choose a clear, front-facing image of one person.",
                    )}
                  </p>
                  <div className="media-input-grid">
                    <label
                      className={`upload-zone ${
                        motionImage ? "has-preview" : ""
                      }`}
                    >
                      {motionImage ? (
                        <>
                          <ImageFilePreview file={motionImage} />
                          <span className="upload-preview-copy">
                            <strong>{motionImage.name}</strong>
                            <span>{text("点击更换", "Click to replace")}</span>
                          </span>
                        </>
                      ) : (
                        <>
                          <CloudUpload size={24} color="currentColor" />
                          <strong>{text("选择角色图片", "Choose character image")}</strong>
                          <span>
                            {text(
                              "JPG · PNG · WebP · 最大 5MB",
                              "JPG · PNG · WebP · Up to 5MB",
                            )}
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) =>
                          setMotionImage(event.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                    <details className="media-url-disclosure">
                      <summary>
                        <span>{text("或粘贴图片链接", "Or paste an image URL")}</span>
                        <small>URL</small>
                      </summary>
                      <div className="media-url-body">
                        <label className="url-input motion-url-input">
                          {text("图片链接", "Image URL")}
                          <textarea
                            name="imageUrl"
                            rows={2}
                            placeholder="https://example.com/character.jpg"
                          />
                        </label>
                      </div>
                    </details>
                  </div>
                </fieldset>

                <fieldset className="reference-source motion-source media-source-card">
                  <legend>{text("动作视频", "Motion video")}</legend>
                  <p className="field-help">
                    {text(
                      "角色会跟随视频中的动作与节奏。",
                      "The character follows the source motion and rhythm.",
                    )}
                  </p>
                  <div className="media-input-grid">
                    <label
                      className={`upload-zone ${
                        motionVideo ? "has-preview" : ""
                      }`}
                    >
                      {motionVideo ? (
                        <>
                          <VideoFilePreview
                            file={motionVideo}
                            onDuration={updateMotionDurationFromSource}
                          />
                          <span className="upload-preview-copy">
                            <strong>{motionVideo.name}</strong>
                            <span>{text("点击更换", "Click to replace")}</span>
                          </span>
                        </>
                      ) : (
                        <>
                          <CloudUpload size={24} color="currentColor" />
                          <strong>{text("选择动作视频", "Choose motion video")}</strong>
                          <span>
                            {text(
                              "MP4 / MOV / AVI，2-30 秒",
                              "MP4 / MOV / AVI, 2-30s",
                            )}
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="video/mp4,video/quicktime,video/x-msvideo"
                        onChange={(event) =>
                          setMotionVideo(event.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                    <details className="media-url-disclosure">
                      <summary>
                        <span>{text("或粘贴视频链接", "Or paste a video URL")}</span>
                        <small>URL</small>
                      </summary>
                      <div className="media-url-body">
                        <label className="url-input motion-url-input">
                          {text("视频链接", "Video URL")}
                          <textarea
                            name="videoUrl"
                            rows={2}
                            placeholder="https://example.com/dance.mp4"
                          />
                        </label>
                      </div>
                    </details>
                  </div>
                </fieldset>
                </div>

                <DurationSlider
                  id="motion-duration"
                  label={text("视频时长", "Video duration")}
                  name="duration"
                  min={2}
                  max={30}
                  value={motionDuration}
                  onChange={setMotionDuration}
                  hint={text(
                    "上传后自动设置，用于估算本次消耗。",
                    "Detected automatically after upload for credit estimation.",
                  )}
                />

                <Button
                  className="submit-button"
                  size="lg"
                  type="submit"
                  loading={submitting}
                >
                  {submitting ? (
                    text("正在创建", "Creating")
                  ) : (
                    <>
                      <Play size={18} color="currentColor" />
                      <span>{text("开始生成", "Generate")}</span>
                      <span
                        className="submit-credit-estimate"
                        key={motionEstimatedCredits}
                      >
                        {text(
                          `预计 ${motionEstimatedCredits} credits`,
                          `Est. ${motionEstimatedCredits} credits`,
                        )}
                      </span>
                    </>
                  )}
                </Button>
              </form>
              )}
            </TabsPanel>
            </CardPanel>
          </Card>

          <div className="queue-column">
            <Card className="queue-panel" render={<aside />}>
              <CardHeader className="queue-heading">
                <div>
                  <h2>{text("最近任务", "Recent tasks")}</h2>
                </div>
                <div className="queue-heading-actions">
                  <span className="queue-count">{dashboard.tasks.length}</span>
                  <AlertDialog
                    open={clearHistoryOpen}
                    onOpenChange={(open) => {
                      setClearHistoryOpen(open);
                      if (open) setClearHistoryError("");
                    }}
                  >
                    <AlertDialogTrigger
                      render={
                        <Button
                          className="history-clear-trigger"
                          variant="ghost"
                          size="xs"
                          disabled={dashboard.stats.history === 0}
                        />
                      }
                    >
                      {text("清空历史", "Clear history")}
                    </AlertDialogTrigger>
                    <AlertDialogPopup>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {text("清空历史任务？", "Clear task history?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {text(
                            `将永久移除 ${dashboard.stats.history} 条已完成或失败的记录。等待中和生成中的任务会保留，此操作无法撤销。`,
                            `This permanently removes ${dashboard.stats.history} completed or failed records. Waiting and generating tasks will be kept. This cannot be undone.`,
                          )}
                        </AlertDialogDescription>
                        {clearHistoryError ? (
                          <p className="alert-dialog-error" role="alert">
                            {clearHistoryError}
                          </p>
                        ) : null}
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogClose
                          render={
                            <Button
                              variant="ghost"
                              disabled={clearingHistory}
                            />
                          }
                        >
                          {text("取消", "Cancel")}
                        </AlertDialogClose>
                        <Button
                          variant="destructive"
                          onClick={() => void clearHistory()}
                          loading={clearingHistory}
                        >
                          {clearingHistory
                            ? text("正在清空", "Clearing")
                            : text("确认清空", "Clear history")}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogPopup>
                  </AlertDialog>
                </div>
              </CardHeader>

              <CardPanel className="queue-list">
                {dashboard.tasks.length ? (
                  dashboard.tasks.map((task) => (
                    <TaskCard language={language} task={task} key={task.id} />
                  ))
                ) : (
                  <div className="queue-empty">
                    <Task size={28} color="currentColor" />
                    <h3>{text("暂无任务", "No tasks yet")}</h3>
                    <p>
                      {text(
                        "开始生成后，进度和结果会显示在这里。",
                        "Progress and results will appear here after you create a task.",
                      )}
                    </p>
                  </div>
                )}
              </CardPanel>
            </Card>
          </div>
        </div>
        </section>
      </Tabs>
    </main>
  );
}
