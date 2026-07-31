import { requireApiUser } from "@/lib/auth";
import {
  ensureStudioUser,
  getActiveTasks,
  getDashboardData,
  updateTaskFromVidu,
} from "@/lib/data";
import { errorResponse } from "@/lib/errors";
import { getViduTask } from "@/lib/vidu";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await requireApiUser();
    await ensureStudioUser(profile);
    const activeTasks = await getActiveTasks(profile.id);

    await Promise.all(
      activeTasks.map(async (task) => {
        if (!task.viduTaskId) return;
        try {
          const status = await getViduTask(task.viduTaskId);
          await updateTaskFromVidu({
            taskId: task.id,
            ...status,
          });
        } catch {
          // Keep the last known task state when the provider status endpoint is
          // temporarily unavailable. The next dashboard refresh retries.
        }
      }),
    );

    return Response.json(await getDashboardData(profile), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
