export type TaskKind = "reference" | "replacement" | "motion";

export type TaskState =
  | "submitting"
  | "created"
  | "queueing"
  | "processing"
  | "success"
  | "failed";

export type StudioTask = {
  id: string;
  kind: TaskKind;
  title: string;
  prompt: string;
  model: string;
  state: TaskState;
  duration: number;
  resolution: string;
  aspectRatio: string;
  chargedCredits: number;
  inputImages: string[];
  inputVideos: string[];
  outputUrl: string | null;
  coverUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type StudioDashboard = {
  user: {
    displayName: string;
    email: string;
    creditBalance: number;
    concurrencyLimit: number;
    passwordEnabled: boolean;
  };
  stats: {
    active: number;
    queued: number;
    completed: number;
    history: number;
  };
  tasks: StudioTask[];
};

export type ReferenceTaskInput = {
  title?: string;
  prompt: string;
  images: string[];
  videos: string[];
  model: "viduq2-pro";
  duration: number;
  resolution: "540p" | "720p" | "1080p";
  aspectRatio: "16:9" | "9:16" | "4:3" | "3:4" | "1:1";
  bgm: boolean;
  offPeak: boolean;
};

export type MotionTaskInput = {
  title?: string;
  imageUrl: string;
  videoUrl: string;
  duration: number;
};

export type ReplacementTaskInput = {
  title?: string;
  images: string[];
  videoUrl: string;
  object: string;
  prompt?: string;
  aiAnalysisEnabled: boolean;
  language: "zh" | "en";
  duration: number;
  resolution: ReferenceTaskInput["resolution"];
  aspectRatio: ReferenceTaskInput["aspectRatio"];
};

export type LocalizedAnalysisText = {
  zh: string;
  en: string;
};

export type VideoAnalysisSummary = {
  overview: LocalizedAnalysisText;
  people: LocalizedAnalysisText[];
  actions: LocalizedAnalysisText[];
  camera: LocalizedAnalysisText[];
  scene: LocalizedAnalysisText[];
  occlusions: LocalizedAnalysisText[];
  preserve: LocalizedAnalysisText[];
  risks: LocalizedAnalysisText[];
};

export type VideoAnalysisResponse = {
  status: "analyzing" | "ready" | "failed";
  cacheHit?: boolean;
  summary?: VideoAnalysisSummary;
  retryAfterMs?: number;
  message?: string;
};
