import type { VideoAnalysisSummary } from "@/lib/types";
import { parseVideoAnalysisSummary } from "@/lib/video-analysis-schema";

export class GeminiVideoAnalysisOutputError extends Error {
  constructor(public readonly diagnostic: "output_json" | "summary_schema") {
    super("Invalid Gemini video analysis output.");
    this.name = "GeminiVideoAnalysisOutputError";
  }
}

export function parseGeminiVideoAnalysisOutput(
  outputText: string,
): VideoAnalysisSummary {
  let parsedJson = false;

  for (const candidate of jsonCandidates(outputText)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
      parsedJson = true;
    } catch {
      continue;
    }

    try {
      return parseVideoAnalysisSummary(parsed);
    } catch {
      continue;
    }
  }

  throw new GeminiVideoAnalysisOutputError(
    parsedJson ? "summary_schema" : "output_json",
  );
}

function jsonCandidates(outputText: string) {
  const trimmed = outputText.replace(/^\uFEFF/u, "").trim();
  const candidates = [trimmed];
  const fenced = /^\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60$/iu.exec(
    trimmed,
  )?.[1]?.trim();
  const embedded = firstJsonObject(trimmed);

  for (const candidate of [fenced, embedded]) {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  }
  return candidates;
}

function firstJsonObject(value: string) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (start < 0) {
      if (character !== "{") continue;
      start = index;
      depth = 1;
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return value.slice(start, index + 1);
  }
  return undefined;
}
