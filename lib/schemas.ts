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

export const trendAnalysisSchema = z.object({
  trend: z.string().min(1),
  origin: z.object({ summary: z.string(), evidenceIds: z.array(z.string()) }),
  triggers: z.array(z.object({ title: z.string(), explanation: z.string(), status: analysisStatusSchema, evidenceIds: z.array(z.string()) })),
  timeline: z.array(z.object({ date: z.string(), label: z.string(), evidenceIds: z.array(z.string()) })),
  motivations: z.array(z.object({ label: z.string(), explanation: z.string(), status: analysisStatusSchema, evidenceIds: z.array(z.string()).default([]) })),
  futureScenarios: z.array(z.object({ title: z.string(), explanation: z.string(), status: z.literal("Creative Hypothesis") })),
  missingEvidence: z.array(z.string()),
  context: whyContextSchema.optional(),
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
