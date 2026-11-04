import { z } from "zod";

export const evidenceStatusSchema = z.enum(["Verified Signal", "Supported Hypothesis", "Creative Hypothesis"]);
/** 분석 항목 상태. 근거 ID 검증에 실패한 주장은 서버에서 Insufficient Evidence로 낮춘다. */
export const analysisStatusSchema = z.enum(["Verified Signal", "Supported Hypothesis", "Creative Hypothesis", "Insufficient Evidence"]);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

/** 서버가 실제 API 응답으로만 만드는 근거 원장 항목. AI는 이 목록을 만들 수 없고 ID로 참조만 한다. */
export const evidenceItemSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(["naver_series", "instagram_media", "youtube_video", "web_source"]),
  title: z.string().max(200),
  source: z.string().max(120),
  url: z.string().max(500).optional(),
  date: z.string().max(40).optional(),
  collectedAt: z.string().max(40),
  excerpt: z.string().max(800),
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export const seriesStatsSchema = z.object({
  title: z.string(),
  points: z.number(),
  mean: z.number(),
  peak: z.object({ period: z.string(), ratio: z.number() }),
  latest: z.object({ period: z.string(), ratio: z.number() }),
  earlyAvg: z.number(),
  recentAvg: z.number(),
  direction: z.enum(["상승", "하락", "유지", "데이터 부족"]),
  /** 마지막 주·월이 진행 중이라 계산에서 제외했는지 */
  partialLastExcluded: z.boolean().optional(),
});
export type SeriesStats = z.infer<typeof seriesStatsSchema>;

/** WHY의 배경·사건·확산 콘텐츠·브랜드 사례. 웹 출처(WEB-xx)로 보강하며, 이전 버전 보고서에는 없다. */
export const whyContextSchema = z.object({
  background: z.object({ summary: z.string(), status: analysisStatusSchema, evidenceIds: z.array(z.string()) }),
  events: z.array(z.object({ date: z.string(), label: z.string(), evidenceIds: z.array(z.string()) })),
  spreadContents: z.array(z.object({ title: z.string(), explanation: z.string(), status: analysisStatusSchema, evidenceIds: z.array(z.string()) })),
  brandCases: z.array(z.object({ brand: z.string(), summary: z.string(), date: z.string(), evidenceIds: z.array(z.string()) })),
});
export type WhyContext = z.infer<typeof whyContextSchema>;

/** Current-state observation and the representative WHY insight. Origin is intentionally separate. */
export const whyInsightSchema = z.object({
  summary: z.string(),
  status: analysisStatusSchema,
  evidenceIds: z.array(z.string()),
});

/**
 * T5: WHY가 넘겨받는 "선택한 현상" 맥락. 키워드 문자열이 아니라 현상 ID·주체·행동·대상·방향·문화 맥락·관측 기간·근거 ID·근거 상태.
 * keyword = Parent Keyword. 발견(T1) 후보는 주체·대상을 따로 뽑지 않으므로 빈 값일 수 있다(지어내지 않음).
 */
/** V3(E1): 방향 제안에 넘기는 WHAT'S HAPPENING NOW? 세부 현상 후보(클라이언트 저장 기록에서 온 요약 — 근거 ID 없음). */
export const observedPhenomenonSchema = z.object({
  title: z.string().trim().min(1).max(120),
  behavior: z.string().trim().max(300).default(""),
  status: z.enum(["Observed", "Emerging Signal"]),
  independentSources: z.number().int().min(0).max(50).default(0),
});
export type ObservedPhenomenon = z.infer<typeof observedPhenomenonSchema>;

export const phenomenonContextSchema = z.object({
  phenomenonId: z.string().trim().min(1).max(120),
  keyword: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(80),
  subject: z.string().max(120).default(""),
  action: z.string().max(300).default(""),
  object: z.string().max(120).default(""),
  direction: z.string().max(60).default(""),
  culturalContext: z.string().max(400).default(""),
  coreBehavior: z.string().max(300).default(""),
  window: z.object({ days: z.number().int().min(1).max(365), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  evidenceIds: z.array(z.string().regex(/^[A-Za-z0-9:_-]{1,40}$/)).max(12).default([]),
  verificationStatus: z.enum(["OBSERVED", "EMERGING", "INSUFFICIENT EVIDENCE"]),
  independentSources: z.number().int().min(0).max(99).default(0),
  searchTerms: z.array(z.string().trim().min(1).max(40)).max(5).default([]),
  origin: z.enum(["phenomenon", "connection"]).default("phenomenon"),
});
export type PhenomenonContext = z.infer<typeof phenomenonContextSchema>;
/** T5: 현상 모드 WHY의 추가 결과. WHO·HOW와 서버의 주제 고정 검사. 리포트 JSON 안에 저장돼 새로고침·클라우드 복원에도 남는다. */
export const whyPhenomenonSchema = z.object({
  context: phenomenonContextSchema,
  who: whyInsightSchema,
  how: whyInsightSchema,
  reusedEvidenceIds: z.array(z.string()).default([]),
  checks: z.object({ anchorTerms: z.array(z.string()), anchored: z.boolean(), warnings: z.array(z.string()) }).default({ anchorTerms: [], anchored: true, warnings: [] }),
});
export type WhyPhenomenon = z.infer<typeof whyPhenomenonSchema>;

export const trendAnalysisSchema = z.object({
  trend: z.string().min(1),
  /** Added in WHY v5. Optional so saved v1-v4 reports remain readable without re-analysis. */
  what: whyInsightSchema.optional(),
  overview: whyInsightSchema.optional(),
  origin: z.object({ summary: z.string(), evidenceIds: z.array(z.string()) }),
  triggers: z.array(z.object({ title: z.string(), explanation: z.string(), status: analysisStatusSchema, evidenceIds: z.array(z.string()) })),
  timeline: z.array(z.object({ date: z.string(), label: z.string(), evidenceIds: z.array(z.string()) })),
  motivations: z.array(z.object({ label: z.string(), explanation: z.string(), status: analysisStatusSchema, evidenceIds: z.array(z.string()).default([]) })),
  futureScenarios: z.array(z.object({ title: z.string(), explanation: z.string(), status: z.literal("Creative Hypothesis") })),
  missingEvidence: z.array(z.string()),
  context: whyContextSchema.optional(),
  /** T5: 선택한 현상 분석일 때만. 없으면 기존 키워드 분석. */
  phenomenon: whyPhenomenonSchema.optional(),
});
export type TrendAnalysis = z.infer<typeof trendAnalysisSchema>;

export const dnaDimensionNames = ["Aesthetic", "Emotion", "Behavior", "Object", "Culture", "Audience"] as const;
export type DnaDimensionName = (typeof dnaDimensionNames)[number];

export const dnaAttributeSchema = z.object({
  label: z.string(),
  description: z.string(),
  evidenceIds: z.array(z.string()),
  status: analysisStatusSchema,
  limitations: z.array(z.string()),
});
export type DnaAttribute = z.infer<typeof dnaAttributeSchema>;

export const trendDnaSchema = z.object({
  trend: z.string().min(1),
  dimensions: z.array(z.object({ dimension: z.enum(dnaDimensionNames), summary: z.string(), attributes: z.array(dnaAttributeSchema) })),
  dominantPattern: z.object({ title: z.string(), explanation: z.string(), evidenceIds: z.array(z.string()), status: analysisStatusSchema }),
  missingEvidence: z.array(z.string()),
});
export type TrendDna = z.infer<typeof trendDnaSchema>;

export const connectionTypeSchema = z.enum(["Shared Cultural Attribute", "Observed Connection", "Hypothesized Connection"]);
export type ConnectionType = z.infer<typeof connectionTypeSchema>;

export const collisionSchema = z.object({
  title: z.string(),
  sharedAttributes: z.array(z.object({ label: z.string(), description: z.string(), trendKeys: z.array(z.string()), connectionType: connectionTypeSchema, evidenceIds: z.array(z.string()), status: analysisStatusSchema })),
  culturalTensions: z.array(z.object({ title: z.string(), description: z.string(), status: analysisStatusSchema })),
  motivationHypotheses: z.array(z.object({ label: z.string(), description: z.string(), evidenceIds: z.array(z.string()), status: analysisStatusSchema })),
  emergingSignals: z.array(z.object({ label: z.string(), description: z.string(), evidenceIds: z.array(z.string()), status: analysisStatusSchema })),
  creativeOpportunities: z.array(z.object({ title: z.string(), concept: z.string(), format: z.string(), status: z.literal("Creative Hypothesis") })),
  limitations: z.array(z.string()),
});
export type CollisionAnalysis = z.infer<typeof collisionSchema>;

export const labDimensionNames = ["Demand", "Cultural Relevance", "Novelty", "Audience Fit", "Brand Fit", "Feasibility"] as const;
export const labReviewSchema = z.object({
  overall: z.object({ verdict: z.string(), summary: z.string() }),
  dimensions: z.array(z.object({ name: z.enum(labDimensionNames), verdict: z.string(), rationale: z.string(), basis: z.enum(["Data Evidence", "AI Inference", "Insufficient Evidence"]), evidenceIds: z.array(z.string()), status: analysisStatusSchema })),
  risks: z.array(z.string()),
});
export type LabReview = z.infer<typeof labReviewSchema>;

export const contentPlanSchema = z.object({
  title: z.string(),
  background: z.string(),
  target: z.string(),
  trendEvidence: z.array(z.object({ claim: z.string(), evidenceIds: z.array(z.string()), status: analysisStatusSchema })),
  consumerInsight: z.object({ text: z.string(), evidenceIds: z.array(z.string()), status: analysisStatusSchema }),
  culturalConnection: z.object({ text: z.string(), status: analysisStatusSchema }),
  structure: z.array(z.object({ step: z.string(), heading: z.string(), detail: z.string() })),
  hooks: z.array(z.string()),
  caption: z.string(),
  cta: z.string(),
  referenceIds: z.array(z.string()),
  verifyBeforePublishing: z.array(z.string()),
});
export type ContentPlan = z.infer<typeof contentPlanSchema>;

/** Lab·Studio·Collision이 공유하는 입력. 클라이언트에 저장된 LIVE 분석 결과를 그대로 전달한다. */
export const trendContextSchema = z.object({
  key: z.string().min(1).max(120),
  name: z.string().min(1).max(100),
  keywords: z.array(z.string().max(100)).max(5),
  analyzedAt: z.string().max(40),
  why: trendAnalysisSchema.partial().passthrough(),
  dna: trendDnaSchema.optional(),
  evidence: z.array(evidenceItemSchema).max(40),
  signalStats: z.array(seriesStatsSchema).max(5).optional(),
});
export type TrendContext = z.infer<typeof trendContextSchema>;
