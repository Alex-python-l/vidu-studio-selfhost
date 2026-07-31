import { requireApiUser } from "@/lib/auth";
import { ensureStudioUser } from "@/lib/data";
import { AppError, errorResponse } from "@/lib/errors";
import {
  deleteVideoAnalysisInteraction,
  GEMINI_VIDEO_ANALYSIS_MODEL,
  GeminiVideoAnalysisError,
  isGeminiVideoAnalysisConfigured,
  pollVideoAnalysisWithGemini,
  startVideoAnalysisWithGemini,
  type GeminiVideoAnalysisResult,
} from "@/lib/gemini-video-analysis";
import type {
  VideoAnalysisResponse,
  VideoAnalysisSummary,
} from "@/lib/types";
import {
  acquireVideoAnalysisLease,
  attachVideoAnalysisInteraction,
  completeVideoAnalysisLease,
  failVideoAnalysisLease,
  getReadyVideoAnalysis,
  invalidateReadyVideoAnalysis,
  type VideoAnalysisLease,
} from "@/lib/video-analysis-cache";
import { parseVideoAnalysisSummary } from "@/lib/video-analysis-schema";
import { resolveVideoAnalysisSource } from "@/lib/video-analysis-source";
import { assertSameOrigin } from "@/lib/session-security";

type VideoAnalysisRequest = {
  videoUrl?: unknown;
  mimeType?: unknown;
  force?: unknown;
};

function readyResponse(
  summary: VideoAnalysisSummary,
  cacheHit: boolean,
) {
  return Response.json({
    status: "ready",
    cacheHit,
    summary,
  } satisfies VideoAnalysisResponse);
}

function failedResponse(message: string) {
  return Response.json({
    status: "failed",
    message,
  } satisfies VideoAnalysisResponse);
}

function analyzingResponse(retryAfterMs: number) {
  return Response.json(
    {
      status: "analyzing",
      retryAfterMs,
    } satisfies VideoAnalysisResponse,
    { status: 202 },
  );
}

function parseStoredSummary(resultJson: string) {
  try {
    return parseVideoAnalysisSummary(JSON.parse(resultJson));
  } catch {
    return null;
  }
}
function analysisErrorCode(error: unknown) {
  return error instanceof GeminiVideoAnalysisError
    ? error.code
    : "unexpected";
}

function analysisErrorDetail(error: unknown) {
  return error instanceof GeminiVideoAnalysisError
    ? error.diagnostic
    : undefined;
}

function analysisErrorMessage(error: unknown) {
  return error instanceof GeminiVideoAnalysisError
    ? error.message
    : "AI 视频分析暂时不可用，请强制再次分析或关闭分析。";
}

function retryablePollError(error: unknown) {
  return (
    error instanceof GeminiVideoAnalysisError &&
    ["timeout", "upstream", "rate_limit"].includes(error.code)
  );
}

async function processAnalysisResult(input: {
  result: GeminiVideoAnalysisResult;
  lease: VideoAnalysisLease;
  cacheHit: boolean;
}) {
  if (input.result.status === "analyzing") {
    const attached = await attachVideoAnalysisInteraction({
      lease: input.lease,
      interactionId: input.result.interactionId,
    });
    if (!attached) {
      await deleteVideoAnalysisInteraction(
        input.result.interactionId,
      ).catch(() => undefined);
      return analyzingResponse(2_000);
    }
    return analyzingResponse(1_500);
  }

  const persisted = await completeVideoAnalysisLease({
    lease: input.lease,
    resultJson: JSON.stringify(input.result.summary),
  });
  await deleteVideoAnalysisInteraction(input.result.interactionId).catch(
    () => undefined,
  );
  if (!persisted) return analyzingResponse(2_000);
  return readyResponse(input.result.summary, input.cacheHit);
}

async function failAnalysis(
  lease: VideoAnalysisLease,
  error: unknown,
  interactionId?: string,
) {
  const code = analysisErrorCode(error);
  const detail = analysisErrorDetail(error);
  console.warn("video_analysis_failed", { code, detail });
  await failVideoAnalysisLease({
    lease,
    errorCode: code,
    errorDetail: detail,
  }).catch(
    () => undefined,
  );
  if (interactionId) {
    await deleteVideoAnalysisInteraction(interactionId).catch(() => undefined);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const profile = await requireApiUser();
    const user = await ensureStudioUser(profile);
    const body = (await request.json()) as VideoAnalysisRequest;
    if (typeof body.videoUrl !== "string" || !body.videoUrl.trim()) {
      throw new AppError("请提供需要分析的视频地址。");
    }
    if (
      body.mimeType !== undefined &&
      typeof body.mimeType !== "string"
    ) {
      throw new AppError("视频格式参数无效。");
    }
    if (body.force !== undefined && typeof body.force !== "boolean") {
      throw new AppError("重新分析参数无效。");
    }

    const source = await resolveVideoAnalysisSource({
      videoUrl: body.videoUrl,
      mimeType: body.mimeType,
      requestUrl: request.url,
      userId: user.id,
    });
    if (!source) {
      throw new AppError("暂时无法读取这个站内视频。", 404);
    }

    const alreadyReady = body.force ? null : await getReadyVideoAnalysis(source);
    if (alreadyReady) {
      const summary = parseStoredSummary(alreadyReady.resultJson);
      if (summary) return readyResponse(summary, true);
      await invalidateReadyVideoAnalysis(alreadyReady.id);
    }
    if (!(await isGeminiVideoAnalysisConfigured())) {
      return failedResponse(
        "站点尚未配置 AI 视频分析，请关闭分析后提交。",
      );
    }

    const acquired = await acquireVideoAnalysisLease({
      source,
      userId: user.id,
      model: GEMINI_VIDEO_ANALYSIS_MODEL,
      force: body.force === true,
    });

    if (acquired.kind === "ready") {
      const summary = parseStoredSummary(acquired.analysis.resultJson);
      if (summary) return readyResponse(summary, true);
      await invalidateReadyVideoAnalysis(acquired.analysis.id);
      return failedResponse("已有分析结果无效，请强制再次分析。");
    }
    if (acquired.kind === "analyzing") {
      if (!acquired.poll) return analyzingResponse(acquired.retryAfterMs);
      try {
        const result = await pollVideoAnalysisWithGemini(
          acquired.poll.interactionId,
        );
        return processAnalysisResult({
          result,
          lease: acquired.poll.lease,
          cacheHit: false,
        });
      } catch (error) {
        if (retryablePollError(error)) {
          console.warn("video_analysis_poll_delayed", {
            code: analysisErrorCode(error),
          });
          return analyzingResponse(acquired.retryAfterMs);
        }
        await failAnalysis(
          acquired.poll.lease,
          error,
          acquired.poll.interactionId,
        );
        return failedResponse(analysisErrorMessage(error));
      }
    }
    if (acquired.kind === "failed") {
      return failedResponse("上次分析失败且仍在冷却，请强制再次分析。");
    }
    if (acquired.kind === "quota") {
      throw new AppError(
        acquired.reason === "daily_limit"
          ? "今天的 AI 视频分析次数已用完，仍可关闭分析后继续创建。"
          : "当前账号已有一个视频正在分析，请稍后重试。",
        429,
      );
    }

    try {
      const result = await startVideoAnalysisWithGemini({
        r2Key: source.r2Key,
        mimeType: source.mimeType,
      });
      return processAnalysisResult({
        result,
        lease: acquired.lease,
        cacheHit: false,
      });
    } catch (error) {
      await failAnalysis(acquired.lease, error);
      return failedResponse(analysisErrorMessage(error));
    }
  } catch (error) {
    return errorResponse(error);
  }
}
