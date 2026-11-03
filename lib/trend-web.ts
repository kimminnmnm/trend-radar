import type { DiscoveryReport, DiscoverySignal } from "./discovery";
import type { EvidenceItem } from "./schemas";

/** TREND WEB는 인기도 순위가 아니라 저장된 근거 안의 연결 구조를 보여 준다. */
export const TREND_WEB_VERSION = "trend-web-v1";
export const TREND_WEB_NODE_LIMIT = 36;
export const trendWebCategories = ["MAIN", "PHENOMENON", "ENTITY", "BEHAVIOR", "KEYWORD"] as const;
export type TrendWebCategory = (typeof trendWebCategories)[number];
export const trendWebStatuses = ["OBSERVED", "EMERGING", "SUGGESTED"] as const;
export type TrendWebStatus = (typeof trendWebStatuses)[number];
export const trendWebRelationTypes = ["CO_OCCURRENCE", "SHARED_PHENOMENON", "ENTITY_ASSOCIATION", "SEMANTIC_ASSOCIATION", "BEHAVIORAL_CONNECTION"] as const;
export type TrendWebRelationType = (typeof trendWebRelationTypes)[number];

export type TrendWebNode = {
  id: string;
  keyword: string;
  aliases: string[];
  category: TrendWebCategory;
  entityType?: "brand" | "character" | "product" | "unknown";
  sourceCount: number;
  independentSourceCount: number;
  firstObserved?: string;
  lastObserved?: string;
  relatedPhenomena: string[];
  evidenceIds: string[];
  platforms: string[];
  momentumStatus: "rising" | "steady" | "falling" | "not-measured";
  evidenceStatus: TrendWebStatus;
  /** 0~100 근거 신뢰 점수. 인기·검색량·시장 규모가 아니다. */
  evidenceScore: number;
  sourceSignalId?: string;
};

export type TrendWebEdge = {
  id: string;
  source: string;
  target: string;
  type: TrendWebRelationType;
  evidenceIds: string[];
  independentSourceCount: number;
  status: TrendWebStatus;
  /** 0.25~1, 선 굵기 전용. */
  strength: number;
  explanation: string;
};

export type TrendWebGraph = {
  version: typeof TREND_WEB_VERSION;
  reportId: string;
  mainKeyword: string;
  window: DiscoveryReport["window"];
  generatedAt: string;
  nodes: TrendWebNode[];
  edges: TrendWebEdge[];
  evidence: EvidenceItem[];
  methodology: string;
};

export type TrendWebSession = {
  id: string;
  graph: TrendWebGraph;
  selectedNodeIds: string[];
  selectedConnectionId?: string;
  selectedPhenomenonId?: string;
  updatedAt: string;
  ownerId?: string;
};

export type SavedTrendWebPayload = { kind: "trend-web"; session: TrendWebSession };
export const isTrendWebPayload = (payload: unknown): payload is SavedTrendWebPayload => {
  const value = payload as Partial<SavedTrendWebPayload> | null | undefined;
  return Boolean(value?.kind === "trend-web" && value.session?.graph?.version === TREND_WEB_VERSION && Array.isArray(value.session.graph.nodes) && value.session.graph.nodes.length <= TREND_WEB_NODE_LIMIT && Array.isArray(value.session.graph.edges) && Array.isArray(value.session.selectedNodeIds) && value.session.selectedNodeIds.length <= 2 && value.session.selectedNodeIds.every((id) => typeof id === "string"));
};

const normalize = (value: string) => value.normalize("NFKC").trim().replace(/^#+/, "").replace(/[\s·_\-–—]+/g, "").toLocaleLowerCase("ko-KR");
const hash = (value: string) => { let h = 0x811c9dc5; for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
const platform = (item: EvidenceItem) => item.kind === "youtube_video" ? "YouTube" : item.kind === "instagram_media" ? "Instagram" : item.kind === "naver_series" ? "NAVER" : "Web";
const sourceKey = (item: EvidenceItem) => `${platform(item)}|${item.source.trim().toLocaleLowerCase("ko-KR")}`;
const dateOf = (item: EvidenceItem) => item.date?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
const literalMention = (item: EvidenceItem, term: string) => normalize(`${item.title} ${item.excerpt}`).includes(normalize(term));
const unique = <T,>(items: T[]) => [...new Set(items)];
const statusOf = (sources: number): TrendWebStatus => sources >= 2 ? "OBSERVED" : sources === 1 ? "EMERGING" : "SUGGESTED";
const evidenceScore = (sources: number, count: number, last?: string, now = Date.now()) => {
  const evidence = Math.min(sources, 3) / 3 * 45;
  const frequency = Math.min(count, 5) / 5 * 25;
  const age = last ? Math.max(0, (now - Date.parse(last)) / 86_400_000) : 90;
  const recency = Math.max(0, 1 - age / 90) * 30;
  return Math.round(evidence + frequency + recency);
};
const entityType = (value: string): TrendWebNode["entityType"] => /캐릭터|character|산리오|치이카와|쿠로미/i.test(value) ? "character" : /브랜드|brand|cosmetics|beauty/i.test(value) ? "brand" : /제품|립스틱|마스카라|아이템|컬렉션/i.test(value) ? "product" : "unknown";

type NodeDraft = { keyword: string; aliases: Set<string>; category: TrendWebCategory; entityType?: TrendWebNode["entityType"]; evidence: Set<string>; phenomena: Set<string>; platforms: Set<string>; signalIds: Set<string>; momentum: TrendWebNode["momentumStatus"] };

/**
 * 저장된 DiscoveryReport만 사용해 결정적으로 그래프를 만든다. 추가 API/AI 호출은 없다.
 * relatedEntities/relatedKeywords가 실제 인용 문서에 문자 그대로 없으면 SUGGESTED로 낮춘다.
 */
export function buildTrendWebGraph(report: DiscoveryReport, now = Date.now()): TrendWebGraph {
  const ledger = new Map(report.ledger.map((item) => [item.id, item]));
  const drafts = new Map<string, NodeDraft>();
  const upsert = (keyword: string, category: TrendWebCategory, signal: DiscoverySignal | null, evidenceIds: string[], kind?: TrendWebNode["entityType"]) => {
    const key = normalize(keyword);
    if (key.length < 2) return "";
    const current = drafts.get(key) ?? { keyword: keyword.trim(), aliases: new Set<string>(), category, evidence: new Set<string>(), phenomena: new Set<string>(), platforms: new Set<string>(), signalIds: new Set<string>(), momentum: "not-measured" as const };
    current.aliases.add(keyword.trim());
    if (category === "MAIN" || (current.category !== "MAIN" && category === "PHENOMENON")) current.category = category;
    if (kind) current.entityType = kind;
    for (const id of evidenceIds) { const item = ledger.get(id); if (item) { current.evidence.add(id); current.platforms.add(platform(item)); } }
    if (signal) { current.phenomena.add(signal.title); current.signalIds.add(signal.signalId); current.momentum = signal.momentumIndicator?.direction ?? current.momentum; }
    drafts.set(key, current);
    return key;
  };

  const mainEvidence = report.ledger.filter((item) => item.kind !== "naver_series").map((item) => item.id);
  const mainKey = upsert(report.keyword, "MAIN", null, mainEvidence);
  const edgeDrafts: Array<{ source: string; target: string; type: TrendWebRelationType; ids: string[]; explanation: string }> = [];
  for (const signal of report.signals) {
    const signalIds = signal.evidenceIds.filter((id) => ledger.has(id));
    const signalKey = upsert(signal.title, "PHENOMENON", signal, signalIds);
    if (!signalKey) continue;
    edgeDrafts.push({ source: mainKey, target: signalKey, type: "SHARED_PHENOMENON", ids: signalIds, explanation: `“${report.keyword}” 아래에서 관측된 세부 현상` });
    if (signal.audienceBehavior.trim()) {
      const behavior = signal.audienceBehavior.trim().slice(0, 52);
      const key = upsert(behavior, "BEHAVIOR", signal, signalIds);
      if (key) edgeDrafts.push({ source: signalKey, target: key, type: "BEHAVIORAL_CONNECTION", ids: signalIds, explanation: `자료에서 추출된 참여 행동: ${behavior}` });
    }
    for (const entity of signal.relatedEntities) {
      const actual = signalIds.filter((id) => { const item = ledger.get(id); return item ? literalMention(item, entity) : false; });
      const key = upsert(entity, "ENTITY", signal, actual, entityType(entity));
      if (key) edgeDrafts.push({ source: signalKey, target: key, type: actual.length ? "ENTITY_ASSOCIATION" : "SEMANTIC_ASSOCIATION", ids: actual, explanation: actual.length ? "같은 근거 자료에서 확인된 엔티티" : "추출 결과에 포함됐지만 원문 문자 일치를 확인하지 못한 탐색 후보" });
    }
    for (const keyword of signal.relatedKeywords) {
      const actual = signalIds.filter((id) => { const item = ledger.get(id); return item ? literalMention(item, keyword) : false; });
      const key = upsert(keyword, "KEYWORD", signal, actual);
      if (key) edgeDrafts.push({ source: signalKey, target: key, type: actual.length ? "CO_OCCURRENCE" : "SEMANTIC_ASSOCIATION", ids: actual, explanation: actual.length ? "같은 근거 자료에 함께 등장" : "검색 확장용 제안어이며 관측 신호가 아님" });
    }
  }

  const keyToId = new Map([...drafts.keys()].map((key) => [key, key === mainKey ? "tw-main" : `tw-${hash(key)}`]));
  const nodes = [...drafts.entries()].map(([key, draft]): TrendWebNode => {
    const items = [...draft.evidence].map((id) => ledger.get(id)).filter((item): item is EvidenceItem => Boolean(item));
    const dates = items.map(dateOf).filter((date): date is string => Boolean(date)).sort();
    const independent = new Set(items.map(sourceKey)).size;
    const status = draft.category === "MAIN" ? (independent ? "OBSERVED" : "SUGGESTED") : statusOf(independent);
    return {
      id: keyToId.get(key)!, keyword: draft.keyword, aliases: [...draft.aliases], category: draft.category, ...(draft.entityType ? { entityType: draft.entityType } : {}),
      sourceCount: items.length, independentSourceCount: independent, ...(dates[0] ? { firstObserved: dates[0], lastObserved: dates.at(-1)! } : {}),
      relatedPhenomena: [...draft.phenomena], evidenceIds: [...draft.evidence], platforms: [...draft.platforms], momentumStatus: draft.momentum,
      evidenceStatus: status, evidenceScore: status === "SUGGESTED" ? 0 : evidenceScore(independent, items.length, dates.at(-1), now), sourceSignalId: [...draft.signalIds][0],
    };
  }).sort((a, b) => Number(b.category === "MAIN") - Number(a.category === "MAIN") || b.evidenceScore - a.evidenceScore || a.keyword.localeCompare(b.keyword, "ko"));

  const edges = edgeDrafts.flatMap((edge, index): TrendWebEdge[] => {
    const source = keyToId.get(edge.source), target = keyToId.get(edge.target);
    if (!source || !target || source === target) return [];
    const items = edge.ids.map((id) => ledger.get(id)).filter((item): item is EvidenceItem => Boolean(item));
    const independent = new Set(items.map(sourceKey)).size;
    const status = statusOf(independent);
    return [{ id: `twe-${index + 1}-${source}-${target}`, source, target, type: edge.type, evidenceIds: unique(edge.ids), independentSourceCount: independent, status, strength: Math.max(.25, Math.min(1, .25 + independent * .25 + Math.min(items.length, 4) * .08)), explanation: edge.explanation }];
  }).filter((edge, index, all) => all.findIndex((item) => item.source === edge.source && item.target === edge.target && item.type === edge.type) === index);

  const keptNodes = nodes.slice(0, TREND_WEB_NODE_LIMIT);
  const kept = new Set(keptNodes.map((node) => node.id));
  return {
    version: TREND_WEB_VERSION, reportId: report.id, mainKeyword: report.keyword, window: report.window, generatedAt: report.generatedAt,
    nodes: keptNodes, edges: edges.filter((edge) => kept.has(edge.source) && kept.has(edge.target)), evidence: report.ledger,
    methodology: "근거 신뢰 점수 = 독립 출처(최대 45) + 근거 건수(최대 25) + 90일 최근성(최대 30). 인기도·검색량·시장 순위가 아니며, 원문 문자 일치가 없는 추출어는 SUGGESTED로 분리합니다.",
  };
}

export const trendWebSessionId = (reportId: string) => `trend-web-${reportId}`;
export const trendWebSavedItemId = (sessionId: string) => `tw-session-${sessionId}`;
