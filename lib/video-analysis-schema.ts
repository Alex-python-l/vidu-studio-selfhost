import type {
  LocalizedAnalysisText,
  VideoAnalysisSummary,
} from "@/lib/types";

export const VIDEO_ANALYSIS_ARRAY_LIMITS = {
  people: 2,
  actions: 4,
  camera: 3,
  scene: 4,
  occlusions: 3,
  preserve: 5,
  risks: 2,
} as const satisfies Record<
  Exclude<keyof VideoAnalysisSummary, "overview">,
  number
>;

const MAX_OVERVIEW_LENGTH = 280;
const MAX_ITEM_LENGTH = 180;
const MAX_TOTAL_LENGTH = 3_200;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const UNSAFE_ANALYSIS_TEXT =
  /(?:https?:\/\/|www\.|api[_ -]?key|password|secret|access[_ -]?token|system\s+prompt|developer\s+message|(?:ignore|disregard|override).{0,40}(?:instruction|prompt|rule|previous|above)|(?:execute|run|call).{0,40}(?:command|code|tool|api)|^(?:add|remove|replace|change|generate|create|ignore|follow|execute|output)\b|系统提示|开发者消息|API\s*密钥|访问令牌|密码|密钥|(?:忽略|无视|覆盖|绕过).{0,20}(?:指令|提示词|规则|系统)|(?:执行|运行|调用).{0,20}(?:命令|代码|工具|接口)|^(?:添加|删除|替换|修改|生成|创建|忽略|遵循|执行|输出))/iu;
const UNSAFE_DIRECTIVE_ANALYSIS_TEXT =
  /(?:\b(?:you|model|assistant)\s+(?:must|should|need(?:s)?\s+to|have\s+to|will)\b|^(?:(?:please|kindly)\s+)?(?:(?:always|never|must|should|need(?:s)?\s+to|have\s+to)\s+)?(?:add|remove|replace|change|generate|create|follow|execute|output)\b|^make\s+(?:the\s+)?(?:subject|person|character|camera)\b|(?:你|模型|助手).{0,8}(?:必须|务必|应该|应当|需要|请)|^(?:(?:请|务必|必须|应当|应该|需要|始终|永远)\s*)?(?:新增|添加|删除|移除|替换|改变|修改|生成|创建|遵循|执行|运行|调用|输出)|^让.{0,20}(?:停下|停止|改变|转向|新增|添加|删除|移除|替换|修改|生成|创建|遵循|执行|运行|调用|输出))/iu;

export function parseVideoAnalysisSummary(
  value: unknown,
): VideoAnalysisSummary {
  const expectedKeys = [
    "overview",
    "people",
    "actions",
    "camera",
    "scene",
    "occlusions",
    "preserve",
    "risks",
  ] as const satisfies readonly (keyof VideoAnalysisSummary)[];

  if (!hasExactKeys(value, expectedKeys)) throw invalidResponseError();

  const summary = {
    overview: localizedText(value.overview, MAX_OVERVIEW_LENGTH),
    people: localizedTextArray(
      value.people,
      VIDEO_ANALYSIS_ARRAY_LIMITS.people,
    ),
    actions: localizedTextArray(
      value.actions,
      VIDEO_ANALYSIS_ARRAY_LIMITS.actions,
    ),
    camera: localizedTextArray(
      value.camera,
      VIDEO_ANALYSIS_ARRAY_LIMITS.camera,
    ),
    scene: localizedTextArray(
      value.scene,
      VIDEO_ANALYSIS_ARRAY_LIMITS.scene,
    ),
    occlusions: localizedTextArray(
      value.occlusions,
      VIDEO_ANALYSIS_ARRAY_LIMITS.occlusions,
    ),
    preserve: localizedTextArray(
      value.preserve,
      VIDEO_ANALYSIS_ARRAY_LIMITS.preserve,
    ),
    risks: localizedTextArray(
      value.risks,
      VIDEO_ANALYSIS_ARRAY_LIMITS.risks,
    ),
  };
  const totalLength = [
    summary.overview,
    ...summary.people,
    ...summary.actions,
    ...summary.camera,
    ...summary.scene,
    ...summary.occlusions,
    ...summary.preserve,
    ...summary.risks,
  ].reduce(
    (total, item) =>
      total + Array.from(item.zh).length + Array.from(item.en).length,
    0,
  );
  if (totalLength > MAX_TOTAL_LENGTH) throw invalidResponseError();
  return summary;
}

function localizedText(
  value: unknown,
  maxLength: number,
): LocalizedAnalysisText {
  if (!hasExactKeys(value, ["zh", "en"])) throw invalidResponseError();
  return {
    zh: safeText(value.zh, maxLength),
    en: safeText(value.en, maxLength),
  };
}

function localizedTextArray(
  value: unknown,
  maxItems: number,
) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw invalidResponseError();
  }
  return value.map((item) =>
    localizedText(item, MAX_ITEM_LENGTH),
  );
}

function safeText(
  value: unknown,
  maxLength: number,
) {
  if (typeof value !== "string") throw invalidResponseError();
  const text = value.trim();
  if (
    !text ||
    Array.from(text).length > maxLength ||
    CONTROL_CHARACTERS.test(text) ||
    UNSAFE_ANALYSIS_TEXT.test(text) ||
    UNSAFE_DIRECTIVE_ANALYSIS_TEXT.test(text)
  ) {
    throw invalidResponseError();
  }
  return text;
}

function hasExactKeys<const Key extends string>(
  value: unknown,
  expectedKeys: readonly Key[],
): value is Record<Key, unknown> {
  if (!isPlainRecord(value)) return false;
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function invalidResponseError() {
  return new Error("Invalid video analysis schema.");
}
