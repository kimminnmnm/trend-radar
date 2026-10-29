import { analyzeCulturalRelationship, cosineSimilarity, SEMANTIC_RELATION_THRESHOLD, type CulturalRelationshipResult, type RelationshipTrendInput } from "./cultural-relationship-engine";
import type { StandardizedCultureMetadata } from "./culture-metadata";
import { pairKey, snapshotMetadata } from "./culture-pipeline";
import { calibrateSemanticThreshold, displayableSignals, type SemanticCalibration } from "./culture-calibration";
import type { ConnectionType } from "./schemas";
import type { AnalysisStatus } from "./schemas";
import type { CultureRelationRecord, LiveAnalysisSnapshot, SavedCollision } from "./types";

export type GraphEdgeType = "Semantic Similarity" | ConnectionType;
export type RelationTypeKey = "shared_attribute" | "semantic_similarity" | "observed_connection" | "creative_hypothesis";
export type CompactAttribute = { attributeId: string; canonicalLabel: string; dimension: string };
export type CultureEdge = { id: string; source: string; target: string; type: GraphEdgeType; relationType: RelationTypeKey; label: string; basis: string; evidenceIds: string[]; score?: number; sharedAttributes?: CompactAttribute[]; verificationStatus?: AnalysisStatus; origin: "engine" | "collision" | "demo" };

/** 트렌드 한 쌍의 관계. 화면의 선 하나에 대응하며 개별 신호(edges)를 모두 보존한다. */
export type CultureRelation = {
  id: string;
  source: string;
  target: string;
  edges: CultureEdge[];
  primary: CultureEdge;
  /** 관계 엔진 점수(0~1). 엔진 신호 없이 Collision 가설만 있으면 null. */
  score: number | null;
  scoreBreakdown: CulturalRelationshipResult["scoreBreakdown"] | null;
  sharedAttributes: CompactAttribute[];
  differentialAttributes: CulturalRelationshipResult["differentialAttributes"] | null;
  analyzedAt?: string;
  hasEvidence: boolean;
  aiHypothesisOnly: boolean;
  /** 관계 원장에 저장된 계산 결과를 재사용한 경우의 기록. */
  stored?: { computedAt: string; sourceVersion: number; targetVersion: number; cloudSavedAt?: string };
};

export type CultureGraph = {
  relations: CultureRelation[];
  metadata: Map<string, StandardizedCultureMetadata>;
  /** DNA가 있지만 표준 메타데이터 변환에 실패한 트렌드. 관계 계산에서 빠지며 화면에 ERROR로 표시한다. */
  errors: Set<string>;
  /** 이번 그래프에 쓴 의미 유사 표시 기준(코퍼스 보정). */
  semantic: SemanticCalibration;
};

/** 임베딩 유사도 엣지 기준. 의미적 근접성일 뿐 동반 확산을 뜻하지 않는다. */
export const SEMANTIC_THRESHOLD = SEMANTIC_RELATION_THRESHOLD;
export function cosine(a: number[], b: number[]) { return cosineSimilarity(a, b) ?? 0; }

export function pairSimilarities(snapshots: LiveAnalysisSnapshot[]) {
  const result: Array<{ a: string; b: string; cosine: number }> = [];
  for (let i = 0; i < snapshots.length; i += 1) for (let j = i + 1; j < snapshots.length; j += 1) {
    const a = snapshots[i], b = snapshots[j];
    if (a.embedding?.length && b.embedding?.length) result.push({ a: a.trendId, b: b.trendId, cosine: Math.round(cosine(a.embedding, b.embedding) * 1000) / 1000 });
  }
  return result;
}

function relationshipInput(snapshot: LiveAnalysisSnapshot): RelationshipTrendInput | "error" | null {
  if (!snapshot.dna || !snapshot.evidence) return null;
  try {
    const metadata = snapshotMetadata(snapshot);
    if (!metadata) return "error";
    return { trendId: snapshot.trendId, trendName: snapshot.trendName, keywords: snapshot.keywords, metadata, evidence: snapshot.evidence, embedding: snapshot.embedding };
  } catch { return "error"; }
}

const graphType = {
  shared_attribute: "Shared Cultural Attribute",
  semantic_similarity: "Semantic Similarity",
  observed_connection: "Observed Connection",
  creative_hypothesis: "Hypothesized Connection",
} as const satisfies Record<RelationTypeKey, GraphEdgeType>;

/** 화면 표기. 색만으로 구분하지 않도록 범례·패널에서 이 문구를 함께 쓴다. */
export const relationTypeLabels: Record<GraphEdgeType, { ko: string; key: RelationTypeKey; line: string }> = {
  "Observed Connection": { ko: "관찰된 연결", key: "observed_connection", line: "굵은 실선" },
  "Shared Cultural Attribute": { ko: "공통 속성", key: "shared_attribute", line: "실선" },
  "Semantic Similarity": { ko: "의미 유사", key: "semantic_similarity", line: "점선" },
  "Hypothesized Connection": { ko: "AI 가설", key: "creative_hypothesis", line: "흐린 점선" },
};

/** 같은 쌍에 신호가 여럿이면 가장 강한 근거 유형을 대표로 쓴다. */
export const edgeTypeStrength: GraphEdgeType[] = ["Observed Connection", "Shared Cultural Attribute", "Semantic Similarity", "Hypothesized Connection"];


function makeRelation(id: string, source: string, target: string, edges: CultureEdge[], result: CulturalRelationshipResult | null): CultureRelation {
  const primary = [...edges].sort((x, y) => edgeTypeStrength.indexOf(x.type) - edgeTypeStrength.indexOf(y.type))[0];
  return {
    id, source, target, edges, primary,
    score: result ? result.score : null,
    scoreBreakdown: result?.scoreBreakdown ?? null,
    sharedAttributes: result?.sharedAttributes ?? [],
    differentialAttributes: result?.differentialAttributes ?? null,
    analyzedAt: result?.analyzedAt,
    hasEvidence: edges.some((edge) => edge.evidenceIds.length > 0),
    aiHypothesisOnly: edges.every((edge) => edge.type === "Hypothesized Connection"),
  };
}

/**
 * @param stored 관계 원장(현재 버전끼리)의 결과. 있으면 다시 계산하지 않고 재사용한다(키: 정렬된 "trendA|trendB").
 */
export function buildCultureGraph(snapshots: LiveAnalysisSnapshot[], collisions: SavedCollision[], stored?: Map<string, CultureRelationRecord>): CultureGraph {
  const inputs = new Map<string, RelationshipTrendInput>();
  const errors = new Set<string>();
  for (const snapshot of snapshots) {
    const input = relationshipInput(snapshot);
    if (input === "error") errors.add(snapshot.trendId);
    else if (input) inputs.set(snapshot.trendId, input);
  }
  const relations = new Map<string, CultureRelation>();
  const list = [...inputs.values()];
  const semantic = calibrateSemanticThreshold(list.map((item) => item.embedding));
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
    const record = stored?.get(pairKey(list[i].trendId, list[j].trendId));
    const [a, b] = record && record.sourceTrendId !== list[i].trendId ? [list[j], list[i]] : [list[i], list[j]];
    const analyzedAt = [a.metadata.sourceAnalyzedAt, b.metadata.sourceAnalyzedAt].sort().at(-1);
    const result = record?.result ?? analyzeCulturalRelationship(a, b, { analyzedAt });
    // 설명 가능한 신호가 없으면 선을 만들지 않는다. 보정 기준 미만의 의미 유사만 있는 쌍도 마찬가지다.
    const signals = displayableSignals(result, semantic.threshold);
    if (!result.exists || !signals.length) continue;
    const pair = `${a.trendId}|${b.trendId}`;
    const edges = signals.map((signal): CultureEdge => {
      const sharedLabel = result.sharedAttributes.slice(0, 2).map((item) => item.canonicalLabel).join(" · ");
      const label = signal.type === "shared_attribute" ? sharedLabel
        : signal.type === "semantic_similarity" ? `cos ${(signal.score ?? 0).toFixed(2)}`
          : signal.type === "observed_connection" ? "자료 내 교차 언급" : "가설적 접점";
      return { id: `${signal.type}:${pair}`, source: a.trendId, target: b.trendId, type: graphType[signal.type], relationType: signal.type, label, basis: signal.reason, evidenceIds: signal.evidenceIds, score: signal.score ?? undefined, sharedAttributes: signal.type === "shared_attribute" ? result.sharedAttributes : undefined, verificationStatus: signal.verificationStatus, origin: "engine" };
    });
    const relation = makeRelation(`rel:${pair}`, a.trendId, b.trendId, edges, result);
    if (record) relation.stored = { computedAt: record.computedAt, sourceVersion: record.sourceVersion, targetVersion: record.targetVersion, cloudSavedAt: record.cloudSavedAt };
    relations.set(pairKey(a.trendId, b.trendId), relation);
  }
  const ids = new Set(snapshots.map((item) => item.trendId));
  for (const collision of collisions) {
    const keys = collision.trendKeys.filter((key) => ids.has(key));
    for (let i = 0; i < keys.length; i += 1) for (let j = i + 1; j < keys.length; j += 1) {
      const edge: CultureEdge = {
        id: `hyp:${collision.id}:${keys[i]}|${keys[j]}`, source: keys[i], target: keys[j], type: "Hypothesized Connection", relationType: "creative_hypothesis", label: collision.result.title.slice(0, 18),
        basis: `Culture Collision 분석(${new Date(collision.analyzedAt).toLocaleDateString("ko-KR")})에서 AI가 제안한 연결 가능성입니다: “${collision.result.title}”. 검증되지 않은 가설입니다.`, evidenceIds: [], verificationStatus: "Creative Hypothesis", origin: "collision",
      };
      const key = pairKey(keys[i], keys[j]);
      const existing = relations.get(key);
      if (existing) relations.set(key, { ...makeRelation(existing.id, existing.source, existing.target, [...existing.edges, edge], null), score: existing.score, scoreBreakdown: existing.scoreBreakdown, sharedAttributes: existing.sharedAttributes, differentialAttributes: existing.differentialAttributes, analyzedAt: existing.analyzedAt, stored: existing.stored });
      else relations.set(key, makeRelation(`rel:${keys[i]}|${keys[j]}`, keys[i], keys[j], [edge], null));
    }
  }
  return { relations: [...relations.values()], metadata: new Map([...inputs].map(([id, input]) => [id, input.metadata])), errors, semantic };
}

/** 신호 단위 목록. Overview 카운트 등 기존 사용처와의 호환을 위해 유지한다. */
export function buildCultureEdges(snapshots: LiveAnalysisSnapshot[], collisions: SavedCollision[]): CultureEdge[] {
  return buildCultureGraph(snapshots, collisions).relations.flatMap((relation) => relation.edges);
}

export const edgeStyles: Record<GraphEdgeType, { stroke: string; dash?: string; animated?: boolean; width: number; opacity: number }> = {
  "Observed Connection": { stroke: "#1f8a46", width: 3.4, opacity: 1, animated: true },
  "Shared Cultural Attribute": { stroke: "#1f50c8", width: 2.2, opacity: 1 },
  "Semantic Similarity": { stroke: "#2b6be0", dash: "6 4", width: 1.8, opacity: .9 },
  "Hypothesized Connection": { stroke: "#c27c0e", dash: "2 5", width: 1.5, opacity: .55 },
};
