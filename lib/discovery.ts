import { z } from "zod";
import { ideaSimilarity } from "./creative-collision";
import type { EvidenceItem } from "./schemas";

/*
 * TREND DISCOVERY & CULTURAL CONTEXT ENGINE (T1~T3). 웹·서버 공용 정의와 결정적 검증.
 * - 키워드를 "정적인 주제"가 아니라 "지금 일어나는 현상들의 상위어"로 다룬다: 관측 기간 안의 실제 자료에서 세부 현상 후보를 찾는다.
 * - 후보는 서버가 근거 ID·날짜·출처 수로 다시 판정한다(모델이 붙인 상태를 믿지 않음). 관측 기간 안 근거가 없으면 후보에서 뺀다.
 * - "급상승·바이럴·1위"는 데이터가 있을 때만: 모멘텀은 NAVER DataLab 상대 지수로만 계산하고, 없으면 null.
 * - 두 키워드의 연결은 현상(주체·행동·대상·방향)별로 따로 다루고, 실제 자료에서 두 개념이 함께 나오는지로 유형을 정한다.
 */
export const DISCOVERY_VERSION = "discovery-v1";
export const CONNECTION_VERSION = "connections-v1";
export const discoveryWindows = [7, 30, 90] as const;

export type DiscoveryWindow = { days: number; from: string; to: string };
export function windowOf(days: number, now = new Date()): DiscoveryWindow {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  return { days, from, to };
}

/** 날짜가 관측 기간 안인가. 연도만 있으면 판단할 수 없어 false(현재성의 근거로 쓰지 않는다). */
export function inWindow(date: string | undefined, window: Pick<DiscoveryWindow, "from" | "to">) {
  if (!date) return false;
  const value = date.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) { const day = value.slice(0, 10); return day >= window.from && day <= window.to; }
  if (/^\d{4}-\d{2}$/.test(value)) return value >= window.from.slice(0, 7) && value <= window.to.slice(0, 7);
  return false;
}
export const platformOf = (item: Pick<EvidenceItem, "kind" | "source">) => item.kind === "youtube_video" ? "YouTube" : item.kind === "instagram_media" ? "Instagram" : item.kind === "naver_series" ? "NAVER" : "웹";
/** 독립 출처: 플랫폼 + 채널·매체 이름. 같은 채널의 영상 여러 개는 하나로 센다. */
const sourceKey = (item: Pick<EvidenceItem, "kind" | "source">) => `${platformOf(item)}|${(item.source ?? "").replace(/^YouTube Data API · /, "").trim().toLowerCase()}`;

/* ---------- T1 세부 현상 ---------- */
export const signalStatuses = ["Observed", "Emerging Signal"] as const;
export type SignalStatus = (typeof signalStatuses)[number];
const clip = (max: number) => z.string().transform((value) => value.trim().slice(0, max));
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).transform((value) => value.slice(0, max));
export const rawSignalSchema = z.object({
  title: clip(80).pipe(z.string().min(1)),
  phenomenon: clip(400),
  audience_behavior: clip(300),
  related_entities: list(clip(80), 8),
  related_keywords: list(clip(40), 5),
  content_examples: list(z.object({ evidence_id: clip(40), note: clip(200) }), 6),
  evidence_ids: list(clip(40), 12),
  /** 키워드의 일반 정의·역사·기원 설명이면 true(현상이 아님 → 제외). */
  is_background: z.boolean(),
});
export const rawSignalsSchema = z.object({ signals: z.array(rawSignalSchema), limitations: list(clip(300), 6) });
export type RawSignal = z.infer<typeof rawSignalSchema>;

export type Momentum = { keyword: string; direction: "rising" | "steady" | "falling"; recentAvg: number; priorAvg: number; ratio: number; basis: string };
export type DiscoverySignal = {
  signalId: string; parentKeyword: string; title: string; phenomenon: string; audienceBehavior: string;
  relatedEntities: string[]; relatedKeywords: string[]; contentExamples: Array<{ evidenceId: string; note: string }>;
  observedPlatforms: string[]; evidenceIds: string[]; observedDateRange: { from: string; to: string } | null;
  evidenceStrength: "strong" | "moderate" | "weak"; momentumIndicator: Momentum | null; verificationStatus: SignalStatus;
  inWindowCount: number; independentSources: number;
};
export type DiscoveryExcluded = { title: string; reason: string };

function citedFacts(ids: string[], ledger: Map<string, EvidenceItem>, window: DiscoveryWindow) {
  const items = ids.map((id) => ledger.get(id)).filter((item): item is EvidenceItem => Boolean(item) && item!.kind !== "naver_series");
  const recent = items.filter((item) => inWindow(item.date, window));
  const dates = recent.map((item) => item.date!.slice(0, 10)).sort();
  return { items, recent, independent: new Set(recent.map(sourceKey)).size, platforms: [...new Set(items.map(platformOf))], range: dates.length ? { from: dates[0], to: dates.at(-1)! } : null };
}

/**
 * 서버 판정: 원장에 없는 근거 ID 제거 → 일반 설명·역사는 제외 → 관측 기간 안의 독립 출처 수로 상태·강도.
 *  Observed: 기간 안 독립 출처 2개 이상 · Emerging Signal: 1개 · 0개: 제외("관측 기간 안의 근거 없음").
 */
export function validateSignals(raw: RawSignal[], ledgerItems: EvidenceItem[], keyword: string, window: DiscoveryWindow) {
  const ledger = new Map(ledgerItems.map((item) => [item.id, item]));
  const excluded: DiscoveryExcluded[] = [];
  const removedIds: string[] = [];
  const signals: DiscoverySignal[] = [];
  for (const item of raw) {
    if (item.is_background) { excluded.push({ title: item.title, reason: "키워드의 일반 설명·역사(현재 현상이 아님)" }); continue; }
    const evidenceIds = [...new Set([...item.evidence_ids, ...item.content_examples.map((example) => example.evidence_id)])].filter((id) => { const ok = ledger.has(id); if (!ok) removedIds.push(id); return ok; });
    const facts = citedFacts(evidenceIds, ledger, window);
    if (!facts.recent.length) { excluded.push({ title: item.title, reason: facts.items.length ? "근거가 관측 기간 밖이거나 날짜를 확인할 수 없음" : "확인된 근거 없음" }); continue; }
    if (signals.some((prev) => ideaSimilarity(`${prev.title} ${prev.phenomenon}`, `${item.title} ${item.phenomenon}`) >= 0.5)) { excluded.push({ title: item.title, reason: "다른 후보와 같은 현상" }); continue; }
    const strength = facts.independent >= 3 && facts.platforms.length >= 2 ? "strong" : facts.independent >= 2 ? "moderate" : "weak";
    signals.push({
      signalId: `sig-${signals.length + 1}`, parentKeyword: keyword, title: item.title, phenomenon: item.phenomenon, audienceBehavior: item.audience_behavior,
      relatedEntities: item.related_entities, relatedKeywords: item.related_keywords,
      contentExamples: item.content_examples.filter((example) => ledger.has(example.evidence_id)).map((example) => ({ evidenceId: example.evidence_id, note: example.note })),
      observedPlatforms: facts.platforms, evidenceIds, observedDateRange: facts.range, evidenceStrength: strength, momentumIndicator: null,
      verificationStatus: facts.independent >= 2 ? "Observed" : "Emerging Signal", inWindowCount: facts.recent.length, independentSources: facts.independent,
    });
  }
  return { signals, excluded, removedIds: [...new Set(removedIds)] };
}

/** 모멘텀: NAVER 상대 지수 최근 4구간 평균 ÷ 그 이전 평균. 데이터가 없거나 0이면 null(만들어내지 않음). */
export function momentumFrom(keyword: string, points: Array<{ period: string; ratio: number }>): Momentum | null {
  if (points.length < 8) return null;
  const recent = points.slice(-4), prior = points.slice(0, -4);
  const avg = (list: typeof points) => list.reduce((sum, point) => sum + point.ratio, 0) / list.length;
  const recentAvg = avg(recent), priorAvg = avg(prior);
  if (recentAvg === 0 && priorAvg === 0) return null;
  const ratio = priorAvg === 0 ? Infinity : recentAvg / priorAvg;
  return { keyword, direction: ratio >= 1.3 ? "rising" : ratio <= 0.77 ? "falling" : "steady", recentAvg: Math.round(recentAvg * 10) / 10, priorAvg: Math.round(priorAvg * 10) / 10, ratio: Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : 99, basis: `NAVER DataLab 상대 검색 관심도(같은 요청 안의 0~100 지수) · 최근 4주 평균 ÷ 이전 평균 · 절대 검색량 아님` };
}

/* ---------- T2·T3 두 키워드의 연결 ---------- */
export const connectionTypes = ["OBSERVED CONNECTION", "EMERGING SIGNAL", "CREATIVE HYPOTHESIS"] as const;
export type ConnectionType = (typeof connectionTypes)[number];
export const connectionTypeLabels: Record<ConnectionType, string> = { "OBSERVED CONNECTION": "관측된 연결", "EMERGING SIGNAL": "떠오르는 신호", "CREATIVE HYPOTHESIS": "창의적 가설" };
export const expansionSchema = z.object({
  aliases_a: list(clip(40), 10), aliases_b: list(clip(40), 10),
  directions: list(z.object({ direction: clip(80), hypothesis: clip(200), queries: list(clip(80), 4) }), 6),
});
export const rawConnectionSchema = z.object({
  title: clip(80).pipe(z.string().min(1)),
  subject: clip(80), action: clip(60), object: clip(100), direction: clip(60), platform: clip(60), context: clip(100),
  explanation: clip(400), evidence_ids: list(clip(40), 10),
});
export const rawConnectionsSchema = z.object({ connections: z.array(rawConnectionSchema), limitations: list(clip(300), 6) });
export type RawConnection = z.infer<typeof rawConnectionSchema>;
/** 최신성은 유형과 따로 본다: 기간 안 근거가 있는가 / 날짜를 알 수 없는가 / 기간 밖뿐인가 / 근거 없음. */
export type Recency = "in-window" | "undated" | "out-of-window" | "none";
export const recencyLabels: Record<Recency, string> = { "in-window": "관측 기간 안", undated: "날짜 미상(최신성 확인 필요)", "out-of-window": "관측 기간 밖", none: "근거 없음" };
export type Connection = {
  connectionId: string; title: string; subject: string; action: string; object: string; direction: string; platform: string; context: string;
  explanation: string; evidenceIds: string[]; coOccurrence: number; independentSources: number; type: ConnectionType; observedDateRange: { from: string; to: string } | null;
  recency: Recency; inWindowCount: number;
  /** 검색 계획에는 있었지만 근거를 찾지 못한 방향(가설로만 표시). */
  notFound?: boolean;
};

/** 근거 한 건에 두 개념이 함께 나오는가(제목·발췌 기준, 대소문자 무시). */
export function mentionsBoth(item: Pick<EvidenceItem, "title" | "excerpt">, termsA: string[], termsB: string[]) {
  const text = `${item.title} ${item.excerpt}`.toLowerCase();
  const has = (terms: string[]) => terms.some((term) => term.trim().length >= 2 && text.includes(term.trim().toLowerCase()));
  return has(termsA) && has(termsB);
}

/**
 * 서버 판정(유형): 두 개념이 함께 나오는 근거의 독립 출처가 2개 이상 → 관측된 연결, 1개 → 떠오르는 신호, 0개 → 창의적 가설.
 * 최신성은 따로(recency) — 실측: 브랜드 사례 웹 출처가 모두 발행일 미상이라 "기간 안" 조건으로는 실제 사례가 가설로 떨어졌다.
 * 방향(예: Virtual → Real과 Real → Virtual)이 다르면 다른 현상으로 둔다 — 합치지 않는다.
 * plan: 검색 계획의 방향 중 결과에 없는 것은 "근거 미발견 가설"로 남긴다(기대한 현상이 없다는 것도 결과다).
 */
export function classifyConnections(raw: RawConnection[], ledgerItems: EvidenceItem[], termsA: string[], termsB: string[], window: DiscoveryWindow, plan: Array<{ direction: string; hypothesis: string }> = []) {
  const ledger = new Map(ledgerItems.map((item) => [item.id, item]));
  const removedIds: string[] = [];
  const connections: Connection[] = [];
  const norm = (value: string) => value.replace(/\s+/g, "").toLowerCase();
  for (const item of raw) {
    const evidenceIds = [...new Set(item.evidence_ids)].filter((id) => { const ok = ledger.has(id); if (!ok) removedIds.push(id); return ok; });
    const both = evidenceIds.map((id) => ledger.get(id)!).filter((evidence) => mentionsBoth(evidence, termsA, termsB));
    const independent = new Set(both.map(sourceKey)).size;
    const type: ConnectionType = independent >= 2 ? "OBSERVED CONNECTION" : independent === 1 ? "EMERGING SIGNAL" : "CREATIVE HYPOTHESIS";
    const recent = both.filter((evidence) => inWindow(evidence.date, window));
    const recency: Recency = !both.length ? "none" : recent.length ? "in-window" : both.some((evidence) => !evidence.date || /^\d{4}$/.test(evidence.date)) ? "undated" : "out-of-window";
    const same = connections.find((prev) => norm(prev.direction) === norm(item.direction) && ideaSimilarity(`${prev.action} ${prev.object}`, `${item.action} ${item.object}`) >= 0.5);
    if (same) continue;
    const dates = recent.map((evidence) => evidence.date!.slice(0, 10)).sort();
    connections.push({ connectionId: `conn-${connections.length + 1}`, title: item.title, subject: item.subject, action: item.action, object: item.object, direction: item.direction, platform: item.platform, context: item.context, explanation: item.explanation, evidenceIds, coOccurrence: both.length, independentSources: independent, type, observedDateRange: dates.length ? { from: dates[0], to: dates.at(-1)! } : null, recency, inWindowCount: recent.length });
  }
  for (const direction of plan) {
    // 같은 방향이 이미 있으면(이름이 같거나, 이름이 달라도 내용이 같은 현상) 가설을 덧붙이지 않는다.
    if (connections.some((item) => norm(item.direction) === norm(direction.direction) || ideaSimilarity(direction.hypothesis, `${item.title} ${item.action} ${item.object}`) >= 0.15)) continue;
    connections.push({ connectionId: `conn-${connections.length + 1}`, title: direction.hypothesis, subject: "", action: "", object: "", direction: direction.direction, platform: "", context: "", explanation: "검색했지만 이 방향의 실제 사례를 이번 표본에서 찾지 못했습니다. 실제 유행으로 표시하지 않습니다.", evidenceIds: [], coOccurrence: 0, independentSources: 0, type: "CREATIVE HYPOTHESIS", observedDateRange: null, recency: "none", inWindowCount: 0, notFound: true });
  }
  const order: Record<ConnectionType, number> = { "OBSERVED CONNECTION": 0, "EMERGING SIGNAL": 1, "CREATIVE HYPOTHESIS": 2 };
  return { connections: connections.sort((a, b) => order[a.type] - order[b.type] || b.coOccurrence - a.coOccurrence), removedIds: [...new Set(removedIds)] };
}

/* ── T4: Overview "WHAT'S HAPPENING NOW?" 저장·정렬·필터 ── */
/** 브라우저에 저장하는 발견 결과. 다시 열 때 API를 부르지 않는다. */
export type DiscoveryReport = {
  id: string; keyword: string; window: DiscoveryWindow; signals: DiscoverySignal[]; excluded: DiscoveryExcluded[];
  limitations: string[]; sources: { youtube: number; web: number; webDropped: number }; ledger: EvidenceItem[];
  model: string; generatedAt: string; ownerId?: string;
};
/** 사용자가 저장한 현상(발견 결과의 신호 한 개 + 그 신호가 인용한 근거만). */
export type SavedPhenomenon = { key: string; reportId: string; keyword: string; window: DiscoveryWindow; signal: DiscoverySignal; evidence: EvidenceItem[]; savedAt: string; ownerId?: string };
export const phenomenonKey = (reportId: string, signalId: string) => `${reportId}~${signalId}`;
export const discoveryReportId = (keyword: string, days: number, generatedAt: string) => `disc-${keyword.trim().toLocaleLowerCase("ko-KR").replace(/[^a-z0-9가-힣]+/g, "_").slice(0, 30)}-${days}-${generatedAt.slice(0, 19).replace(/\D/g, "")}`;
export const signalStatusLabels: Record<SignalStatus, string> = { Observed: "관측됨", "Emerging Signal": "떠오르는 신호" };

export type SignalSort = "relevance" | "evidence" | "recent";
export const signalSortLabels: Record<SignalSort, string> = { relevance: "관련도순", evidence: "근거 많은 순", recent: "최근 관측순" };
export type SignalFilter = "all" | SignalStatus;
/** 관련도순은 발견 단계의 순서(키워드와의 관련도) 그대로. 다른 정렬은 서버가 다시 센 숫자만 쓴다. */
export function arrangeSignals(signals: DiscoverySignal[], sort: SignalSort, filter: SignalFilter) {
  const kept = signals.filter((signal) => filter === "all" || signal.verificationStatus === filter);
  if (sort === "evidence") return [...kept].sort((a, b) => b.independentSources - a.independentSources || b.inWindowCount - a.inWindowCount);
  if (sort === "recent") return [...kept].sort((a, b) => (b.observedDateRange?.to ?? "").localeCompare(a.observedDateRange?.to ?? ""));
  return kept;
}
