import { z } from "zod";
import { cultureRelationTypeSchema } from "./culture-database";
import { standardizedCultureMetadataSchema, type StandardizedCultureAttribute, type StandardizedCultureMetadata } from "./culture-metadata";
import { analysisStatusSchema, evidenceItemSchema, type EvidenceItem } from "./schemas";

export const SEMANTIC_RELATION_THRESHOLD = 0.45;
export const CREATIVE_ANCHOR_THRESHOLD = 0.35;
export const RELATION_SCORE_WEIGHTS = { attribute: 0.45, semantic: 0.30, observed: 0.25 } as const;

export type RelationshipTrendInput = {
  trendId: string;
  trendName: string;
  keywords: string[];
  metadata: StandardizedCultureMetadata;
  evidence: EvidenceItem[];
  embedding?: number[] | null;
};

const relationshipAttributeSchema = z.object({ attributeId: z.string(), canonicalLabel: z.string(), dimension: z.string() });
const relationshipSignalSchema = z.object({
  type: cultureRelationTypeSchema,
  score: z.number().min(0).max(1).nullable(),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string()),
  verificationStatus: analysisStatusSchema,
});

export const culturalRelationshipResultSchema = z.object({
  exists: z.boolean(),
  sourceTrendId: z.string(),
  targetTrendId: z.string(),
  primaryType: cultureRelationTypeSchema.nullable(),
  signals: z.array(relationshipSignalSchema),
  sharedAttributes: z.array(relationshipAttributeSchema),
  differentialAttributes: z.object({ source: z.array(relationshipAttributeSchema), target: z.array(relationshipAttributeSchema) }),
  score: z.number().min(0).max(1),
  scoreBreakdown: z.object({ attribute: z.number().min(0).max(1), semantic: z.number().min(0).max(1).nullable(), observed: z.number().min(0).max(1) }),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string()),
  verificationStatus: analysisStatusSchema,
  limitations: z.array(z.string()),
  analyzedAt: z.string().datetime(),
});
export type CulturalRelationshipResult = z.infer<typeof culturalRelationshipResultSchema>;

const round = (value: number) => Math.round(value * 1000) / 1000;
const unique = <T>(items: T[]) => [...new Set(items)];
const normalizeText = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s#·_\-–—/\\()[\]{}'".,!?]/g, "");

export function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return null;
  let dot = 0, normA = 0, normB = 0;
  for (let index = 0; index < a.length; index += 1) { dot += a[index] * b[index]; normA += a[index] * a[index]; normB += b[index] * b[index]; }
  if (!normA || !normB) return null;
  return Math.max(-1, Math.min(1, dot / Math.sqrt(normA * normB)));
}

function groundedAttributes(metadata: StandardizedCultureMetadata) {
  const grounded = metadata.dimensions.flatMap((dimension) => dimension.attributes).filter((attribute) =>
    attribute.verificationStatus !== "Insufficient Evidence" && attribute.basis !== "AI Hypothesis" && attribute.evidenceIds.length > 0,
  );
  // 동의어 규칙으로 한 트렌드의 여러 라벨이 같은 Attribute ID가 되면 하나로 합친다(근거 ID는 모두 유지).
  // 합치지 않으면 공통 속성이 중복 표시되고 Jaccard 점수가 부풀려진다.
  const byId = new Map<string, StandardizedCultureAttribute>();
  for (const attribute of grounded) {
    const existing = byId.get(attribute.attributeId);
    byId.set(attribute.attributeId, existing ? { ...existing, evidenceIds: unique([...existing.evidenceIds, ...attribute.evidenceIds]) } : attribute);
  }
  return [...byId.values()];
}
const compactAttribute = (attribute: StandardizedCultureAttribute) => ({ attributeId: attribute.attributeId, canonicalLabel: attribute.canonicalLabel, dimension: attribute.dimension });
function qualifiedEvidenceIds(trend: RelationshipTrendInput, attributes: StandardizedCultureAttribute[]) {
  return unique(attributes.flatMap((attribute) => attribute.evidenceIds.map((id) => `${trend.trendId}:${id}`)));
}
function observedMentions(source: RelationshipTrendInput, target: RelationshipTrendInput) {
  // 자기 이름·키워드와 겹치는 용어는 뺀다. 예: 러닝 분석의 비교 키워드에 '마라톤'이 있으면, 마라톤 자료의 '#마라톤'이
  // 상대(러닝)를 언급한 것으로 잘못 잡힌다(PHASE 6 검증에서 발견한 오탐). 수집 키워드로 모은 자료는 교차 언급이 아니다.
  const own = [source.trendName, ...source.keywords].map(normalizeText).filter((term) => term.length >= 2);
  const terms = unique([target.trendName, ...target.keywords].map(normalizeText).filter((term) => term.length >= 2 && !own.some((self) => self.includes(term) || term.includes(self))));
  if (!terms.length) return [];
  return source.evidence.filter((item) => item.kind !== "naver_series" && terms.some((term) => normalizeText(`${item.title} ${item.excerpt}`).includes(term))).map((item) => `${source.trendId}:${item.id}`);
}
function jaccard(shared: number, sourceCount: number, targetCount: number) {
  const union = sourceCount + targetCount - shared;
  return union ? shared / union : 0;
}

export function analyzeCulturalRelationship(sourceInput: RelationshipTrendInput, targetInput: RelationshipTrendInput, options: { analyzedAt?: string; creativeHypothesis?: string } = {}): CulturalRelationshipResult {
  if (sourceInput.trendId === targetInput.trendId) throw new Error("Cultural relationship analysis requires two different trends.");
  const source = { ...sourceInput, metadata: standardizedCultureMetadataSchema.parse(sourceInput.metadata), evidence: z.array(evidenceItemSchema).parse(sourceInput.evidence) };
  const target = { ...targetInput, metadata: standardizedCultureMetadataSchema.parse(targetInput.metadata), evidence: z.array(evidenceItemSchema).parse(targetInput.evidence) };
  const analyzedAt = options.analyzedAt ?? new Date().toISOString();
  const sourceAttributes = groundedAttributes(source.metadata), targetAttributes = groundedAttributes(target.metadata);
  const targetById = new Map(targetAttributes.map((attribute) => [attribute.attributeId, attribute]));
  const sharedSource = sourceAttributes.filter((attribute) => targetById.has(attribute.attributeId));
  const sharedIds = new Set(sharedSource.map((attribute) => attribute.attributeId));
  const sharedAttributes = sharedSource.map(compactAttribute);
  const differentialAttributes = {
    source: sourceAttributes.filter((attribute) => !sharedIds.has(attribute.attributeId)).map(compactAttribute),
    target: targetAttributes.filter((attribute) => !sharedIds.has(attribute.attributeId)).map(compactAttribute),
  };
  const attributeScore = round(jaccard(sharedAttributes.length, sourceAttributes.length, targetAttributes.length));
  const semanticRaw = source.embedding?.length && target.embedding?.length ? cosineSimilarity(source.embedding, target.embedding) : null;
  const semanticScore = semanticRaw === null ? null : round(Math.max(0, semanticRaw));
  const observedIds = unique([...observedMentions(source, target), ...observedMentions(target, source)]);
  const observedScore = round(Math.min(1, observedIds.length / 2));
  const signals: CulturalRelationshipResult["signals"] = [];

  if (sharedAttributes.length > 0) {
    const targetShared = targetAttributes.filter((attribute) => sharedIds.has(attribute.attributeId));
    signals.push({
      type: "shared_attribute", score: attributeScore,
      reason: `두 DNA에서 근거가 연결된 표준 속성 ${sharedAttributes.map((item) => `${item.dimension}:${item.canonicalLabel}`).join(", ")}이(가) 공통으로 확인됐습니다. 속성 공유는 두 문화가 함께 확산됐다는 뜻은 아닙니다.`,
      evidenceIds: unique([...qualifiedEvidenceIds(source, sharedSource), ...qualifiedEvidenceIds(target, targetShared)]),
      verificationStatus: "Supported Hypothesis",
    });
  }
  if (semanticScore !== null && semanticScore >= SEMANTIC_RELATION_THRESHOLD) signals.push({
    type: "semantic_similarity", score: semanticScore,
    reason: `DNA 요약 임베딩의 코사인 유사도는 ${semanticScore.toFixed(3)}이며 기준 ${SEMANTIC_RELATION_THRESHOLD} 이상입니다. 이는 텍스트 의미의 근접성이지 실제 상호작용이나 확산의 증거가 아닙니다.`,
    evidenceIds: [], verificationStatus: "Creative Hypothesis",
  });
  if (observedIds.length > 0) signals.push({
    type: "observed_connection", score: observedScore,
    reason: `수집된 공개 자료 ${observedIds.length}건에서 상대 트렌드 이름 또는 키워드가 관찰됐습니다. 수집 표본 내 동시 언급이며 전체 이용자나 전체 플랫폼의 관계를 대표하지 않습니다.`,
    evidenceIds: observedIds, verificationStatus: "Verified Signal",
  });
  const hasCreativeAnchor = sharedAttributes.length > 0 || observedIds.length > 0 || (semanticScore !== null && semanticScore >= CREATIVE_ANCHOR_THRESHOLD);
  if (options.creativeHypothesis?.trim() && hasCreativeAnchor) signals.push({ type: "creative_hypothesis", score: null, reason: options.creativeHypothesis.trim(), evidenceIds: [], verificationStatus: "Creative Hypothesis" });

  const score = round(attributeScore * RELATION_SCORE_WEIGHTS.attribute + (semanticScore ?? 0) * RELATION_SCORE_WEIGHTS.semantic + observedScore * RELATION_SCORE_WEIGHTS.observed);
  const priority = ["observed_connection", "shared_attribute", "semantic_similarity", "creative_hypothesis"] as const;
  const primary = priority.map((type) => signals.find((signal) => signal.type === type)).find(Boolean) ?? null;
  const reason = primary?.reason ?? `근거가 연결된 공통 Attribute ID와 공개 자료의 교차 언급이 없고, 임베딩 유사도도 ${semanticScore === null ? "계산할 수 없거나" : semanticScore.toFixed(3)} 기준 ${SEMANTIC_RELATION_THRESHOLD} 미만입니다.`;
  return culturalRelationshipResultSchema.parse({
    exists: signals.length > 0, sourceTrendId: source.trendId, targetTrendId: target.trendId, primaryType: primary?.type ?? null,
    signals, sharedAttributes, differentialAttributes, score,
    scoreBreakdown: { attribute: attributeScore, semantic: semanticScore, observed: observedScore }, reason,
    evidenceIds: unique(signals.flatMap((signal) => signal.evidenceIds)), verificationStatus: primary?.verificationStatus ?? "Insufficient Evidence",
    limitations: ["관계 점수는 속성·텍스트·표본 자료의 알고리즘 기반 근접도이며 트렌드 확산 확률이 아닙니다.", "임베딩 좌표와 그래프 배치는 문화 간 인과관계를 의미하지 않습니다.", "교차 언급은 수집된 자료 범위에서만 관찰된 신호입니다."],
    analyzedAt,
  });
}
