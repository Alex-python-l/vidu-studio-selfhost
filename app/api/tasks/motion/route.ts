import { requireApiUser } from "@/lib/auth";
import {
  beginTask,
  completeTaskSubmission,
  failTaskSubmission,
} from "@/lib/data";
import { errorResponse } from "@/lib/errors";
import { reserveMotionCredits } from "@/lib/pricing";
import { enforceTaskSubmissionRateLimit } from "@/lib/route-protection";
import { assertSameOrigin } from "@/lib/session-security";
import { parseMotionInput } from "@/lib/validation";
import { createMotionTask } from "@/lib/vidu";

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
    const input = parseMotionInput(await request.json());
    await enforceTaskSubmissionRateLimit(profile.id);
    const reserveCredits = reserveMotionCredits(input);

    pending = await beginTask({
      profile,
      kind: "motion",
      title: input.title ?? "动作同步视频",
      duration: input.duration,
      inputSummary: {
        imageUrl: input.imageUrl,
        videoUrl: input.videoUrl,
      },
      reserveCredits,
    });

    const result = await createMotionTask(input);
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
