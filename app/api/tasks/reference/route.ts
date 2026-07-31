import { requireApiUser } from "@/lib/auth";
import {
  beginTask,
  completeTaskSubmission,
  failTaskSubmission,
} from "@/lib/data";
import { errorResponse } from "@/lib/errors";
import { reserveReferenceCredits } from "@/lib/pricing";
import { enforceTaskSubmissionRateLimit } from "@/lib/route-protection";
import { assertSameOrigin } from "@/lib/session-security";
import { parseReferenceInput } from "@/lib/validation";
import { createReferenceTask } from "@/lib/vidu";

function persistentMediaUrls(urls: string[]) {
  return urls.filter((url) => /^https?:\/\//i.test(url));
}

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
    const input = parseReferenceInput(await request.json());
    await enforceTaskSubmissionRateLimit(profile.id);
    const reserveCredits = reserveReferenceCredits(input);

    pending = await beginTask({
      profile,
      kind: "reference",
      title: input.title ?? input.prompt.slice(0, 38),
      prompt: input.prompt,
      model: input.model,
      duration: input.duration,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      inputSummary: {
        imageCount: input.images.length,
        videoCount: input.videos.length,
        imageUrls: persistentMediaUrls(input.images),
        videoUrls: persistentMediaUrls(input.videos),
        bgm: input.bgm,
        offPeak: input.offPeak,
      },
      reserveCredits,
    });

    const result = await createReferenceTask(input);
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
      { taskId: pending.taskId, state: result.state },
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
