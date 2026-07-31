import type { MotionTaskInput, ReferenceTaskInput } from "@/lib/types";

export function reserveReferenceCredits(
  input: Pick<ReferenceTaskInput, "resolution" | "duration">,
) {
  const base = {
    "540p": 20,
    "720p": 30,
    "1080p": 85,
  }[input.resolution];
  const perAdditionalSecond = input.resolution === "1080p" ? 10 : 5;

  return base + Math.max(0, input.duration - 1) * perAdditionalSecond;
}

export function reserveMotionCredits(
  input: Pick<MotionTaskInput, "duration">,
) {
  return input.duration * 10;
}
