import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("build output and source describe the Vidu product", async () => {
  const [
    page,
    landing,
    layout,
    preferences,
    preferenceModel,
    tabs,
    card,
    button,
    progress,
    dialog,
    alertDialog,
    tutorialDialog,
    ambientBackdrop,
    softAurora,
    borderGlow,
    builtWorker,
  ] =
    await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/LandingContent.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PreferencesProvider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/preferences.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ui/Tabs.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ui/Card.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ui/Button.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/ui/Progress.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/ui/Dialog.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/ui/AlertDialog.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/FeatureTutorialDialog.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/AmbientBackdrop.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/components/SoftAurora.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/BorderGlow.tsx", import.meta.url), "utf8"),
    readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"),
    ]);

  assert.match(layout, /Vidu 创作台/);
  assert.match(layout, /data-theme=\{theme\}/);
  assert.match(layout, /PreferencesProvider/);
  assert.match(page, /LandingContent/);
  assert.match(landing, /让同一个角色/);
  assert.match(landing, /Keep one character/);
  assert.match(landing, /hero-workflows\.png/);
  assert.match(landing, /参考生成/);
  assert.match(landing, /Q2 Pro/);
  assert.match(landing, /Video Replacement/);
  assert.match(landing, /人物替换/);
  assert.match(landing, /Motion Sync/);
  assert.match(landing, /PreferencesControls/);
  assert.match(landing, /landing-workflow-tabs/);
  assert.match(landing, /TabsList/);
  assert.match(landing, /AmbientBackdrop variant="landing"/);
  assert.match(landing, /BorderGlow/);
  assert.match(landing, /CardTitle/);
  assert.match(tabs, /@base-ui\/react\/tabs/);
  assert.match(tabs, /TabsPrimitive\.Indicator/);
  assert.match(tabs, /data-slot="tabs-panel"/);
  assert.match(card, /@base-ui\/react\/use-render/);
  assert.match(card, /data-slot": "card-panel"/);
  assert.match(button, /@base-ui\/react\/use-render/);
  assert.match(button, /data-slot": "button"/);
  assert.match(button, /data-slot="button-loading-indicator"/);
  assert.match(progress, /@base-ui\/react\/progress/);
  assert.match(progress, /data-slot="progress-indicator"/);
  assert.match(dialog, /@base-ui\/react\/dialog/);
  assert.match(dialog, /data-slot="dialog-panel"/);
  assert.match(alertDialog, /@base-ui\/react\/alert-dialog/);
  assert.match(alertDialog, /data-slot="alert-dialog-popup"/);
  assert.match(tutorialDialog, /三步做好人物替换/);
  assert.match(tutorialDialog, /三步做好动作迁移/);
  assert.match(tutorialDialog, /AI 视频分析锁动作、交互与运镜/);
  assert.match(tutorialDialog, /保持 AI 视频分析开启/);
  assert.match(tutorialDialog, /参考视频里的叠加字幕会被忽略/);
  assert.match(tutorialDialog, /按原片景别准备 1–4 张同一人物/);
  assert.match(tutorialDialog, /不要靠追加长提示词补救/);
  assert.match(tutorialDialog, /character-turnaround\.webp/);
  assert.match(tutorialDialog, /motion-reference\.mp4/);
  assert.match(tutorialDialog, /navigator\.clipboard\.writeText/);
  assert.match(landing, /FeatureTutorialDialog/);
  assert.match(ambientBackdrop, /SoftAurora/);
  assert.match(ambientBackdrop, /ambient-halo is-primary/);
  assert.match(softAurora, /from "ogl"/);
  assert.match(softAurora, /prefers-reduced-motion/);
  assert.match(softAurora, /visibilitychange/);
  assert.match(borderGlow, /React Bits BorderGlow/);
  assert.match(borderGlow, /cancelAnimations/);
  assert.match(page, /loginPath\("\/studio"\)/);
  assert.doesNotMatch(page, /authProvider=/);
  assert.match(preferences, /Switch to Chinese/);
  assert.match(preferences, /切换到英文/);
  assert.match(preferences, /isChinese \? "English" : "中文"/);
  assert.match(
    preferences,
    /className="preference-button"\s+aria-label=\{localeText\(\s*language,\s*isDark/,
  );
  assert.match(
    preferences,
    /className="preference-button is-language"\s+aria-label=\{localeText\(\s*language,\s*"切换到英文"/,
  );
  assert.match(preferenceModel, /value === "zh" \? "zh" : "en"/);
  assert.doesNotMatch(landing, /额度账本|密钥服务端托管|主工作流/);
  assert.doesNotMatch(landing, /codex-preview|react-loading-skeleton/i);
  assert.match(builtWorker, /vinext/);
});

test("keeps self-hosted MySQL, Garage, and production routes in source", async () => {
  const [
    compose,
    mysqlSchema,
    garageStorage,
    studio,
    studioPage,
    styles,
    mediaRoute,
    referenceRoute,
    replacementRoute,
    videoAnalysisRoute,
    historyRoute,
    data,
    validation,
    vidu,
    prompts,
    pricing,
    packageJson,
    tutorialPortrait,
    tutorialTurnaround,
    tutorialMotionVideo,
    tutorialMotionPoster,
    tutorialTargetA,
    tutorialTargetB,
  ] =
    await Promise.all([
    readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"),
    readFile(
      new URL("../deploy/mysql/init/001-schema.sql", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/garage-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/studio/StudioClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/studio/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/media/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/tasks/reference/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/tasks/replacement/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/video-analysis/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/tasks/history/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/data.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/validation.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/vidu.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/prompts.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/pricing.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    access(new URL("../public/tutorial/character-portrait.webp", import.meta.url)),
    access(new URL("../public/tutorial/character-turnaround.webp", import.meta.url)),
    access(new URL("../public/tutorial/motion-reference.mp4", import.meta.url)),
    access(new URL("../public/tutorial/motion-reference-poster.webp", import.meta.url)),
    access(new URL("../public/tutorial/motion-target-2b.webp", import.meta.url)),
    access(new URL("../public/tutorial/motion-target-tifa.webp", import.meta.url)),
    ]);

  assert.match(compose, /mysql:8\.4/);
  assert.match(compose, /S3_ENDPOINT: http:\/\/127\.0\.0\.1:3900/);
  assert.match(compose, /network_mode: host/);
  assert.match(mysqlSchema, /CREATE TABLE IF NOT EXISTS users/);
  assert.match(mysqlSchema, /video_tasks_release_active_slot/);
  assert.match(garageStorage, /forcePathStyle: true/);
  assert.match(studio, /api\/tasks\/reference/);
  assert.match(studio, /api\/tasks\/replacement/);
  assert.match(studio, /api\/tasks\/motion/);
  assert.match(studio, /studio-tabs-root/);
  assert.match(studio, /TabsTab/);
  assert.match(studio, /composer-tab-panel/);
  assert.match(studio, /AmbientBackdrop variant="studio"/);
  assert.match(studio, /task-border-glow/);
  assert.match(studio, /<Progress/);
  assert.match(studio, /<Button/);
  assert.match(studio, /FeatureTutorialDialog/);
  assert.match(studio, /initialMode/);
  assert.match(studio, /initialMode = "replacement"/);
  assert.match(studio, /reference-submode-list/);
  assert.match(studio, /主要模式 · 推荐/);
  assert.match(studio, /paired-media-sources/);
  assert.match(studio, /media-url-disclosure/);
  assert.match(studio, /或粘贴图片链接/);
  assert.match(styles, /\.paired-media-sources/);
  assert.match(styles, /\.media-source-card \.upload-zone/);
  assert.match(studioPage, /requestedMode === "reference"/);
  assert.match(studioPage, /: "replacement"/);
  assert.doesNotMatch(studio, /<button\b/);
  assert.match(studio, /loading=\{submitting\}/);
  assert.match(studio, /CardPanel className="composer-body"/);
  assert.doesNotMatch(studio, /api\/development\/credits/);
  assert.doesNotMatch(studio, /developmentCreditTopUpEnabled/);
  assert.match(studio, /referenceVideoFiles/);
  assert.match(studio, /viduq2-pro/);
  assert.match(studio, /referencePromptPresets/);
  assert.match(studio, /V16_REPLACEMENT_PROMPT/);
  assert.match(studio, /人物替换 · Q2 Pro/);
  assert.match(studio, /setReferencePrompt\(preset\.prompt\)/);
  assert.match(
    studio,
    /current === V16_REPLACEMENT_PROMPTS\[previousLanguage\]/,
  );
  assert.match(studio, /人物替换/);
  assert.match(studio, /VideoReplace/);
  assert.doesNotMatch(studio, /DEFAULT_REPLACEMENT_PROMPT/);
  assert.doesNotMatch(studio, /reference-v16/);
  assert.doesNotMatch(studio, /replace-beta/);
  assert.doesNotMatch(studio, /专用替换 Beta/);
  assert.match(studio, /Q2 Pro 参考生成/);
  assert.match(studio, /强制再次分析/);
  assert.match(studio, /retryReplacementAnalysis/);
  assert.match(studio, /disabled=\{replacementAnalysisBlocking\}/);
  assert.match(studio, /force: forceNextRequest/);
  assert.match(
    replacementRoute,
    /AI 视频分析尚未成功，请重新分析或关闭分析后再提交/,
  );
  assert.match(videoAnalysisRoute, /force: body\.force === true/);
  assert.match(studio, /model: "viduq2-pro"/);
  assert.doesNotMatch(studio, /option value="viduq2"/);
  assert.doesNotMatch(studio, /setReferenceModel/);
  assert.match(studio, /MEDIA_CHUNK_SIZE/);
  assert.match(studio, /parseApiResponse/);
  assert.match(studio, /ImageFilePreview/);
  assert.match(studio, /VideoFilePreview/);
  assert.match(studio, /function DurationSlider/);
  assert.match(studio, /id="reference-duration"/);
  assert.match(studio, /className="duration-limits"/);
  assert.match(studio, /className="duration-hint"/);
  assert.match(studio, /referenceDurationFromSource/);
  assert.match(studio, /Math\.round\(duration\)/);
  assert.match(studio, /firstReferenceVideoFile/);
  assert.match(studio, /firstReferenceVideoUrl/);
  assert.match(studio, /自动采用第一个视频的时长/);
  assert.match(studio, /id="motion-duration"/);
  assert.match(studio, /id="replacement-duration"/);
  assert.match(studio, /type="range"/);
  assert.match(studio, /onDuration=\{updateReplacementDurationFromSource\}/);
  assert.match(studio, /onDuration=\{updateMotionDurationFromSource\}/);
  assert.doesNotMatch(studio, /视频工作台|Video workspace/);
  assert.doesNotMatch(
    studio,
    /创建视频，并在这里查看所有任务的进度与结果。|Create videos and track every task, result, and credit in one place\./,
  );
  assert.match(studio, /最近任务/);
  assert.match(studio, /className="queue-column"/);
  assert.match(studio, /studio-status-deck/);
  assert.match(studio, /className="concurrency-progress"/);
  assert.match(studio, /生成并发/);
  assert.match(studio, /dashboard\.stats\.queued/);
  assert.match(studio, /text\("等待中", "Waiting"\)/);
  assert.match(studio, /text\("生成完成", "Complete"\)/);
  assert.match(studio, /task-state-panel/);
  assert.match(studio, /task-wait-dots/);
  assert.match(studio, /return isProcessing \?/);
  assert.match(studio, /fillOpacity=\{0\.08\}\s+animated/);
  assert.match(studio, /AlertDialogTrigger/);
  assert.match(studio, /清空历史任务？/);
  assert.match(studio, /method: "DELETE"/);
  assert.doesNotMatch(studio, /PRIMARY WORKFLOW|SECONDARY WORKFLOW|LIVE QUEUE/);
  assert.doesNotMatch(studio, /提交到并发队列|加入并发队列/);
  assert.match(studio, /file-thumbnail-list/);
  assert.match(studio, /file-thumbnail-media/);
  assert.match(studio, /className="source-helper"/);
  assert.match(studio, /className="reference-source-grid"/);
  assert.match(studio, /className="generation-settings-row"/);
  assert.match(studio, /className="form-action-row"/);
  assert.doesNotMatch(studio, /rows=\{4\}/);
  assert.match(studio, /图片缩略图/);
  assert.match(studio, /视频缩略图/);
  assert.match(studio, /清空输入/);
  assert.match(studio, /当前输入已保留/);
  assert.match(studio, /ref=\{referenceFormRef\}/);
  assert.match(studio, /task\.inputImages/);
  assert.match(studio, /task\.inputVideos/);
  assert.match(studio, /function SourceMediaDock/);
  assert.match(studio, /aria-expanded=\{isOpen\}/);
  assert.match(studio, /window\.matchMedia\("\(hover: hover\)"\)\.matches/);
  assert.match(studio, /text\("收起", "Collapse"\)/);
  assert.match(studio, /className="task-result-video"/);
  assert.match(studio, /className="task-result-link"/);
  assert.match(styles, /\.task-input-media/);
  assert.match(styles, /\.task-source-dock\.is-overlay/);
  assert.match(styles, /\.task-source-panel/);
  assert.match(styles, /@keyframes task-source-panel-in/);
  assert.match(studio, /text\("点击更换", "Click to replace"\)/);
  assert.equal(
    studio.match(
      /className="reference-source motion-source media-source-card"/g,
    )?.length,
    2,
  );
  assert.equal(
    studio.match(
      /className="reference-source replacement-source media-source-card"/g,
    )?.length,
    2,
  );
  assert.match(
    styles,
    /grid-template-columns: minmax\(0, 1\.3fr\) minmax\(400px, 0\.7fr\)/,
  );
  assert.match(
    styles,
    /grid-template-columns: minmax\(210px, 1\.08fr\) minmax\(0, 0\.92fr\)/,
  );
  assert.match(
    styles,
    /grid-template-columns: minmax\(128px, 0\.72fr\) minmax\(0, 1\.28fr\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 1180px\) \{\s*\.workspace-grid \{\s*grid-template-columns: 1fr;/,
  );
  assert.match(styles, /@media \(max-width: 1320px\)/);
  assert.match(styles, /\.duration-slider::-webkit-slider-thumb/);
  assert.match(styles, /--duration-progress/);
  assert.match(
    styles,
    /\.queue-panel\.ui-card\s*\{[^}]*position: absolute;[^}]*grid-template-rows: auto minmax\(0, 1fr\);/s,
  );
  assert.match(
    styles,
    /\.creation-form label\.duration-field\s*\{[^}]*grid-template-columns: minmax\(84px, auto\) minmax\(180px, 1fr\) auto;/s,
  );
  assert.match(styles, /html\[data-theme="light"\]/);
  assert.match(styles, /\.preference-controls/);
  assert.match(styles, /html\[data-theme="light"\] \.task-source-trigger-label/);
  assert.match(styles, /\.studio-toolbar/);
  assert.match(styles, /\.landing-workflow-list/);
  assert.match(styles, /\.workflow-panel/);
  assert.match(styles, /\.ui-tabs-indicator/);
  assert.match(styles, /\.ambient-backdrop/);
  assert.match(styles, /@keyframes ambient-halo-primary/);
  assert.match(styles, /\.ui-progress-indicator\[data-indeterminate\]/);
  assert.match(styles, /@keyframes task-progress-travel/);
  assert.match(styles, /\.task-state-panel\.is-waiting/);
  assert.match(styles, /\.task-state-panel\.is-processing/);
  assert.match(styles, /\.task-state-panel\.is-complete/);
  assert.match(styles, /@keyframes task-wait-pulse/);
  assert.match(styles, /\.ui-alert-dialog-popup/);
  assert.match(styles, /\.ui-dialog-popup/);
  assert.match(styles, /\.tutorial-step-nav/);
  assert.match(styles, /@keyframes tutorial-dialog-glow/);
  assert.equal(tutorialPortrait, undefined);
  assert.equal(tutorialTurnaround, undefined);
  assert.equal(tutorialMotionVideo, undefined);
  assert.equal(tutorialMotionPoster, undefined);
  assert.equal(tutorialTargetA, undefined);
  assert.equal(tutorialTargetB, undefined);
  assert.match(
    styles,
    /\.form-grid \{[\s\S]*?align-items: start;[\s\S]*?\}/,
  );
  assert.match(
    styles,
    /\.toggle-row input\[type="checkbox"\] \{[\s\S]*?min-height: 0;/,
  );
  assert.match(
    styles,
    /html\[data-theme="light"\] \.sidebar-item\.is-active \.sidebar-item-copy small/,
  );
  const modeNavigationStart = studio.search(
    /<TabsList\r?\n\s+className="sidebar-section"/,
  );
  const modeNavigationEnd = studio.indexOf(
    "</TabsList>",
    modeNavigationStart,
  );
  const modeNavigation = studio.slice(modeNavigationStart, modeNavigationEnd);
  assert.ok(
    modeNavigation.indexOf('value="reference"') <
      modeNavigation.indexOf('value="motion"'),
  );
  assert.doesNotMatch(modeNavigation, /value="replacement"/);
  assert.ok(
    studio.indexOf('className="studio-toolbar"') <
      studio.indexOf('className="sidebar-account"'),
  );
  assert.match(studio, /usePreferences/);
  assert.match(studio, /sourceAspectRatio/);
  assert.match(studio, /return width > height \? "16:9" : "9:16"/);
  assert.match(studio, /useState<AspectRatio>\("9:16"\)/);
  assert.match(studio, /setReferenceAspectRatio/);
  assert.match(studio, /setReplacementAspectRatio/);
  assert.match(studio, /replacementSourceDurationRef/);
  assert.match(studio, /replacementDurationUpdateRef/);
  assert.match(studio, /apiErrorMessage/);
  assert.match(studio, /默认竖屏；添加参考视频后自动匹配横竖方向/);
  assert.match(
    studio,
    /text\("参考生成", "Reference generation"\),\s*prompt:/,
  );
  assert.match(
    studio,
    /text\("动作迁移", "Motion transfer"\),\s*imageUrl/,
  );
  assert.match(
    studio,
    /text\("人物替换", "Character replacement"\),\s*imageUrls/,
  );
  assert.equal(studio.match(/formElement\.reset\(\)/g)?.length, 1);
  assert.doesNotMatch(studio, /event\.currentTarget\.reset\(\)/);
  assert.match(referenceRoute, /imageUrls: persistentMediaUrls\(input\.images\)/);
  assert.match(referenceRoute, /videoUrls: persistentMediaUrls\(input\.videos\)/);
  assert.match(replacementRoute, /kind: "replacement"/);
  assert.doesNotMatch(replacementRoute, /REPLACEMENT_RESERVE_CREDITS/);
  assert.doesNotMatch(replacementRoute, /usesV16/);
  assert.match(replacementRoute, /reserveReferenceCredits\(input\)/);
  assert.match(replacementRoute, /createV16ReplacementPrompt/);
  assert.match(replacementRoute, /input\.language/);
  assert.match(replacementRoute, /createReferenceTask/);
  assert.match(replacementRoute, /images: input\.images/);
  assert.doesNotMatch(replacementRoute, /createReplacementTask\(\{/);
  assert.doesNotMatch(replacementRoute, /isViduEndpointUnavailable/);
  assert.doesNotMatch(replacementRoute, /fallbackEngine/);
  assert.doesNotMatch(replacementRoute, /viduq2-pro-v16-fallback/);
  assert.doesNotMatch(replacementRoute, /increaseTaskReservation/);
  assert.match(replacementRoute, /getReadyVideoAnalysis/);
  assert.match(replacementRoute, /effectiveV16Prompt/);
  assert.doesNotMatch(replacementRoute, /effectiveBetaPrompt/);
  assert.match(videoAnalysisRoute, /requireApiUser/);
  assert.match(videoAnalysisRoute, /resolveVideoAnalysisSource/);
  assert.match(videoAnalysisRoute, /acquireVideoAnalysisLease/);
  assert.match(videoAnalysisRoute, /startVideoAnalysisWithGemini/);
  assert.match(videoAnalysisRoute, /pollVideoAnalysisWithGemini/);
  assert.match(videoAnalysisRoute, /attachVideoAnalysisInteraction/);
  assert.match(videoAnalysisRoute, /completeVideoAnalysisLease/);
  assert.doesNotMatch(replacementRoute, /当前素材超过 V16 支持的 8 秒/);
  assert.doesNotMatch(data, /event: "development_top_up"/);
  assert.match(data, /taskInputMedia\(task\.inputSummary, task\.kind\)/);
  assert.match(data, /Array\.isArray\(summary\.imageUrls\)/);
  assert.match(
    data,
    /when \$\{videoTasks\.state\} = 'processing' then 1 else 0/,
  );
  assert.match(
    data,
    /when \$\{videoTasks\.state\} in \('submitting', 'created', 'queueing'\) then 1 else 0/,
  );
  assert.doesNotMatch(data, /activeRows/);
  assert.doesNotMatch(
    data,
    /请等待已有任务完成后再提交/,
  );
  assert.match(data, /orderBy\(asc\(videoTasks\.createdAt\)\)/);
  assert.match(data, /clearTaskHistory/);
  assert.match(
    data,
    /state IN \('success', 'failed'\)/,
  );
  assert.match(historyRoute, /export async function DELETE/);
  assert.match(historyRoute, /clearTaskHistory\(user\.id\)/);
  assert.match(mediaRoute, /createMultipartUpload/);
  assert.match(mediaRoute, /resumeMultipartUpload/);
  assert.match(mediaRoute, /action === "complete"/);
  assert.match(validation, /参考视频最多 2 个/);
  assert.match(validation, /使用视频参考时，参考图片最多 4 张/);
  assert.match(validation, /model !== "viduq2-pro"/);
  assert.doesNotMatch(validation, /REFERENCE_MODELS/);
  assert.match(validation, /duration < 1 \|\| duration > 10/);
  assert.match(validation, /duration < 2 \|\| duration > 30/);
  assert.match(validation, /parseReplacementInput/);
  assert.match(validation, /1 到 4 张同一替换人物/);
  assert.match(validation, /engine && engine !== "reference-v16"/);
  assert.doesNotMatch(validation, /engine !== "replace-beta"/);
  assert.match(validation, /object\.length > 100/);
  assert.match(validation, /aiAnalysisEnabled/);
  assert.match(validation, /const promptLimit = 2000/);
  assert.match(validation, /\|\| "9:16"/);
  assert.match(vidu, /videos: input\.videos/);
  assert.match(vidu, /bgm: input\.bgm/);
  assert.doesNotMatch(vidu, /viduFetch\("\/replace"/);
  assert.doesNotMatch(vidu, /isViduEndpointUnavailable/);
  assert.doesNotMatch(vidu, /upstreamStatus === 404/);
  assert.doesNotMatch(vidu, /object: input\.object/);
  assert.doesNotMatch(vidu, /image: input\.imageUrl/);
  assert.match(prompts, /V16_REPLACEMENT_PROMPT/);
  assert.match(prompts, /V16_REPLACEMENT_PROMPTS/);
  assert.match(prompts, /身份锁｜最高优先级/);
  assert.doesNotMatch(prompts, /不可改写的时空母版/);
  assert.doesNotMatch(prompts, /immutable spatiotemporal master/);
  assert.match(prompts, /人物和物体的接触点/);
  assert.match(prompts, /遮挡与显露顺序/);
  assert.match(prompts, /忽略参考视频中后期叠加字幕的文字、样式、位置与出现时机/);
  assert.match(prompts, /真实摄影机拍摄真人的实拍素材/);
  assert.match(prompts, /不得额外叠加强颗粒、故障或风格滤镜/);
  assert.match(prompts, /人物参考图拥有绝对优先级/);
  assert.match(prompts, /larger, closer, or clearer/);
  assert.match(prompts, /动作、姿态与节奏/);
  assert.match(prompts, /AI 动作／交互／运镜锁/);
  assert.match(prompts, /slice\(0, group\.limit\)/);
  assert.doesNotMatch(prompts, /analysis\.overview/);
  assert.match(studio, /referenceEstimatedCredits/);
  assert.match(studio, /replacementEstimatedCredits/);
  assert.match(studio, /人物参考图（1–4 张）/);
  assert.match(studio, /至少加入一张清晰、无遮挡、脸部占比较大的特写/);
  assert.match(studio, /motionEstimatedCredits/);
  assert.match(studio, /submit-credit-estimate/);
  assert.match(pricing, /reserveReferenceCredits/);
  assert.match(pricing, /reserveMotionCredits/);
  assert.doesNotMatch(pricing, /REPLACEMENT_RESERVE_CREDITS/);
  assert.match(pricing, /perAdditionalSecond/);
  assert.match(packageJson, /"@base-ui\/react": "\^1\.6\.0"/);
  assert.match(packageJson, /"ogl": "\^1\.0\.11"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
  await access(new URL("../drizzle/0000_icy_gorgon.sql", import.meta.url));
});

function colorTokens(block) {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[\da-f]{6})/gi)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

function relativeLuminance(color) {
  const channels = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(color.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return (
    channels[0] * 0.2126 +
    channels[1] * 0.7152 +
    channels[2] * 0.0722
  );
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

test("light and dark theme tokens keep text and controls visible", async () => {
  const styles = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const darkBlock = styles.match(/:root \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const lightBlock =
    styles.match(/html\[data-theme="light"\] \{([\s\S]*?)\n\}/)?.[1] ?? "";

  for (const [theme, tokens] of [
    ["dark", colorTokens(darkBlock)],
    ["light", colorTokens(lightBlock)],
  ]) {
    for (const foreground of [
      "ink",
      "muted",
      "faint",
      "accent",
      "danger",
      "success",
      "warning",
    ]) {
      assert.ok(
        contrastRatio(tokens[foreground], tokens.surface) >= 4.5,
        `${theme} ${foreground} text must reach 4.5:1 on the surface`,
      );
    }

    assert.ok(
      contrastRatio(tokens["accent-ink"], tokens.accent) >= 4.5,
      `${theme} primary button text must reach 4.5:1`,
    );
    assert.ok(
      contrastRatio(tokens["control-border"], tokens.control) >= 3,
      `${theme} control boundaries must reach 3:1`,
    );
  }
});
