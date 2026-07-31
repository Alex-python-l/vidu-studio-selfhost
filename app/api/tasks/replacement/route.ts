import { requireApiUser } from "@/lib/auth";
import {
  beginTask,
  completeTaskSubmission,
  failTaskSubmission,
} from "@/lib/data";
import { AppError, errorResponse } from "@/lib/errors";
import { reserveReferenceCredits } from "@/lib/pricing";
import { createV16ReplacementPrompt } from "@/lib/prompts";
import type { VideoAnalysisSummary } from "@/lib/types";
import { parseReplacementInput } from "@/lib/validation";
import { enforceTaskSubmissionRateLimit } from "@/lib/route-protection";
import { assertSameOrigin } from "@/lib/session-security";
import {
  getReadyVideoAnalysis,
  VIDEO_ANALYSIS_VERSION,
} from "@/lib/video-analysis-cache";
import { parseVideoAnalysisSummary } from "@/lib/video-analysis-schema";
import { resolveExistingVideoAnalysisSource } from "@/lib/video-analysis-source";
import { createReferenceTask } from "@/lib/vidu";

export async function POST(request: Request) {
  let pending:
    | {
        taskId: string;
        userId: string;
        reservedCredits: number;
      }
    | undefined;

  try {
    assertSameOrigin(request);
    const profile = await requireApiUser();
    const input = parseReplacementInput(await request.json());
    await enforceTaskSubmissionRateLimit(profile.id);
    let analysis:
      | {
          summary: VideoAnalysisSummary;
          sourceKey: string;
        }
      | undefined;
    if (input.aiAnalysisEnabled) {
      analysis = await readCachedAnalysis({
        videoUrl: input.videoUrl,
        requestUrl: request.url,
        userId: profile.id,
      });
      if (!analysis) {
        throw new AppError(
          "AI 视频分析尚未成功，请重新分析或关闭分析后再提交。",
          409,
        );
      }
    }
    const effectiveV16Prompt = createV16ReplacementPrompt(
      input.object,
      input.prompt,
      input.language,
      analysis?.summary,
    );
    const inputSummary = {
      imageUrls: input.images,
      videoUrl: input.videoUrl,
      object: input.object,
      pipeline: "q2-pro-reference",
      aiAnalysis: {
        enabled: input.aiAnalysisEnabled,
        version: VIDEO_ANALYSIS_VERSION,
        cacheKey: analysis?.sourceKey ?? null,
        used: Boolean(analysis),
      },
      effectivePrompt: effectiveV16Prompt,
    };
    const reserveCredits = reserveReferenceCredits(input);

    pending = await beginTask({
      profile,
      kind: "replacement",
      title: input.title ?? "人物替换",
      prompt: input.prompt,
      model: "viduq2-pro-reference",
      duration: input.duration,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      inputSummary,
      reserveCredits,
    });

    const result = await createReferenceTask({
      model: "viduq2-pro",
      images: input.images,
      videos: [input.videoUrl],
      prompt: effectiveV16Prompt,
      duration: input.duration,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      bgm: false,
      offPeak: false,
    });
    const chargedCredits =
      Number.isFinite(result.credits) && result.credits > 0
        ? result.credits
        : reserveCredits;

    await completeTaskSubmission({
      ...pending,
      viduTaskId: result.taskId,
      state: result.state,
      chargedCredits,
    });

    return Response.json(
      {
        taskId: pending.taskId,
        state: result.state,
      },
      { status: 201 },
    );
  } catch (error) {
    if (pending) {
      await failTaskSubmission({
        ...pending,
        errorMessage:
          error instanceof Error ? error.message : "Vidu 任务提交失败。",
      }).catch(() => undefined);
    }
    return errorResponse(error);
  }
}

async function readCachedAnalysis(input: {
  videoUrl: string;
  requestUrl: string;
  userId: string;
}) {
  try {
    const source = await resolveExistingVideoAnalysisSource(input);
    if (!source) return undefined;
    const ready = await getReadyVideoAnalysis(source);
    if (!ready) return undefined;
    const summary = parseVideoAnalysisSummary(JSON.parse(ready.resultJson));
    return {
      summary,
      sourceKey: ready.sourceKey,
    };
  } catch {
    return undefined;
  }
}
