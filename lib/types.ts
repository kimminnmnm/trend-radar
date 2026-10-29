import type { AnalysisStatus, CollisionAnalysis, ContentPlan, EvidenceItem, LabReview, SeriesStats, TrendAnalysis, TrendDna } from "./schemas";
import type { YouTubeCollection } from "./youtube";
import type { ValidationLog } from "./signal";
import type { StandardizedCultureMetadata } from "./culture-metadata";
import type { CulturalRelationshipResult } from "./cultural-relationship-engine";

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
export type YouTubeEvidenceCollection = YouTubeCollection | { status: "error" | "skipped"; query: string; videos: []; hourlyDistribution: []; message: string };

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
  category?: Trend["category"];
  /** Culture Map에서 사용자가 직접 지정한 분류. AI나 데이터가 정한 분류가 아니다. */
  categorySource?: "user";
  keywords: string[];
  periodMonths: 1 | 3 | 12;
  summary: string;
  analyzedAt: string;
  source: "NAVER DataLab + OpenAI" | "NAVER DataLab + YouTube + OpenAI";
  whyReport?: TrendAnalysis;
  naverSignal?: unknown;
  whyPromptVersion?: string;
  whyModel?: string;
  whyValidation?: ValidationLog;
  evidence?: EvidenceItem[];
  signalStats?: SeriesStats[];
  instagram?: InstagramCollection;
  web?: WebCollection;
  youtube?: YouTubeEvidenceCollection;
  dna?: TrendDna;
  dnaGeneratedAt?: string;
  dnaModel?: string;
  dnaPromptVersion?: string;
  dnaValidation?: ValidationLog;
  embedding?: number[] | null;
  /** Derived, lossless v1 metadata. Supabase persistence is deferred to Culture Map phase 2. */
  cultureMetadata?: StandardizedCultureMetadata;
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
  hashtagId: string | null;
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
  /** 기존 hashtag ID 재사용인지 사용자가 승인한 신규 검색인지 */
  searchKind?: "refresh" | "new";
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
  quota: {
    limit: number;
    reserve: number;
    usedBefore: number;
    usedAfter: number;
    source?: "meta_api" | "local_fallback";
    checkedAt?: string;
    recent?: Array<{ tag: string; hashtagId: string }>;
  };
  methodology: string[];
};

/** WHY 웹 출처(뉴스·공개 자료) 수집 결과 요약 */
export type WebCollection = { status: "live" | "skipped" | "error"; count: number; searchedSources: number; droppedUnverified: number; message?: string; model?: string };

/** 한 트렌드의 표준 문화 메타데이터 한 버전. 같은 DNA 생성 시각은 같은 버전이다. */
export type CultureVersionRecord = {
  trendId: string;
  trendName: string;
  version: number;
  /** DNA 생성 시각(metadata.sourceAnalyzedAt). 버전 식별자로 쓴다. */
  analyzedAt: string;
  recordedAt: string;
  whyAnalyzedAt: string;
  model?: string;
  promptVersion?: string;
  hasEmbedding: boolean;
  metadata: StandardizedCultureMetadata;
  /** Supabase에 저장된 경우의 행 ID. */
  cloud?: { trendUuid: string; versionUuid: string; versionNumber: number };
};

/** 두 트렌드 버전 사이의 관계 계산 결과. 관계가 없다는 결과(exists=false)도 저장해 같은 계산을 반복하지 않는다. */
export type CultureRelationRecord = {
  key: string;
  sourceTrendId: string;
  targetTrendId: string;
  sourceVersion: number;
  targetVersion: number;
  computedAt: string;
  result: CulturalRelationshipResult;
  cloudSavedAt?: string;
};

export const RELATION_RATING_CRITERIA = [
  { key: "understanding", label: "연결 이유 이해도" },
  { key: "persuasiveness", label: "관계의 설득력" },
  { key: "discovery", label: "새로운 아이디어 발견" },
  { key: "usefulness", label: "콘텐츠 기획 활용도" },
] as const;
export type RelationRatingKey = (typeof RELATION_RATING_CRITERIA)[number]["key"];

/** Culture Map 관계에 대한 사용자 판단. 숨김은 화면에서만 적용하며 관계 데이터는 지우지 않는다. */
export type CultureRelationFeedback = {
  /** 정렬된 "trendA|trendB" */
  pair: string;
  hidden: boolean;
  ratings: Partial<Record<RelationRatingKey, 1 | 2 | 3 | 4 | 5>>;
  updatedAt: string;
  /** 평가 당시 관계 요약(나중에 관계가 바뀌어도 무엇을 평가했는지 남긴다). */
  context: { names: [string, string]; types: string[]; score: number | null };
};
