import { AppError } from "@/lib/errors";
import type {
  MotionTaskInput,
  ReferenceTaskInput,
  ReplacementTaskInput,
} from "@/lib/types";

const RESOLUTIONS = new Set(["540p", "720p", "1080p"]);
const ASPECT_RATIOS = new Set(["16:9", "9:16", "4:3", "3:4", "1:1"]);

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function validHttpOrDataUrl(value: string) {
  if (value.startsWith("data:image/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function parseReferenceInput(payload: unknown): ReferenceTaskInput {
  if (!payload || typeof payload !== "object") {
    throw new AppError("请求内容无效。");
  }
  const body = payload as Record<string, unknown>;
  const prompt = stringValue(body.prompt);
  const title = stringValue(body.title);
  const images = Array.isArray(body.images)
    ? body.images.map(stringValue).filter(Boolean)
    : [];
  const videos = Array.isArray(body.videos)
    ? body.videos.map(stringValue).filter(Boolean)
    : [];
  const model = stringValue(body.model);
  const resolution = stringValue(body.resolution);
  const aspectRatio = stringValue(body.aspectRatio);
  const duration = numberValue(body.duration);

  if (!prompt || prompt.length > 5000) {
    throw new AppError("请输入 1 到 5000 字的画面描述。");
  }
  if (!images.length && !videos.length) {
    throw new AppError("请至少提供一张参考图片或一个参考视频。");
  }
  if (images.length > 7) {
    throw new AppError("参考图片最多 7 张。");
  }
  if (images.some((image) => !validHttpOrDataUrl(image))) {
    throw new AppError("参考图片必须是有效的上传结果或 HTTP(S) 地址。");
  }
  if (videos.length > 2) {
    throw new AppError("参考视频最多 2 个。");
  }
  if (videos.some((video) => !validHttpUrl(video))) {
    throw new AppError("参考视频必须是有效的上传结果或 HTTP(S) 地址。");
  }
  if (model !== "viduq2-pro") {
    throw new AppError("参考生成仅支持 Vidu Q2 Pro。");
  }
  if (videos.length && images.length > 4) {
    throw new AppError("使用视频参考时，参考图片最多 4 张。");
  }
  if (!RESOLUTIONS.has(resolution)) {
    throw new AppError("请选择受支持的输出清晰度。");
  }
  if (!ASPECT_RATIOS.has(aspectRatio)) {
    throw new AppError("请选择受支持的画面比例。");
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > 10) {
    throw new AppError("视频时长需要在 1 到 10 秒之间。");
  }

  return {
    title: title.slice(0, 80) || undefined,
    prompt,
    images,
    videos,
    model: model as ReferenceTaskInput["model"],
    duration,
    resolution: resolution as ReferenceTaskInput["resolution"],
    aspectRatio: aspectRatio as ReferenceTaskInput["aspectRatio"],
    bgm: body.bgm === true,
    offPeak: body.offPeak === true,
  };
}

export function parseMotionInput(payload: unknown): MotionTaskInput {
  if (!payload || typeof payload !== "object") {
    throw new AppError("请求内容无效。");
  }
  const body = payload as Record<string, unknown>;
  const imageUrl = stringValue(body.imageUrl);
  const videoUrl = stringValue(body.videoUrl);
  const title = stringValue(body.title);
  const duration = numberValue(body.duration);

  if (!validHttpOrDataUrl(imageUrl) || imageUrl.startsWith("data:")) {
    throw new AppError("角色图片需要使用上传结果或 HTTP(S) 地址。");
  }
  if (!validHttpOrDataUrl(videoUrl) || videoUrl.startsWith("data:")) {
    throw new AppError("动作视频需要使用上传结果或 HTTP(S) 地址。");
  }
  if (!Number.isInteger(duration) || duration < 2 || duration > 30) {
    throw new AppError("动作参考时长需要在 2 到 30 秒之间。");
  }

  return {
    title: title.slice(0, 80) || undefined,
    imageUrl,
    videoUrl,
    duration,
  };
}

export function parseReplacementInput(payload: unknown): ReplacementTaskInput {
  if (!payload || typeof payload !== "object") {
    throw new AppError("请求内容无效。");
  }

  const body = payload as Record<string, unknown>;
  const legacyImageUrl = stringValue(body.imageUrl);
  const imageUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls.map(stringValue).filter(Boolean)
    : [];
  const images = imageUrls.length ? imageUrls : [legacyImageUrl].filter(Boolean);
  const videoUrl = stringValue(body.videoUrl);
  const engine = stringValue(body.engine);
  const object = stringValue(body.object);
  const prompt = stringValue(body.prompt);
  const aiAnalysisEnabled = body.aiAnalysisEnabled === true;
  const language = stringValue(body.language) === "en" ? "en" : "zh";
  const title = stringValue(body.title);
  const duration = numberValue(body.duration);
  const resolution = stringValue(body.resolution) || "720p";
  const aspectRatio = stringValue(body.aspectRatio) || "9:16";

  if (engine && engine !== "reference-v16") {
    throw new AppError("请选择受支持的人物替换引擎。");
  }
  if (!images.length || images.length > 4 || images.some((url) => !validHttpUrl(url))) {
    throw new AppError(
      "请提供 1 到 4 张同一替换人物的图片，并使用上传结果或 HTTP(S) 地址。",
    );
  }
  if (!validHttpUrl(videoUrl)) {
    throw new AppError("原视频需要使用上传结果或 HTTP(S) 地址。");
  }
  if (!object || object.length > 100) {
    throw new AppError("请用 1 到 100 个字符描述原视频中要替换的人物。");
  }
  const promptLimit = 2000;
  if (prompt.length > promptLimit) {
    throw new AppError("补充提示词不能超过 2000 个字符。");
  }
  if (!RESOLUTIONS.has(resolution)) {
    throw new AppError("请选择受支持的输出清晰度。");
  }
  if (!ASPECT_RATIOS.has(aspectRatio)) {
    throw new AppError("请选择受支持的画面比例。");
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > 8) {
    throw new AppError("Q2 Pro 参考视频时长需要在 1 到 8 秒之间。");
  }

  return {
    title: title.slice(0, 80) || undefined,
    images,
    videoUrl,
    object,
    prompt: prompt || undefined,
    aiAnalysisEnabled,
    language,
    duration,
    resolution: resolution as ReplacementTaskInput["resolution"],
    aspectRatio: aspectRatio as ReplacementTaskInput["aspectRatio"],
  };
}
