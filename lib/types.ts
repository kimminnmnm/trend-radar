import type { AnalysisStatus, CollisionAnalysis, ContentPlan, EvidenceItem, LabReview, SeriesStats, TrendAnalysis, TrendDna } from "./schemas";
import type { ValidationLog } from "./signal";

export type EvidenceStatus = AnalysisStatus;

/** 화면에 표시되는 결과의 출처 상태 */
export type DataStatus = "LIVE" | "CACHED" | "SAVED" | "DEMO" | "ERROR" | "NOT ANALYZED" | "NOT AVAILABLE" | "LOADING";

export type Trend = {
  id: string;
  name: string;
  en: string;
  category: "Subculture" | "Lifestyle" | "Fashion" | "Entertainment" | "Technology" | "Live";
  summary: string;
  signal: string;
  status: EvidenceStatus;
  tags: string[];
  accent: string;
};

export type Evidence = {
  id: string;
  title: string;
  source: string;
  date: string;
  collectedAt: string;
  excerpt: string;
  status: EvidenceStatus;
  url?: string;
};

export type InstagramCollection = { status: "live" | "cached" | "error" | "skipped"; hashtag: string; count: number; message?: string };

export type SavedItem = {
  id: string;
  type: "insight" | "plan";
  title: string;
  subtitle: string;
  createdAt: string;
  mode?: "live" | "demo";
  payload?: SavedPlanPayload;
};

export type SavedPlanPayload = {
  kind: "content-plan";
  plan: ContentPlan;
  references: EvidenceItem[];
  brief: { platform: string; format: string; target: string; tone: string };
  trendNames: string[];
  trendKeys: string[];
  collisionId?: string;
  labId?: string;
  model: string;
  analyzedAt: string;
  validation?: ValidationLog;
};

export type LiveAnalysisSnapshot = {
  id: string;
  trendId: string;
  trendName: string;
  keywords: string[];
  periodMonths: 1 | 3 | 12;
  summary: string;
  analyzedAt: string;
  source: "NAVER DataLab + OpenAI";
  whyReport?: TrendAnalysis;
  naverSignal?: unknown;
  whyPromptVersion?: string;
  whyModel?: string;
  whyValidation?: ValidationLog;
  evidence?: EvidenceItem[];
  signalStats?: SeriesStats[];
  instagram?: InstagramCollection;
  dna?: TrendDna;
  dnaGeneratedAt?: string;
  dnaModel?: string;
  dnaPromptVersion?: string;
  dnaValidation?: ValidationLog;
  embedding?: number[] | null;
};

export type SavedCollision = {
  id: string;
  trendKeys: string[];
  trendNames: string[];
  analyzedAt: string;
  model: string;
  promptVersion: string;
  result: CollisionAnalysis;
  overlaps: Array<{ label: string; dimension: string; trendKeys: string[] }>;
  similarities: Array<{ a: string; b: string; cosine: number }>;
  validation: ValidationLog;
  /** 분석 당시의 네임스페이스 근거 원장(T1:IG-01 …). 이후 재분석과 무관하게 인용을 보존한다. */
  ledger?: EvidenceItem[];
};

export type SavedLabReview = {
  id: string;
  trendKeys: string[];
  trendNames: string[];
  collisionId?: string;
  brief: { brand: string; description: string; audience: string; platform: string; opportunity: string };
  analyzedAt: string;
  model: string;
  result: LabReview;
  validation: ValidationLog;
  ledger?: EvidenceItem[];
};

export type WatchCandidate = {
  keyword: string;
  sources: string[];
  addedAt: string;
  validation?: { batchId: string; collectedAt: string; batchSize: number; rank: number; stat: SeriesStats };
};

/** 2030 NOW 스캔 결과: 웹 검색 후보(출처 검증) → NAVER 19–39세 검색 관심도 검증 */
export type NowTrendItem = {
  keyword: string;
  category: string;
  summary: string;
  sources: Array<{ url: string; title?: string }>;
  stats: SeriesStats;
  series: Array<{ period: string; value: number }>;
  batch: number;
  scale: number;
  /** 관심도 수준의 배치 간 환산 정밀도 */
  levelPrecision: "exact" | "estimated" | "low";
  /** 최근 1/3 평균의 초기 1/3 평균 대비 변화율(%). 순위 기준 */
  changePct: number | null;
};

export type NowTrendReport = {
  /* 기본 정렬은 changePct 내림차순 */
  generatedAt: string;
  model: string;
  promptVersion: string;
  audience: { ages: string[]; label: string };
  period: { startDate: string; endDate: string; timeUnit: string };
  anchor: string | null;
  items: NowTrendItem[];
  insufficient: Array<{ keyword: string; reason: string }>;
  droppedUnverified: number;
  searchedSources: number;
  methodology: string[];
};

/** Instagram 해시태그 최근 게시 속도. 전체 게시물 수가 아니라 recent_media(최근 24시간)에서 측정한 값이다. */
export type IgPulseItem = {
  tag: string;
  origin: "tracked" | "manual" | "discovered";
  keyword?: string;
  category?: string;
  summary?: string;
  sources: Array<{ url: string; title?: string }>;
  collectedAt: string;
  found: boolean;
  sampled: number;
  pagesFetched: number;
  complete: boolean;
  posts24h: number;
  oldestAt: string | null;
  spanHours: number | null;
  perHour: number | null;
  rateBasis: "24h-full" | "recent-sample";
  samplePosts: Array<{ permalink: string; timestamp: string }>;
  /** 이번 스캔에서 주간 해시태그 한도를 새로 썼는지 */
  usedQuota: boolean;
};

export type IgPulseReport = {
  generatedAt: string;
  promptVersion: string;
  model: string | null;
  items: IgPulseItem[];
  deferred: Array<{ tag: string; reason: string }>;
  failed: Array<{ tag: string; reason: string }>;
  droppedUnverified: number;
  searchedSources: number;
  quota: { limit: number; reserve: number; usedBefore: number; usedAfter: number };
  methodology: string[];
};
