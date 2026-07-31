import type { AppLanguage } from "@/lib/preferences";
import type {
  LocalizedAnalysisText,
  VideoAnalysisSummary,
} from "@/lib/types";

export const V16_REPLACEMENT_PROMPTS = {
  zh: "【身份锁｜最高优先级】将参考视频中的目标人物替换为所有人物参考图共同展示的同一个人物。人物参考图是新人物脸部身份、五官几何、发型、肤色、体型与穿搭的唯一来源；彻底丢弃原视频人物的脸和外观，不得保留或混合。原视频只提供动作与表情出现时机、人物和物体的接触与遮挡、运镜、构图、背景、光线和时序；保留表情节奏与强度，但不得复制原人物脸型和五官。忽略参考视频中后期叠加字幕的文字、样式、位置与出现时机，不得复刻到生成结果；只保留场景内真实文字。画面必须保持真人实拍质感，而非 AI 生成动画；保留自然运动模糊、轻微曝光与对焦波动、传感器噪点和克制的手持瑕疵，不得额外叠加强颗粒、故障或风格滤镜。【冲突规则】身份以人物参考图为准；动作、交互与运镜以原视频为准。",
  en: "[IDENTITY LOCK | HIGHEST PRIORITY] Replace the target person in the reference video with the same person shown across all character-reference images. The character images are the only source for the new face identity, feature geometry, hair, skin tone, body type, and styling; discard the source person's face and appearance completely and never blend them. Use the source video only for action and expression timing, person-object contacts, occlusions, camera work, composition, background, lighting, and shot timing. Preserve expression rhythm and intensity without copying the source person's face shape or features. Ignore the text, styling, position, and timing of post-production overlay subtitles and do not reproduce them in the output; preserve only in-scene text. The result must look like live-action footage of a real person captured by a real camera, not AI-generated animation. Preserve natural motion blur, slight exposure and focus variation, sensor noise, and restrained handheld imperfections, never added heavy grain, glitch effects, or stylized filters. [CONFLICT RULE] Character-image identity wins; source-video action, interaction, and camera locks apply after the old appearance is discarded.",
} as const;

const Q2_PRO_REFERENCE_CORE = {
  zh: "【原视频锁定范围】只保留动作语义、顺序与时机，表情出现的时机与强度，人物和物体的接触点，遮挡与显露顺序，运镜、机位、景别、构图、透视、切镜、背景、关键道具、光照和色彩。表情只迁移节奏与强度，不得复制原人物脸型或五官。允许参考图人物的骨骼、体型与外轮廓自然适配，同时保持动作路径、接触关系、遮挡顺序和画面意图；头发与衣物只保留自然惯性，不得复制原人物造型。忽略参考视频中后期叠加字幕的文字、样式、位置与出现时机，不得将其复刻到生成结果；只保留场景内真实存在的招牌、屏幕或道具文字。画面必须像真实摄影机拍摄真人的实拍素材，而非 AI 生成动画：保留自然运动模糊、轻微曝光与对焦波动、传感器噪点、镜头呼吸和手持微小不完美，并保持皮肤、头发、衣物与环境材质的真实细节；避免塑料皮肤、卡通、CG 渲染或合成动画感。粗粝感只能来自克制的真实拍摄瑕疵，不得额外叠加强颗粒、故障或风格滤镜。",
  en: "[SOURCE VIDEO LOCKS] Preserve only action meaning, order and timing; expression timing and intensity; person-object contact points; occlusion and reveal order; camera movement, position, shot size, composition, perspective, cuts, background, essential props, lighting, and color. Transfer expression rhythm and intensity without copying the source person's face shape or features. Allow the reference person's anatomy, body proportions, and outer silhouette to adapt naturally while preserving motion paths, contacts, occlusion order, and frame intent; preserve natural hair and clothing inertia without copying source-person styling. Ignore the text, styling, position, and timing of post-production overlay subtitles in the reference video, and do not reproduce them in the output; preserve only text physically present on in-scene signs, screens, or props. The result must look like live-action footage of a real person captured by a real camera, not AI-generated animation. Preserve source-consistent natural motion blur, slight exposure and focus variation, sensor noise, lens breathing, subtle handheld imperfections, and realistic skin, hair, clothing, and environmental texture. Avoid plastic skin, cartoon, CGI, or synthetic animation. Roughness must come from restrained real-world capture imperfections, never added heavy grain, glitch effects, or stylized filters.",
} as const;

export const V16_REPLACEMENT_PROMPT = V16_REPLACEMENT_PROMPTS.zh;

const V16_PROMPT_LIMIT = 5000;
const V16_ANALYSIS_LIMIT: Record<AppLanguage, number> = {
  zh: 1000,
  en: 1400,
};
const SOURCE_PERSON_APPEARANCE_TEXT =
  /(?:\b(?:woman|women|female|girl|girls|man|men|male|boy|boys|gender|face\s+shape|facial\s+(?:identity|features)|skin\s+tone|hair(?:style)?|blonde|brunette|body\s+type|physique|clothing|outfit|wearing|shirt|t-shirt|blouse|dress|skirt|shorts|pants|trousers|jacket|coat|shoes?|glasses|earphones?|headphones?|earbuds?|earrings?|necklace|bag\s+strap|shoulder\s+strap)\b|(?:女子|女性|女孩|女人|男子|男性|男孩|男人|性别|脸型|五官|骨相|肤色|皮肤|发型|头发|长发|短发|卷发|直发|体型|身材|肩宽|腰臀|穿着|穿搭|服装|上衣|衬衫|T恤|裙子?|短裤|长裤|外套|鞋袜|眼镜|耳机|耳饰|项链|肩带|背带))/iu;
const SOURCE_OVERLAY_SUBTITLE_TEXT =
  /(?:\b(?:subtitle|captions?|lower[- ]third|text overlay|overlay text)\b|(?:叠加字幕|烧录字幕|字幕条|后期字幕|画面字幕))/iu;

function localizedValue(
  item: LocalizedAnalysisText,
  language: AppLanguage,
) {
  return item[language].replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

function describesSourcePersonAppearance(item: LocalizedAnalysisText) {
  return (
    SOURCE_PERSON_APPEARANCE_TEXT.test(item.zh) ||
    SOURCE_PERSON_APPEARANCE_TEXT.test(item.en)
  );
}

function describesSourceOverlaySubtitle(item: LocalizedAnalysisText) {
  return (
    SOURCE_OVERLAY_SUBTITLE_TEXT.test(item.zh) ||
    SOURCE_OVERLAY_SUBTITLE_TEXT.test(item.en)
  );
}

type AnalysisGroup = {
  label: string;
  items: LocalizedAnalysisText[];
  limit: number;
};

function analysisGroups(
  analysis: VideoAnalysisSummary,
  language: AppLanguage,
): AnalysisGroup[] {
  const labels =
    language === "zh"
      ? {
          actions: "动作、姿态与节奏",
          camera: "运镜与构图",
          scene: "关键场景、道具与光照",
          occlusions: "接触、交互与遮挡",
          preserve: "关键连续性",
        }
      : {
          actions: "Action, pose, and rhythm",
          camera: "Camera and composition",
          scene: "Essential scene, prop, and lighting",
          occlusions: "Contact, interaction, and occlusion",
          preserve: "Critical continuity",
        };

  return [
    { label: labels.preserve, items: analysis.preserve, limit: 2 },
    { label: labels.actions, items: analysis.actions, limit: 3 },
    { label: labels.occlusions, items: analysis.occlusions, limit: 3 },
    { label: labels.camera, items: analysis.camera, limit: 3 },
    { label: labels.scene, items: analysis.scene, limit: 2 },
  ];
}

function createAnalysisSection(
  analysis: VideoAnalysisSummary | undefined,
  language: AppLanguage,
  maxLength: number,
) {
  if (!analysis || maxLength <= 0) return "";
  const heading =
    language === "zh"
      ? "【AI 动作／交互／运镜锁】以下辅助约束只锁定原视频的动作、接触、遮挡、运镜、构图和关键道具，不得作为原人物身份或外观证据："
      : "[AI ACTION / INTERACTION / CAMERA LOCKS] These auxiliary constraints lock only source-video motion, contacts, occlusions, camera, composition, and essential props. They are never evidence for the source person's identity or appearance:";
  let section = heading;
  const seen = new Set<string>();

  for (const group of analysisGroups(analysis, language)) {
    const values = group.items
      .filter(
        (item) =>
          !describesSourcePersonAppearance(item) &&
          !describesSourceOverlaySubtitle(item),
      )
      .map((item) => localizedValue(item, language))
      .filter((item) => item && !seen.has(item))
      .slice(0, group.limit);
    if (!values.length) continue;

    const groupHeading = `\n${group.label}:`;
    let groupSection = groupHeading;

    for (const item of values) {
      const next = `\n- ${item}`;
      if (section.length + groupSection.length + next.length > maxLength) break;
      groupSection += next;
      seen.add(item);
    }
    if (groupSection !== groupHeading) section += groupSection;
  }

  return section === heading ? "" : section;
}

function joinPromptSections(sections: string[]) {
  return sections.filter(Boolean).join("\n");
}

export function createV16ReplacementPrompt(
  object: string,
  supplement?: string,
  language: AppLanguage = "zh",
  analysis?: VideoAnalysisSummary,
) {
  const target =
    language === "zh"
      ? `要替换的目标人物：${object}。`
      : `Target person to replace: ${object}.`;
  const identityLock =
    language === "zh"
      ? "【身份锁｜最高优先级】所有人物参考图共同展示同一个替换人物，是新人物脸部身份、五官几何、发型、肤色、体型与穿搭的唯一来源。原视频人物的脸和外观是必须彻底丢弃的旧外观，不得保留、推断或混合；即使原视频脸部更大、更近或更清晰，也不得作为身份证据。"
      : "[IDENTITY LOCK | HIGHEST PRIORITY] All character-reference images show the same replacement person and are the only source for the new facial identity, feature geometry, hair, skin tone, body type, and styling. The source person's face and appearance are old appearance to discard completely: never retain, infer, or blend them, even when the source face is larger, closer, or clearer.";
  const finalPriority =
    language === "zh"
      ? "【最终冲突规则】身份冲突时人物参考图拥有绝对优先级；原视频的动作、交互与运镜约束只在彻底丢弃原人物脸部和外观后生效。最终人物必须可明确识别为人物参考图中的同一个人。"
      : "[FINAL CONFLICT RULE] If any constraint conflicts, character-image identity has absolute priority. Source-video action, interaction, and camera locks apply only after the source person's face and appearance have been discarded. The final person must be clearly recognizable as the same person in the character images.";
  const additional = supplement
    ? language === "zh"
      ? `补充要求：${supplement}`
      : `Additional requirements: ${supplement}`
    : "";
  const requiredSections = [
    identityLock,
    target,
    Q2_PRO_REFERENCE_CORE[language],
    additional,
    finalPriority,
  ];
  const requiredLength = joinPromptSections(requiredSections).length;
  const analysisSection = createAnalysisSection(
    analysis,
    language,
    Math.min(
      V16_ANALYSIS_LIMIT[language],
      Math.max(0, V16_PROMPT_LIMIT - requiredLength - 1),
    ),
  );

  return joinPromptSections([
    identityLock,
    target,
    Q2_PRO_REFERENCE_CORE[language],
    analysisSection,
    additional,
    finalPriority,
  ]);
}
