import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureRuntimeSchema } from "@/db/runtime-schema";
import { mediaAssets } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { runtimeEnv as env } from "@/lib/runtime-env";

export type VideoAnalysisSourceType = "content_sha256" | "external_url";

export type GeminiVideoMimeType =
  | "video/mp4"
  | "video/mpeg"
  | "video/mpg"
  | "video/mov"
  | "video/avi"
  | "video/x-flv"
  | "video/webm"
  | "video/wmv"
  | "video/3gpp";

export type VideoAnalysisSource = {
  sourceType: VideoAnalysisSourceType;
  sourceKey: string;
  videoUrl: string;
  mimeType: GeminiVideoMimeType;
  r2Key?: string;
};

type RuntimeEnv = {
  MEDIA?: R2Bucket;
};

const MEDIA_PATH = /^\/api\/media\/([^/]+)$/;
const MAX_EXTERNAL_URL_LENGTH = 4_096;
const GEMINI_MIME_TYPES = new Set<GeminiVideoMimeType>([
  "video/mp4",
  "video/mpeg",
  "video/mpg",
  "video/mov",
  "video/avi",
  "video/x-flv",
  "video/webm",
  "video/wmv",
  "video/3gpp",
]);

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Text(value: string) {
  return toHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

function mediaBucket() {
  const bucket = (env as unknown as RuntimeEnv).MEDIA;
  if (!bucket) {
    throw new AppError("媒体存储尚未配置，无法分析站内视频。", 503);
  }
  return bucket;
}

function mimeTypeFromPath(pathname: string): GeminiVideoMimeType | undefined {
  const extension = pathname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return {
    mp4: "video/mp4",
    mpeg: "video/mpeg",
    mpg: "video/mpg",
    mov: "video/mov",
    avi: "video/avi",
    flv: "video/x-flv",
    webm: "video/webm",
    wmv: "video/wmv",
    "3gp": "video/3gpp",
  }[extension ?? ""] as GeminiVideoMimeType | undefined;
}

function geminiMimeType(
  value: string | undefined,
  pathname = "",
): GeminiVideoMimeType {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return mimeTypeFromPath(pathname) ?? "video/mp4";
  if (normalized === "video/quicktime") return "video/mov";
  if (normalized === "video/x-msvideo") return "video/avi";
  if (GEMINI_MIME_TYPES.has(normalized as GeminiVideoMimeType)) {
    return normalized as GeminiVideoMimeType;
  }
  throw new AppError("视频 MIME 类型不受 AI 分析支持。");
}

async function storedAsset(
  publicToken: string,
  userId: string,
) {
  const [asset] = await getDb()
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.publicToken, publicToken),
        eq(mediaAssets.userId, userId),
        eq(mediaAssets.kind, "video"),
      ),
    )
    .limit(1);

  if (!asset) {
    throw new AppError("无权分析这个站内视频，或素材不是视频。", 403);
  }
  return asset;
}

async function contentSha256(
  asset: typeof mediaAssets.$inferSelect,
) {
  if (asset.contentSha256) return asset.contentSha256;

  const object = await mediaBucket().get(asset.r2Key);
  if (!object) {
    throw new AppError("站内视频已不存在，请重新上传。", 404);
  }

  const hash = createHash("sha256");
  const reader = object.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  const digest = hash.digest("hex");

  await getDb()
    .update(mediaAssets)
    .set({ contentSha256: digest })
    .where(
      and(
        eq(mediaAssets.id, asset.id),
        eq(mediaAssets.userId, asset.userId),
        isNull(mediaAssets.contentSha256),
      ),
    );

  return digest;
}

function parseVideoUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    throw new AppError("原视频地址无效。");
  }
}

function storedMediaToken(videoUrl: URL, requestUrl: URL) {
  if (videoUrl.origin !== requestUrl.origin) return null;
  const match = MEDIA_PATH.exec(videoUrl.pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new AppError("站内视频地址无效。");
  }
}

export function normalizeExternalVideoUrl(value: string) {
  if (value.trim().length > MAX_EXTERNAL_URL_LENGTH) {
    throw new AppError("AI 视频分析地址过长。");
  }
  const url = parseVideoUrl(value);
  if (url.protocol !== "https:") {
    throw new AppError("AI 视频分析仅支持公开 HTTPS 地址。");
  }
  if (url.username || url.password) {
    throw new AppError("AI 视频分析不支持包含账号信息的地址。");
  }
  url.hash = "";
  return url.toString();
}

async function externalSource(
  videoUrl: URL,
  userId: string,
  mimeType?: string,
): Promise<VideoAnalysisSource> {
  const normalizedUrl = normalizeExternalVideoUrl(videoUrl.toString());
  return {
    sourceType: "external_url",
    sourceKey: await sha256Text(`external-url\0${userId}\0${normalizedUrl}`),
    videoUrl: normalizedUrl,
    mimeType: geminiMimeType(mimeType, videoUrl.pathname),
  };
}

export async function resolveVideoAnalysisSource(input: {
  videoUrl: string;
  requestUrl: string | URL;
  userId: string;
  mimeType?: string;
  computeStoredContentHash?: boolean;
}): Promise<VideoAnalysisSource | null> {
  await ensureRuntimeSchema();
  const videoUrl = parseVideoUrl(input.videoUrl);
  const requestUrl =
    input.requestUrl instanceof URL
      ? input.requestUrl
      : new URL(input.requestUrl);
  const publicToken = storedMediaToken(videoUrl, requestUrl);

  if (!publicToken) {
    return externalSource(videoUrl, input.userId, input.mimeType);
  }

  const asset = await storedAsset(publicToken, input.userId);
  const digest =
    asset.contentSha256 ??
    (input.computeStoredContentHash === false
      ? null
      : await contentSha256(asset));
  if (!digest) return null;

  videoUrl.hash = "";
  return {
    sourceType: "content_sha256",
    sourceKey: digest,
    videoUrl: videoUrl.toString(),
    mimeType: geminiMimeType(asset.contentType),
    r2Key: asset.r2Key,
  };
}

export function resolveExistingVideoAnalysisSource(input: {
  videoUrl: string;
  requestUrl: string | URL;
  userId: string;
  mimeType?: string;
}) {
  return resolveVideoAnalysisSource({
    ...input,
    computeStoredContentHash: false,
  });
}
