import { runtimeEnv as env } from "@/lib/runtime-env";
import { AppError } from "@/lib/errors";
import {
  isProviderApiKeyConfigured,
  requireProviderApiKey,
} from "@/lib/provider-keys";
import {
  classifyGeminiHttpError,
  GEMINI_VIDEO_ANALYSIS_PROMPT,
  GEMINI_VIDEO_ANALYSIS_MODEL,
  GEMINI_VIDEO_SYSTEM_INSTRUCTION,
  resolveGeminiApiUrl,
  routeGeminiUploadUrl,
  type GeminiUpstreamErrorCode,
} from "@/lib/gemini-interactions-contract";
import {
  GeminiVideoAnalysisOutputError,
  parseGeminiVideoAnalysisOutput,
} from "@/lib/gemini-video-analysis-output";
import type { VideoAnalysisSummary } from "@/lib/types";
import {
  VIDEO_ANALYSIS_ARRAY_LIMITS,
} from "@/lib/video-analysis-schema";

export { GEMINI_VIDEO_ANALYSIS_MODEL };
const GEMINI_CONTROL_TIMEOUT_MS = 120_000;
const GEMINI_FILE_UPLOAD_TIMEOUT_MS = 120_000;
const GEMINI_FILE_PROCESSING_TIMEOUT_MS = 120_000;
const GEMINI_FILE_POLL_INTERVAL_MS = 2_000;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const GEMINI_API_REVISION = "2026-05-20";
const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/mpeg",
  "video/mov",
  "video/avi",
  "video/x-flv",
  "video/mpg",
  "video/webm",
  "video/wmv",
  "video/3gpp",
]);

const LOCALIZED_TEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    zh: {
      type: "string",
      description: "A concise Simplified Chinese factual description.",
    },
    en: {
      type: "string",
      description: "A concise English factual description.",
    },
  },
  required: ["zh", "en"],
} as const;

function localizedArraySchema(description: string, maxItems: number) {
  return {
    type: "array",
    description,
    maxItems,
    items: LOCALIZED_TEXT_SCHEMA,
  } as const;
}

const VIDEO_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    overview: {
      ...LOCALIZED_TEXT_SCHEMA,
      description:
        "One concise sentence covering only shot structure and overall action order; use gender-neutral subject wording and omit source-person appearance.",
    },
    people: localizedArraySchema(
      "Only person candidates needed to disambiguate the target by stable position or clothing.",
      VIDEO_ANALYSIS_ARRAY_LIMITS.people,
    ),
    actions: localizedArraySchema(
      "At most four major action phases with relative timing, direction, and key contact events.",
      VIDEO_ANALYSIS_ARRAY_LIMITS.actions,
    ),
    camera: localizedArraySchema(
      "Only the principal camera path, framing or composition, and cuts.",
      VIDEO_ANALYSIS_ARRAY_LIMITS.camera,
    ),
    scene: localizedArraySchema(
      "Only spatial layout, key objects, and lighting facts required for continuity.",
      VIDEO_ANALYSIS_ARRAY_LIMITS.scene,
    ),
    occlusions: localizedArraySchema(
      "Only critical contact, occlusion, reveal, entry, or exit order.",
      VIDEO_ANALYSIS_ARRAY_LIMITS.occlusions,
    ),
    preserve: localizedArraySchema(
      "A consolidated set of the few highest-priority source locks without duplicating other fields; never include source-person identity, gender, age, anatomy, clothing, or wearable styling.",
      VIDEO_ANALYSIS_ARRAY_LIMITS.preserve,
    ),
    risks: localizedArraySchema(
      "Only the two most consequential genuine visual ambiguities; empty when none exist.",
      VIDEO_ANALYSIS_ARRAY_LIMITS.risks,
    ),
  },
  required: [
    "overview",
    "people",
    "actions",
    "camera",
    "scene",
    "occlusions",
    "preserve",
    "risks",
  ],
} as const;

type RuntimeEnv = {
  MEDIA?: R2Bucket;
};

type GeminiInteractionResponse = {
  id?: unknown;
  status?: unknown;
  steps?: unknown;
  error?: unknown;
};

type GeminiFileResource = {
  name?: unknown;
  uri?: unknown;
  mimeType?: unknown;
  state?: unknown;
  error?: unknown;
};

type GeminiFileResponse = { file?: GeminiFileResource };

export type GeminiVideoAnalysisErrorCode =
  | "configuration"
  | "invalid_input"
  | "media_fetch"
  | "timeout"
  | "invalid_response"
  | "interaction_failed"
  | GeminiUpstreamErrorCode;

export class GeminiVideoAnalysisError extends AppError {
  constructor(
    public readonly code: GeminiVideoAnalysisErrorCode,
    message: string,
    status: number,
    public readonly diagnostic?: string,
  ) {
    super(message, status);
    this.name = "GeminiVideoAnalysisError";
  }
}

export type AnalyzeVideoWithGeminiInput = {
  mimeType: string;
  r2Key?: string;
};

export type GeminiVideoAnalysisResult =
  | {
      status: "analyzing";
      interactionId: string;
    }
  | {
      status: "ready";
      interactionId: string;
      summary: VideoAnalysisSummary;
    };

export function isGeminiVideoAnalysisConfigured() {
  return isProviderApiKeyConfigured("gemini");
}

export async function startVideoAnalysisWithGemini(
  input: AnalyzeVideoWithGeminiInput,
): Promise<GeminiVideoAnalysisResult> {
  if (!input.r2Key) {
    throw new GeminiVideoAnalysisError(
      "invalid_input",
      "外链视频暂不支持 AI 分析，请先上传视频或关闭分析。",
      422,
      "external_video_upload_disabled",
    );
  }
  const media = await storedVideoForGemini(input.r2Key);
  const mimeType = normalizedVideoMimeType(input.mimeType);
  const file = await uploadVideoToGemini({
    body: media.body,
    size: media.size,
    mimeType,
  });
  const response = await geminiRequest(
    runtimeGeminiApiUrl("/v1beta/interactions"),
    {
      method: "POST",
      headers: await geminiHeaders(true),
      body: JSON.stringify({
        model: GEMINI_VIDEO_ANALYSIS_MODEL,
        store: true,
        system_instruction: GEMINI_VIDEO_SYSTEM_INSTRUCTION,
        input: [
          {
            type: "video",
            uri: file.uri,
            mime_type: file.mimeType,
          },
          {
            type: "text",
            text: GEMINI_VIDEO_ANALYSIS_PROMPT,
          },
        ],
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: VIDEO_ANALYSIS_SCHEMA,
        },
      }),
    },
  );
  return videoAnalysisResult(await interactionResponse(response));
}

export async function pollVideoAnalysisWithGemini(
  interactionId: string,
): Promise<GeminiVideoAnalysisResult> {
  const id = validatedInteractionId(interactionId);
  const response = await geminiRequest(
    runtimeGeminiApiUrl(`/v1beta/interactions/${encodeURIComponent(id)}`),
    { headers: await geminiHeaders(false) },
  );
  return videoAnalysisResult(await interactionResponse(response));
}

export async function deleteVideoAnalysisInteraction(
  interactionId: string,
) {
  const id = validatedInteractionId(interactionId);
  const response = await geminiRequest(
    runtimeGeminiApiUrl(`/v1beta/interactions/${encodeURIComponent(id)}`),
    {
      method: "DELETE",
      headers: await geminiHeaders(false),
    },
    true,
  );
  if (response.status !== 404 && !response.ok) {
    const failure = classifyGeminiHttpError(response.status);
    throw new GeminiVideoAnalysisError(
      failure.code,
      failure.message,
      failure.status,
    );
  }
}

async function storedVideoForGemini(r2Key: string) {
  if (!r2Key || r2Key.length > 1_024) throw mediaFetchError();
  const bucket = (env as unknown as RuntimeEnv).MEDIA;
  if (!bucket) {
    throw new GeminiVideoAnalysisError(
      "configuration",
      "媒体存储尚未配置，无法进行 AI 视频分析。",
      503,
      "media_bucket_missing",
    );
  }
  const object = await bucket.get(r2Key);
  if (!object) throw mediaFetchError();
  return { body: object.body, size: object.size };
}
async function uploadVideoToGemini(input: {
  body: ReadableStream;
  size: number;
  mimeType: string;
}) {
  if (
    !Number.isInteger(input.size) ||
    input.size <= 0 ||
    input.size > MAX_VIDEO_BYTES
  ) {
    throw new GeminiVideoAnalysisError(
      "invalid_input",
      "AI 视频分析需要可读取且不超过 50MB 的视频文件。",
      400,
      "source_content_length_invalid",
    );
  }

  const startResponse = await geminiRequest(
    runtimeGeminiApiUrl("/upload/v1beta/files"),
    {
      method: "POST",
      headers: {
        ...await geminiFilesHeaders(true),
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(input.size),
        "X-Goog-Upload-Header-Content-Type": input.mimeType,
      },
      body: JSON.stringify({
        file: { display_name: "vidu-source-video-analysis" },
      }),
    },
  );
  const uploadUrl = validatedGeminiUploadUrl(
    startResponse.headers.get("X-Goog-Upload-URL"),
  );

  const uploadInit = {
    method: "POST",
    headers: {
      "Content-Length": String(input.size),
      "Content-Type": input.mimeType,
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: input.body,
    // Required by Node's fetch implementation for a streaming request body.
    duplex: "half",
  } satisfies RequestInit & { duplex: "half" };
  const uploadResponse = await geminiRequest(
    uploadUrl,
    uploadInit,
    false,
    GEMINI_FILE_UPLOAD_TIMEOUT_MS,
  );

  let uploaded: GeminiFileResponse;
  try {
    uploaded = (await uploadResponse.json()) as GeminiFileResponse;
  } catch {
    throw invalidResponseError("upload_json");
  }
  if (!uploaded.file) throw invalidResponseError("upload_file");
  return waitForGeminiFile(uploaded.file, input.mimeType);
}

async function waitForGeminiFile(
  initial: GeminiFileResource,
  fallbackMimeType: string,
) {
  const name = validatedGeminiFileName(initial.name);
  let current = initial;
  const deadline = Date.now() + GEMINI_FILE_PROCESSING_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (current.state === "ACTIVE") {
      return {
        name,
        uri: validatedGeminiFileUri(current.uri),
        mimeType:
          typeof current.mimeType === "string"
            ? normalizedVideoMimeType(current.mimeType)
            : fallbackMimeType,
      };
    }
    if (current.state === "FAILED") {
      throw new GeminiVideoAnalysisError(
        "interaction_failed",
        "Gemini 无法处理这个视频文件，请重新编码为 MP4 后再试。",
        422,
        "file_processing_failed",
      );
    }

    await delay(GEMINI_FILE_POLL_INTERVAL_MS);
    const response = await geminiRequest(
      runtimeGeminiApiUrl(
        `/v1beta/files/${encodeURIComponent(name.slice("files/".length))}`,
      ),
      { headers: await geminiFilesHeaders(false) },
    );
    try {
      current = (await response.json()) as GeminiFileResource;
    } catch {
      throw invalidResponseError("file_json");
    }
  }

  throw new GeminiVideoAnalysisError(
    "timeout",
    "Gemini 处理视频文件超时，请强制再次分析。",
    504,
    "file_processing_timeout",
  );
}

function validatedGeminiUploadUrl(value: string | null) {
  if (!value) throw invalidResponseError("upload_url_missing");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidResponseError("upload_url_invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "generativelanguage.googleapis.com"
  ) {
    throw invalidResponseError("upload_url_host");
  }
  try {
    return routeGeminiUploadUrl(
      url.toString(),
      process.env.GEMINI_API_BASE_URL,
    );
  } catch {
    throw invalidResponseError("upload_url_route");
  }
}

function runtimeGeminiApiUrl(path: string) {
  try {
    return resolveGeminiApiUrl(path, process.env.GEMINI_API_BASE_URL);
  } catch {
    throw new GeminiVideoAnalysisError(
      "configuration",
      "AI 视频分析出口配置无效，请联系管理员。",
      503,
      "gemini_api_base_url_invalid",
    );
  }
}

function validatedGeminiFileName(value: unknown) {
  if (typeof value !== "string" || !/^files\/[A-Za-z0-9_-]{1,1024}$/.test(value)) {
    throw invalidResponseError("file_name");
  }
  return value;
}

function validatedGeminiFileUri(value: unknown) {
  if (typeof value !== "string") throw invalidResponseError("file_uri_type");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidResponseError("file_uri_invalid");
  }
  if (url.protocol !== "https:" || url.hostname !== "generativelanguage.googleapis.com") {
    throw invalidResponseError("file_uri_host");
  }
  return url.toString();
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function geminiFilesHeaders(includeContentType: boolean) {
  return {
    ...(includeContentType ? { "Content-Type": "application/json" } : {}),
    "x-goog-api-key": await geminiApiKey(),
  };
}

async function geminiHeaders(includeContentType: boolean) {
  return {
    ...(includeContentType ? { "Content-Type": "application/json" } : {}),
    "Api-Revision": GEMINI_API_REVISION,
    "x-goog-api-key": await geminiApiKey(),
  };
}

async function geminiRequest(
  url: string,
  init: RequestInit,
  allowFailure = false,
  timeoutMs = GEMINI_CONTROL_TIMEOUT_MS,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new GeminiVideoAnalysisError(
        "timeout",
        "AI 视频分析请求超时，请稍后重试。",
        504,
      );
    }
    throw new GeminiVideoAnalysisError(
      "upstream",
      "AI 视频分析服务暂时不可用，请稍后重试。",
      502,
    );
  }

  if (!allowFailure && !response.ok) {
    throw await geminiHttpError(response);
  }
  return response;
}

async function geminiHttpError(response: Response) {
  const failure = classifyGeminiHttpError(response.status);
  let diagnostic: string | undefined;
  try {
    const payload = (await response.json()) as {
      error?: { status?: unknown; message?: unknown };
    };
    const upstreamStatus = safeDiagnosticToken(payload.error?.status);
    const upstreamMessage = safeDiagnosticText(payload.error?.message);
    diagnostic = [upstreamStatus, upstreamMessage].filter(Boolean).join(": ");
  } catch {
    diagnostic = undefined;
  }
  return new GeminiVideoAnalysisError(
    failure.code,
    failure.message,
    failure.status,
    diagnostic,
  );
}

function safeDiagnosticToken(value: unknown) {
  return typeof value === "string"
    ? value.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80)
    : "";
}

function safeDiagnosticText(value: unknown) {
  return typeof value === "string"
    ? value
        .replace(/https?:\/\/\S+/gi, "[url]")
        .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[secret]")
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .trim()
        .slice(0, 240)
    : "";
}

async function interactionResponse(response: Response) {
  try {
    return (await response.json()) as GeminiInteractionResponse;
  } catch {
    throw invalidResponseError("response_json");
  }
}

function videoAnalysisResult(
  interaction: GeminiInteractionResponse,
): GeminiVideoAnalysisResult {
  const interactionId = validatedInteractionId(interaction.id);
  if (interaction.status === "in_progress") {
    return { status: "analyzing", interactionId };
  }
  if (interaction.status !== "completed") {
    throw new GeminiVideoAnalysisError(
      "interaction_failed",
      "AI 视频分析未能完成，请稍后重试。",
      502,
    );
  }
  return {
    status: "ready",
    interactionId,
    summary: summaryFromSteps(interaction.steps),
  };
}

function summaryFromSteps(steps: unknown) {
  const outputText = modelOutputText(steps);
  try {
    return parseGeminiVideoAnalysisOutput(outputText);
  } catch (error) {
    throw invalidResponseError(
      error instanceof GeminiVideoAnalysisOutputError
        ? error.diagnostic
        : "summary_schema",
    );
  }
}

function validatedInteractionId(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{1,1024}$/.test(value)
  ) {
    throw invalidResponseError("interaction_id");
  }
  return value;
}

async function geminiApiKey() {
  try {
    return await requireProviderApiKey("gemini");
  } catch (error) {
    if (error instanceof AppError && error.status === 503) {
      throw new GeminiVideoAnalysisError(
        "configuration",
        error.message,
        503,
      );
    }
    throw error;
  }
}


function normalizedVideoMimeType(value: string) {
  const mimeType = value.trim().toLowerCase().split(";", 1)[0];
  const normalized = {
    "video/quicktime": "video/mov",
    "video/x-msvideo": "video/avi",
  }[mimeType] ?? mimeType;
  if (!VIDEO_MIME_TYPES.has(normalized)) {
    throw new GeminiVideoAnalysisError(
      "invalid_input",
      "视频格式不支持 AI 分析。",
      400,
    );
  }
  return normalized;
}

function modelOutputText(steps: unknown) {
  if (!Array.isArray(steps)) throw invalidResponseError("output_steps");

  const outputStep = [...steps]
    .reverse()
    .find(
      (step): step is Record<string, unknown> =>
        isPlainRecord(step) && step.type === "model_output",
    );
  if (!outputStep || !Array.isArray(outputStep.content)) {
    throw invalidResponseError("output_step");
  }

  const textParts = outputStep.content
    .filter(
      (part): part is Record<string, unknown> =>
        isPlainRecord(part) &&
        part.type === "text" &&
        typeof part.text === "string",
    )
    .map((part) => part.text as string);
  if (!textParts.length) throw invalidResponseError("output_text");
  return textParts.join("");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isTimeoutError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === "TimeoutError" || error.name === "AbortError";
  }
  if (error === null || typeof error !== "object" || !("name" in error)) {
    return false;
  }
  const name = (error as { name?: unknown }).name;
  return name === "TimeoutError" || name === "AbortError";
}

function mediaFetchError() {
  return new GeminiVideoAnalysisError(
    "media_fetch",
    "无法读取视频素材，请重新上传后再试。",
    422,
    "source_fetch_failed",
  );
}

function invalidResponseError(diagnostic?: string) {
  return new GeminiVideoAnalysisError(
    "invalid_response",
    "AI 视频分析结果无效，请稍后重试。",
    502,
    diagnostic,
  );
}

