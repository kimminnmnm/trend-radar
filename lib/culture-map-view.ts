import type { CultureRelation } from "./culture-graph";
import type { EvidenceItem } from "./schemas";
import type { CultureRelationFeedback, DataStatus, LiveAnalysisSnapshot, Trend } from "./types";

/** 프로젝트 카테고리 스키마(Trend.category)에서 "Live"를 뺀 분류. LIVE 분석은 분류가 없으면 미분류다. */
export const CULTURE_CATEGORIES = ["Subculture", "Lifestyle", "Fashion", "Entertainment", "Technology"] as const satisfies ReadonlyArray<Trend["category"]>;
export const UNCATEGORIZED = "미분류";

export type MapNodeInfo = {
  id: string;
  name: string;
  en?: string;
  category: string;
  categoryUserSet: boolean;
  status: DataStatus;
  hasDna: boolean;
  /** Collision API 입력 조건: LIVE DNA와 근거 원장이 있어야 한다. */
  canCollide: boolean;
  searchText: string;
};

/** 한글·영문 공통 정규화. 대소문자, 전각/반각, 공백 차이를 무시한다. */
export function normalizeSearch(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s#·_\-]/g, "");
}

export function liveCategory(snapshot: LiveAnalysisSnapshot) {
  return snapshot.category && snapshot.category !== "Live" ? snapshot.category : UNCATEGORIZED;
}

export function liveNodeInfo(snapshot: LiveAnalysisSnapshot, errors: Set<string>): MapNodeInfo {
  const attributeLabels = snapshot.dna?.dimensions.flatMap((dimension) => dimension.attributes.map((attribute) => attribute.label)) ?? [];
  return {
    id: snapshot.trendId,
    name: snapshot.trendName,
    category: liveCategory(snapshot),
    categoryUserSet: snapshot.categorySource === "user",
    status: errors.has(snapshot.trendId) ? "ERROR" : snapshot.dna ? "SAVED" : "NOT ANALYZED",
    hasDna: Boolean(snapshot.dna),
    canCollide: Boolean(snapshot.dna && snapshot.evidence?.length) && !errors.has(snapshot.trendId),
    searchText: normalizeSearch([snapshot.trendName, ...snapshot.keywords, ...attributeLabels].join(" ")),
  };
}

export function demoNodeInfo(trend: Trend): MapNodeInfo {
  return { id: trend.id, name: trend.name, en: trend.en, category: trend.category, categoryUserSet: false, status: "DEMO", hasDna: true, canCollide: false, searchText: normalizeSearch([trend.name, trend.en, ...trend.tags].join(" ")) };
}

/** 이름이 검색어로 시작하는 노드를 먼저, 그다음 이름 포함, 키워드·속성 포함 순으로 정렬한다. */
export function searchMapNodes(nodes: MapNodeInfo[], query: string) {
  const q = normalizeSearch(query);
  if (!q) return [];
  const rank = (node: MapNodeInfo) => {
    const name = normalizeSearch(`${node.name} ${node.en ?? ""}`);
    return normalizeSearch(node.name).startsWith(q) ? 0 : name.includes(q) ? 1 : node.searchText.includes(q) ? 2 : -1;
  };
  return nodes.map((node) => ({ node, rank: rank(node) })).filter((item) => item.rank >= 0).sort((a, b) => a.rank - b.rank || a.node.name.localeCompare(b.node.name, "ko")).map((item) => item.node);
}

/**
 * 화면에 그릴 관계만 고른다. 저장된 관계 데이터는 바꾸지 않는다.
 * 숨겨진 노드에 닿는 관계는 숨기고, 점수 기준이 0보다 크면 점수가 없는 가설 관계도 숨긴다.
 */
export function visibleRelations(relations: CultureRelation[], visibleIds: Set<string>, minScore: number) {
  return relations.filter((relation) => visibleIds.has(relation.source) && visibleIds.has(relation.target) && (minScore <= 0 || (relation.score ?? -1) >= minScore));
}

export type ResolvedEvidence = { qualifiedId: string; trendId: string | null; trendName: string | null; item: EvidenceItem | null };

/** 관계 근거 ID(`trendId:EVIDENCE-ID`)를 저장된 근거 원장 항목으로 되돌린다. 찾지 못하면 item이 null이다. */
export function resolveRelationEvidence(relation: CultureRelation, snapshots: LiveAnalysisSnapshot[]): ResolvedEvidence[] {
  const ids = [...new Set(relation.edges.flatMap((edge) => edge.evidenceIds))];
  return ids.map((qualifiedId) => {
    const owner = snapshots.filter((item) => qualifiedId.startsWith(`${item.trendId}:`)).sort((a, b) => b.trendId.length - a.trendId.length)[0];
    if (!owner) return { qualifiedId, trendId: null, trendName: null, item: null };
    const localId = qualifiedId.slice(owner.trendId.length + 1);
    return { qualifiedId, trendId: owner.trendId, trendName: owner.trendName, item: owner.evidence?.find((evidence) => evidence.id === localId) ?? null };
  });
}

/** Culture Collision으로 넘기는 링크. 이름이 아니라 trendId를 전달한다. */
export function collisionHref(trendIds: string[]) {
  const params = new URLSearchParams();
  for (const id of trendIds) params.append("trend", id);
  return `/collision?${params.toString()}`;
}

/** Collision 페이지에서 쿼리 값을 trendId 목록으로 정리한다. 중복을 없애고 최대 4개까지 받는다. */
export function parseCollisionTrendParam(value: string | string[] | undefined) {
  const list = (Array.isArray(value) ? value : value ? [value] : []).map((item) => item.trim()).filter(Boolean);
  return [...new Set(list)].slice(0, 4);
}

/** 관계 점수 0~1을 0~100 정수로 표시한다. 확률이 아니라 알고리즘 기반 유사성 지표다. */
export const scoreToPercent = (score: number) => Math.round(score * 100);

export const relationPair = (relation: Pick<CultureRelation, "source" | "target">) => relation.source < relation.target ? `${relation.source}|${relation.target}` : `${relation.target}|${relation.source}`;

/** 사용자가 부적절하다고 숨긴 관계를 뺀다. showHidden이면 숨긴 관계도 보여 준다. 데이터는 바꾸지 않는다. */
export function withoutHiddenRelations(relations: CultureRelation[], feedback: CultureRelationFeedback[], showHidden: boolean) {
  if (showHidden) return relations;
  const hidden = new Set(feedback.filter((item) => item.hidden).map((item) => item.pair));
  return relations.filter((relation) => !hidden.has(relationPair(relation)));
}
