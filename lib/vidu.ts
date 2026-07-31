import { AppError } from "@/lib/errors";
import { requireProviderApiKey } from "@/lib/provider-keys";
import type {
  MotionTaskInput,
  ReferenceTaskInput,
} from "@/lib/types";

const VIDU_BASE_URL = "https://api.vidu.com/ent/v2";

type ViduTaskResponse = {
  task_id?: string;
  state?: string;
  credits?: number | string;
  err_code?: string;
  message?: string;
  creations?: Array<{
    url?: string;
    cover_url?: string;
  }>;
};

class ViduApiError extends AppError {
  constructor(
    message: string,
    public readonly upstreamStatus: number,
  ) {
    super(message, upstreamStatus >= 500 ? 502 : 400);
  }
}

async function viduFetch(path: string, init?: RequestInit) {
  const apiKey = await requireProviderApiKey("vidu");
  const response = await fetch(`${VIDU_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${apiKey}`,
      ...init?.headers,
    },
  });

  const data = (await response.json().catch(() => ({}))) as ViduTaskResponse;
  if (!response.ok) {
    throw new ViduApiError(
      data.message ||
        data.err_code ||
        `Vidu 服务返回错误（HTTP ${response.status}）。`,
      response.status,
    );
  }
  return data;
}

export async function createReferenceTask(input: ReferenceTaskInput) {
  const data = await viduFetch("/reference2video", {
    method: "POST",
    body: JSON.stringify({
      model: input.model,
      ...(input.images.length ? { images: input.images } : {}),
      ...(input.videos.length ? { videos: input.videos } : {}),
      prompt: input.prompt,
      duration: input.duration,
      resolution: input.resolution,
      aspect_ratio: input.aspectRatio,
      bgm: input.bgm,
      off_peak: input.offPeak,
    }),
  });

  if (!data.task_id) {
    throw new AppError("Vidu 未返回任务编号，请稍后重试。", 502);
  }
  return {
    taskId: data.task_id,
    state: data.state ?? "created",
    credits: Number(data.credits ?? 0),
  };
}

export async function createMotionTask(input: MotionTaskInput) {
  const data = await viduFetch("/image2dance", {
    method: "POST",
    body: JSON.stringify({
      image_url: input.imageUrl,
      video_url: input.videoUrl,
    }),
  });

  if (!data.task_id) {
    throw new AppError("Vidu 未返回任务编号，请稍后重试。", 502);
  }
  return {
    taskId: data.task_id,
    state: data.state ?? "created",
    credits: Number(data.credits ?? 0),
  };
}


export async function getViduTask(taskId: string) {
  const data = await viduFetch(`/tasks/${encodeURIComponent(taskId)}/creations`);
  const creation = data.creations?.[0];
  return {
    state: data.state ?? "processing",
    chargedCredits:
      data.credits === undefined ? undefined : Number(data.credits),
    outputUrl: creation?.url ?? null,
    coverUrl: creation?.cover_url ?? null,
    errorMessage: data.err_code ?? data.message ?? null,
  };
}
