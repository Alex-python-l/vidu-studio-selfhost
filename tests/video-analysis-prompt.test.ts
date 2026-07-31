import assert from "node:assert/strict";
import test from "node:test";
import {
  createV16ReplacementPrompt,
  V16_REPLACEMENT_PROMPTS,
} from "../lib/prompts";
import type { VideoAnalysisSummary } from "../lib/types";
import { parseReplacementInput } from "../lib/validation";

const analysis: VideoAnalysisSummary = {
  overview: {
    zh: "单人全身镜头，人物从画面中央向左转身。",
    en: "A full-body single-person shot; the subject turns left from center.",
  },
  people: [
    {
      zh: "画面中只有一名穿黑色上衣的人。",
      en: "Only one person is visible, wearing a black top.",
    },
  ],
  actions: [
    {
      zh: "转身动作、步幅和起止时机与原视频一致。",
      en: "The turn, stride length, and action timing match the source.",
    },
  ],
  camera: [
    {
      zh: "镜头缓慢推近并带有轻微手持运动。",
      en: "The camera slowly pushes in with subtle handheld motion.",
    },
  ],
  scene: [
    {
      zh: "场景包含红色沙发、窗户和室内暖光。",
      en: "The scene contains a red sofa, window, and warm indoor lighting.",
    },
  ],
  occlusions: [
    {
      zh: "手臂会短暂遮挡躯干。",
      en: "The arm briefly occludes the torso.",
    },
  ],
  preserve: [
    {
      zh: "人物、道具数量和镜头切换均与原视频一致。",
      en: "Person count, prop count, and cuts remain identical to the source.",
    },
  ],
  risks: [
    {
      zh: "转身期间脸部与双手存在结构稳定性风险。",
      en: "Face and hand structure may become unstable during the turn.",
    },
  ],
};

function replacementPayload(overrides: Record<string, unknown> = {}) {
  return {
    imageUrls: [
      "https://example.com/character-face.jpg",
      "https://example.com/character-body.jpg",
    ],
    videoUrl: "https://example.com/source.mp4",
    object: "画面中央穿黑色上衣的人",
    prompt: "",
    language: "zh",
    duration: 5,
    resolution: "720p",
    aspectRatio: "9:16",
    aiAnalysisEnabled: true,
    ...overrides,
  };
}

test("V16 prompt preserves required order and stays within the API limit", () => {
  const prompt = createV16ReplacementPrompt(
    "the person in black at center",
    "Keep the logo readable.",
    "en",
    analysis,
  );

  assert.ok(prompt.length <= 5000);
  assert.match(prompt, /^\[IDENTITY LOCK \| HIGHEST PRIORITY\]/);
  assert.ok(
    prompt.indexOf("[IDENTITY LOCK | HIGHEST PRIORITY]") <
      prompt.indexOf("Target person to replace"),
  );
  assert.ok(
    prompt.indexOf("Target person to replace") <
      prompt.indexOf("[SOURCE VIDEO LOCKS]"),
  );
  assert.doesNotMatch(prompt, /immutable spatiotemporal master/);
  assert.match(prompt, /only source for the new facial identity/);
  assert.match(prompt, /larger, closer, or clearer/);
  assert.match(prompt, /character-image identity has absolute priority/);
  assert.match(prompt, /outer silhouette to adapt naturally/);
  assert.ok(
    prompt.indexOf("Target person to replace") <
      prompt.indexOf("[AI ACTION / INTERACTION / CAMERA LOCKS]"),
  );
  assert.ok(
    prompt.indexOf("[AI ACTION / INTERACTION / CAMERA LOCKS]") <
      prompt.indexOf("Additional requirements"),
  );
  assert.ok(
    prompt.indexOf("Action, pose, and rhythm") <
      prompt.indexOf("Camera and composition"),
  );
  assert.match(prompt, /The arm briefly occludes the torso/);
  assert.match(prompt, /camera slowly pushes in/);
  assert.doesNotMatch(prompt, /A full-body single-person shot/);
  assert.doesNotMatch(prompt, /Only one person is visible/);
  assert.doesNotMatch(prompt, /Face and hand structure may become unstable/);
  assert.ok(
    prompt.endsWith(
      "The final person must be clearly recognizable as the same person in the character images.",
    ),
  );

  const compactChinesePrompt = createV16ReplacementPrompt(
    "画面中央的人",
    undefined,
    "zh",
    analysis,
  );
  assert.ok(compactChinesePrompt.length < 1600);

  const maximumSupplementPrompt = createV16ReplacementPrompt(
    "o".repeat(100),
    "x".repeat(2000),
    "en",
    analysis,
  );
  assert.ok(maximumSupplementPrompt.length <= 5000);
  assert.match(maximumSupplementPrompt, new RegExp(`x{${2000}}`));
  assert.ok(
    maximumSupplementPrompt.endsWith(
      "The final person must be clearly recognizable as the same person in the character images.",
    ),
  );
});

test("drops source-person gender and styling locks while preserving motion", () => {
  const prompt = createV16ReplacementPrompt(
    "the person holding the selfie camera",
    undefined,
    "en",
    {
      ...analysis,
      overview: {
        zh: "单一连续自拍镜头中，女子手持镜头向前走。",
        en: "In one continuous selfie shot, a woman walks forward.",
      },
      preserve: [
        {
          zh: "保持浅绿色上衣、肩带和有线耳机的位置关系。",
          en: "Keep the light green shirt, shoulder strap, and wired earphones.",
        },
        {
          zh: "保持右手抬起招呼的时机。",
          en: "Keep the timing of the right-hand wave.",
        },
      ],
    },
  );

  assert.doesNotMatch(
    prompt,
    /woman|light green shirt|shoulder strap|wired earphones/i,
  );
  assert.match(prompt, /Keep the timing of the right-hand wave/);
  assert.match(prompt, /outer silhouette to adapt naturally/);
  assert.match(prompt, /without copying source-person styling/);
});

test("ignores reference-video overlay subtitles without removing in-scene text", () => {
  const prompt = createV16ReplacementPrompt(
    "the person at center",
    undefined,
    "en",
    {
      ...analysis,
      scene: [
        ...analysis.scene,
        {
          zh: "保持底部叠加字幕的位置和出现时机。",
          en: "Keep the bottom overlay subtitle position and timing.",
        },
        {
          zh: "保留商店招牌在背景中的位置。",
          en: "Keep the shop sign in its background position.",
        },
      ],
    },
  );
  const chinesePrompt = createV16ReplacementPrompt(
    "画面中央的人",
    undefined,
    "zh",
  );

  assert.match(prompt, /Ignore the text, styling, position, and timing of post-production overlay subtitles/);
  assert.match(prompt, /preserve only text physically present on in-scene signs, screens, or props/);
  assert.match(
    prompt,
    /live-action footage of a real person captured by a real camera/,
  );
  assert.match(prompt, /natural motion blur/);
  assert.match(prompt, /never added heavy grain, glitch effects, or stylized filters/);
  assert.doesNotMatch(prompt, /Keep the bottom overlay subtitle position/);
  assert.match(prompt, /Keep the shop sign in its background position/);
  assert.match(chinesePrompt, /忽略参考视频中后期叠加字幕的文字、样式、位置与出现时机/);
  assert.match(chinesePrompt, /真实摄影机拍摄真人的实拍素材/);
  assert.match(chinesePrompt, /不得额外叠加强颗粒、故障或风格滤镜/);
  assert.match(V16_REPLACEMENT_PROMPTS.zh, /不得复刻到生成结果/);
  assert.match(V16_REPLACEMENT_PROMPTS.zh, /而非 AI 生成动画/);
  assert.match(V16_REPLACEMENT_PROMPTS.en, /do not reproduce them in the output/);
  assert.match(V16_REPLACEMENT_PROMPTS.en, /not AI-generated animation/);
});

test("replacement validation exposes only the Q2 Pro reference path", () => {
  assert.throws(
    () =>
      parseReplacementInput(
        replacementPayload({ engine: "replace-beta" }),
      ),
    /人物替换引擎/,
  );
  const parsed = parseReplacementInput(
    replacementPayload({
      prompt: "x".repeat(2000),
    }),
  );
  assert.deepEqual(parsed.images, [
    "https://example.com/character-face.jpg",
    "https://example.com/character-body.jpg",
  ]);
  assert.equal(parsed.prompt?.length, 2000);
  assert.equal(parsed.aiAnalysisEnabled, true);
  assert.throws(
    () => parseReplacementInput(replacementPayload({ prompt: "x".repeat(2001) })),
    /2000/,
  );
  assert.throws(
    () =>
      parseReplacementInput(
        replacementPayload({
          imageUrls: Array.from(
            { length: 5 },
            (_, index) => `https://example.com/character-${index}.jpg`,
          ),
        }),
      ),
    /1 到 4 张/,
  );
  assert.deepEqual(
    parseReplacementInput(
      replacementPayload({
        imageUrls: undefined,
        imageUrl: "https://example.com/legacy-character.jpg",
      }),
    ).images,
    ["https://example.com/legacy-character.jpg"],
  );
});
