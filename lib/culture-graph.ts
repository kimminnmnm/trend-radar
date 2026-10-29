import type { ConnectionType } from "./schemas";
import type { LiveAnalysisSnapshot, SavedCollision } from "./types";

export type GraphEdgeType = "Semantic Similarity" | ConnectionType;

export type CultureEdge = {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  label: string;
  /** 엣지를 만든 근거 설명. 모든 엣지는 생성 근거를 가져야 한다. */
  basis: string;
  evidenceIds: string[];
  score?: number;
};

/** 임베딩 유사도 엣지 기준. 의미적 근접성일 뿐 동반 확산을 뜻하지 않는다. */
export const SEMANTIC_THRESHOLD = 0.45;

const normalize = (value: string) => value.toLocaleLowerCase("ko-KR").replace(/[\s#·_\-]/g, "");

export function cosine(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function pairSimilarities(snapshots: LiveAnalysisSnapshot[]) {
  const result: Array<{ a: string; b: string; cosine: number }> = [];
  for (let i = 0; i < snapshots.length; i += 1) for (let j = i + 1; j < snapshots.length; j += 1) {
    const a = snapshots[i], b = snapshots[j];
    if (a.embedding?.length && b.embedding?.length) result.push({ a: a.trendId, b: b.trendId, cosine: Math.round(cosine(a.embedding, b.embedding) * 1000) / 1000 });
  }
  return result;
}

function sharedLabels(a: LiveAnalysisSnapshot, b: LiveAnalysisSnapshot) {
  const labels: string[] = [];
  for (const dimension of a.dna?.dimensions ?? []) {
    const other = b.dna?.dimensions.find((item) => item.dimension === dimension.dimension);
    if (!other) continue;
    const otherLabels = new Set(other.attributes.filter((attr) => attr.status !== "Insufficient Evidence").map((attr) => normalize(attr.label)));
    for (const attr of dimension.attributes) if (attr.status !== "Insufficient Evidence" && otherLabels.has(normalize(attr.label))) labels.push(`${dimension.dimension}: ${attr.label}`);
  }
  return labels;
}

/** a의 수집 근거 본문에 b의 키워드가 등장하는지 (실제 자료에서 관찰된 동시 등장) */
function observedMentions(a: LiveAnalysisSnapshot, b: LiveAnalysisSnapshot) {
  const keywords = [b.trendName, ...b.keywords].map(normalize).filter((keyword) => keyword.length >= 2);
  return (a.evidence ?? []).filter((item) => item.kind === "instagram_media" && keywords.some((keyword) => normalize(item.excerpt).includes(keyword))).map((item) => item.id);
}

export function buildCultureEdges(snapshots: LiveAnalysisSnapshot[], collisions: SavedCollision[]): CultureEdge[] {
  const edges: CultureEdge[] = [];
  const ids = new Set(snapshots.map((item) => item.trendId));
  for (let i = 0; i < snapshots.length; i += 1) for (let j = i + 1; j < snapshots.length; j += 1) {
    const a = snapshots[i], b = snapshots[j];
    const pair = `${a.trendId}|${b.trendId}`;
    const labels = sharedLabels(a, b);
    if (labels.length) edges.push({ id: `shared:${pair}`, source: a.trendId, target: b.trendId, type: "Shared Cultural Attribute", label: labels.slice(0, 2).map((label) => label.split(": ")[1]).join(" · "), basis: `두 LIVE DNA에 동일한 속성 라벨이 있습니다: ${labels.join(", ")}`, evidenceIds: [] });
    const mentionsAB = observedMentions(a, b), mentionsBA = observedMentions(b, a);
    if (mentionsAB.length || mentionsBA.length) edges.push({ id: `observed:${pair}`, source: a.trendId, target: b.trendId, type: "Observed Connection", label: "게시물 동시 언급", basis: `수집된 Instagram 캡션에서 상대 키워드가 등장했습니다 (${a.trendName}: ${mentionsAB.join(", ") || "없음"} / ${b.trendName}: ${mentionsBA.join(", ") || "없음"}). 표본 게시물 기준이며 전체 확산을 뜻하지 않습니다.`, evidenceIds: [...mentionsAB.map((id) => `${a.trendId}:${id}`), ...mentionsBA.map((id) => `${b.trendId}:${id}`)] });
    if (a.embedding?.length && b.embedding?.length) {
      const score = cosine(a.embedding, b.embedding);
      if (score >= SEMANTIC_THRESHOLD) edges.push({ id: `semantic:${pair}`, source: a.trendId, target: b.trendId, type: "Semantic Similarity", label: `cos ${score.toFixed(2)}`, basis: `DNA 요약 임베딩의 코사인 유사도 ${score.toFixed(3)} (기준 ${SEMANTIC_THRESHOLD}). 의미가 가깝다는 뜻이며 함께 확산된다는 근거가 아닙니다.`, evidenceIds: [], score });
    }
  }
  for (const collision of collisions) {
    const keys = collision.trendKeys.filter((key) => ids.has(key));
    for (let i = 0; i < keys.length; i += 1) for (let j = i + 1; j < keys.length; j += 1) {
      edges.push({ id: `hyp:${collision.id}:${keys[i]}|${keys[j]}`, source: keys[i], target: keys[j], type: "Hypothesized Connection", label: collision.result.title.slice(0, 18), basis: `Culture Collision 분석(${new Date(collision.analyzedAt).toLocaleDateString("ko-KR")})에서 AI가 제안한 연결 가능성입니다. 검증되지 않은 가설입니다.`, evidenceIds: [] });
    }
  }
  return edges;
}

export const edgeStyles: Record<GraphEdgeType, { stroke: string; dash?: string; animated?: boolean }> = {
  "Shared Cultural Attribute": { stroke: "#1f50c8" },
  "Observed Connection": { stroke: "#2a8f4a", animated: true },
  "Semantic Similarity": { stroke: "#2b6be0", dash: "5 4" },
  "Hypothesized Connection": { stroke: "#c27c0e", dash: "2 5" },
};
