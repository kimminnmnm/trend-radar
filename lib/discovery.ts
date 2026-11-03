import { z } from "zod";
import { ideaSimilarity } from "./creative-collision";
import { phenomenonContextSchema, type EvidenceItem, type PhenomenonContext } from "./schemas";
export type { PhenomenonContext };

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

/* ── T4: Overview "WHAT'S HAPPENING NOW?" 저장·정렬·필터·전달 ── */
/** 브라우저에 저장하는 발견 결과. 다시 열 때 API를 부르지 않는다. */
export type DiscoveryReport = {
  id: string; keyword: string; window: DiscoveryWindow; signals: DiscoverySignal[]; excluded: DiscoveryExcluded[];
  limitations: string[]; sources: { youtube: number; web: number; webDropped: number }; ledger: EvidenceItem[];
  model: string; generatedAt: string; ownerId?: string;
};
export const discoveryReportId = (keyword: string, days: number, generatedAt: string) => `disc-${keyword.trim().toLocaleLowerCase("ko-KR").replace(/[^a-z0-9가-힣]+/g, "_").slice(0, 30)}-${days}-${generatedAt.slice(0, 19).replace(/\D/g, "")}`;
export const phenomenonKey = (reportId: string, signalId: string) => `${reportId}~${signalId}`;

/**
 * 화면 상태 3단계. OBSERVED는 "독립 출처 2개 이상에서 실제 사례가 확인됨"이지 인기·급상승이 아니다.
 * INSUFFICIENT EVIDENCE: 후보로 나왔지만 관측 기간 안의 근거가 없거나 확인되지 않아 판단할 수 없는 것(배경 설명·중복은 아님).
 */
export const displayStatuses = ["OBSERVED", "EMERGING", "INSUFFICIENT EVIDENCE"] as const;
export type DisplayStatus = (typeof displayStatuses)[number];
export const displayStatusOf = (status: SignalStatus): DisplayStatus => status === "Observed" ? "OBSERVED" : "EMERGING";
export const displayStatusHelp: Record<DisplayStatus, string> = {
  OBSERVED: "서로 독립된 출처 2곳 이상에서 실제 사례가 확인됨 (인기도·검색량 증가를 뜻하지 않음)",
  EMERGING: "관련 사례가 있지만 근거가 1곳뿐이라 제한적",
  "INSUFFICIENT EVIDENCE": "관측 기간 안의 확인된 근거가 없어 지금 데이터로는 판단할 수 없음",
};
const INSUFFICIENT_REASONS = ["근거가 관측 기간 밖이거나 날짜를 확인할 수 없음", "확인된 근거 없음"];
export const insufficientCandidates = (report: Pick<DiscoveryReport, "excluded">) => report.excluded.filter((item) => INSUFFICIENT_REASONS.includes(item.reason));

export type SignalSort = "relevance" | "evidence" | "recent";
export const signalSortLabels: Record<SignalSort, string> = { relevance: "관련도순", evidence: "근거 많은 순", recent: "최근 관측순" };
export type SignalFilter = "all" | DisplayStatus;
/** 관련도순은 발견 단계의 순서(키워드와의 관련도) 그대로. 다른 정렬은 서버가 다시 센 숫자만 쓴다. */
export function arrangeSignals(signals: DiscoverySignal[], sort: SignalSort, filter: SignalFilter) {
  const kept = signals.filter((signal) => filter === "all" || displayStatusOf(signal.verificationStatus) === filter);
  if (sort === "evidence") return [...kept].sort((a, b) => b.independentSources - a.independentSources || b.inWindowCount - a.inWindowCount);
  if (sort === "recent") return [...kept].sort((a, b) => (b.observedDateRange?.to ?? "").localeCompare(a.observedDateRange?.to ?? ""));
  return kept;
}

/** 저장 결과가 오래됐는지(수집 후 7일 초과). 오래된 결과는 "지금 일어나는 일"로 단정하지 않게 경고한다. */
export const STALE_DAYS = 7;
export const reportAgeDays = (generatedAt: string, now = Date.now()) => Math.floor((now - Date.parse(generatedAt)) / 86_400_000);

/** 현상 근거 중 YouTube 영상의 공식 썸네일(추가 호출 없음). 없으면 null — 이미지를 지어내지 않는다. */
export function phenomenonImage(signal: Pick<DiscoverySignal, "evidenceIds">, ledger: EvidenceItem[]) {
  const byId = new Map(ledger.map((item) => [item.id, item]));
  for (const id of signal.evidenceIds) {
    const item = byId.get(id);
    const videoId = item?.kind === "youtube_video" ? item.url?.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/)?.[1] : undefined;
    if (item && videoId) return { src: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, evidenceId: id, title: item.title };
  }
  return null;
}

const fnv = (value: string) => { let hash = 0x811c9dc5; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193); } return (hash >>> 0).toString(36); };
/**
 * 현상을 고르면 WHY·Studio에 넘기는 맥락(T4·T5): 키워드 문자열만이 아니라 현상 ID·주체·행동·대상·방향·문화 맥락·관측 기간·근거 ID.
 * 주소에도 같이 실어, 이 브라우저에 발견 결과가 없을 때(다른 기기·삭제)도 맥락을 잃지 않는다.
 */
export const phenomenonContextOf = (reportId: string, report: Pick<DiscoveryReport, "keyword" | "window">, signal: DiscoverySignal): PhenomenonContext => ({
  phenomenonId: phenomenonKey(reportId, signal.signalId), keyword: report.keyword, title: signal.title,
  // 발견 단계는 주체·대상을 따로 뽑지 않는다. 행동 문장과 현상 설명만 넘기고 빈 칸을 지어내지 않는다.
  subject: "", action: signal.audienceBehavior, object: "", direction: "", culturalContext: signal.phenomenon, coreBehavior: signal.audienceBehavior,
  window: report.window, evidenceIds: signal.evidenceIds, verificationStatus: displayStatusOf(signal.verificationStatus), independentSources: signal.independentSources,
  searchTerms: [...new Set([signal.title, ...signal.relatedKeywords].map((item) => item.trim().slice(0, 40)).filter(Boolean))].slice(0, 5), origin: "phenomenon",
});
const connectionDisplay: Record<ConnectionType, DisplayStatus> = { "OBSERVED CONNECTION": "OBSERVED", "EMERGING SIGNAL": "EMERGING", "CREATIVE HYPOTHESIS": "INSUFFICIENT EVIDENCE" };
/** 두 키워드의 연결(T3)에서 고른 현상. 주체·행동·대상·방향을 그대로 넘긴다. parentKeyword는 사용자가 출발한 키워드. */
export function phenomenonContextOfConnection(connection: Connection, input: { parentKeyword: string; window: DiscoveryWindow; termsA: string[]; termsB: string[]; runId: string }): PhenomenonContext {
  return {
    phenomenonId: `conn-${input.runId}~${fnv(`${connection.direction}|${connection.title}`)}`, keyword: input.parentKeyword, title: connection.title.slice(0, 80),
    subject: connection.subject, action: connection.action, object: connection.object, direction: connection.direction, culturalContext: connection.context,
    coreBehavior: connection.action, window: input.window, evidenceIds: connection.evidenceIds.slice(0, 12), verificationStatus: connectionDisplay[connection.type], independentSources: connection.independentSources,
    searchTerms: [...new Set([`${input.termsA[0] ?? ""} ${input.termsB[0] ?? ""}`.trim(), connection.title].filter(Boolean))].slice(0, 5), origin: "connection",
  };
}
/** 현상 분석 WHY의 저장 ID. 같은 이름의 키워드 분석(live-<키워드>)과 캐시·저장이 겹치지 않는다. */
export const phenomenonTrendId = (context: Pick<PhenomenonContext, "phenomenonId">) => `live-ph-${fnv(context.phenomenonId)}`;
export const isPhenomenonTrendId = (id: string) => /^live-ph-[0-9a-z]+$/.test(id);

/** 발견 근거는 현상의 근거 ID에 있는 것만 받아 D-xx로 다시 번호한다(WHY에서 새로 수집한 YT·WEB ID와 겹치지 않게). */
export function reusePhenomenonEvidence(phenomenon: Pick<PhenomenonContext, "evidenceIds">, items: EvidenceItem[] = []): EvidenceItem[] {
  const allowed = new Set(phenomenon.evidenceIds);
  return items.filter((item) => allowed.has(item.id) && item.kind !== "naver_series").map((item) => ({ ...item, id: `D-${item.id}`.slice(0, 40), excerpt: `${item.excerpt} (발견 단계에서 이 현상의 근거로 수집 · 재사용)`.slice(0, 800) }));
}

const STOP = new Set(["하기", "하는", "에서", "으로", "그리고", "콘텐츠", "영상", "현상", "사람들", "the", "and", "for", "with"]);
/** 주제 고정 검사용 핵심어: 현상 이름·대상·주체에서 2글자 이상 단어(조사 일부 제거). WHY(T5)와 Studio 잠금(T6)이 같이 쓴다. */
export function phenomenonAnchorTerms(context: Pick<PhenomenonContext, "title" | "object" | "subject">) {
  const words = `${context.title} ${context.object} ${context.subject}`.split(/[\s·,/()“”"'‘’|×→-]+/).map((word) => word.replace(/(을|를|이|가|은|는|의|에|로|와|과|도)$/, "")).filter((word) => word.length >= 2 && !STOP.has(word.toLowerCase()));
  return [...new Set(words)].slice(0, 8);
}

const LINK_FIELDS = { phenomenon: "phenomenonId", kw: "keyword", title: "title", sub: "subject", act: "action", obj: "object", dir: "direction", ctx: "culturalContext", behavior: "coreBehavior" } as const;
export function phenomenonQuery(context: PhenomenonContext) {
  const params = new URLSearchParams();
  for (const [param, field] of Object.entries(LINK_FIELDS)) { const value = String(context[field] ?? "").slice(0, field === "culturalContext" ? 300 : 200); if (value) params.set(param, value); }
  params.set("from", context.window.from); params.set("to", context.window.to); params.set("days", String(context.window.days));
  params.set("ev", context.evidenceIds.join(",")); params.set("status", context.verificationStatus); params.set("src", String(context.independentSources));
  if (context.searchTerms.length) params.set("terms", context.searchTerms.join("|"));
  if (context.origin !== "phenomenon") params.set("origin", context.origin);
  return params.toString();
}
/** 주소에서 맥락을 복원. 필수 값(현상 ID·키워드·이름·기간)이 없거나 형식이 틀리면 null. 형식이 틀린 근거 ID·상태는 버린다. */
export function phenomenonFromQuery(params: URLSearchParams): PhenomenonContext | null {
  const get = (name: string) => params.get(name)?.trim() ?? "";
  if (get("phenomenon") === "custom") return null;
  const status = get("status");
  const parsed = phenomenonContextSchema.safeParse({
    phenomenonId: get("phenomenon"), keyword: get("kw").slice(0, 60), title: get("title").slice(0, 80),
    subject: get("sub").slice(0, 120), action: get("act").slice(0, 300), object: get("obj").slice(0, 120), direction: get("dir").slice(0, 60), culturalContext: get("ctx").slice(0, 400), coreBehavior: get("behavior").slice(0, 300),
    window: { days: Number(get("days")), from: get("from"), to: get("to") },
    evidenceIds: get("ev").split(",").map((item) => item.trim()).filter((item) => /^[A-Za-z0-9:_-]{1,40}$/.test(item)).slice(0, 12),
    verificationStatus: (displayStatuses as readonly string[]).includes(status) ? status : "EMERGING", independentSources: Math.max(0, Math.min(99, Number(get("src")) || 0)),
    searchTerms: get("terms").split("|").map((item) => item.trim().slice(0, 40)).filter(Boolean).slice(0, 5), origin: get("origin") === "connection" ? "connection" : "phenomenon",
  });
  return parsed.success ? parsed.data : null;
}

/** Workspace(saved_items, insight 유형)에 저장하는 현상: 맥락 + 그 현상이 인용한 근거만. */
export type SavedPhenomenonPayload = { kind: "phenomenon"; context: PhenomenonContext; phenomenon: string; relatedKeywords: string[]; observedPlatforms: string[]; evidence: EvidenceItem[]; generatedAt: string };
export function isPhenomenonPayload(value: unknown): value is SavedPhenomenonPayload {
  const p = value as SavedPhenomenonPayload | null;
  return Boolean(p && p.kind === "phenomenon" && p.context && typeof p.context.phenomenonId === "string" && typeof p.context.title === "string" && p.context.window && Array.isArray(p.context.evidenceIds) && Array.isArray(p.evidence));
}
export function phenomenonPayloadOf(report: DiscoveryReport, signal: DiscoverySignal): SavedPhenomenonPayload {
  const ids = new Set(signal.evidenceIds);
  return { kind: "phenomenon", context: phenomenonContextOf(report.id, report, signal), phenomenon: signal.phenomenon, relatedKeywords: signal.relatedKeywords, observedPlatforms: signal.observedPlatforms, evidence: report.ledger.filter((item) => ids.has(item.id)), generatedAt: report.generatedAt };
}
export const phenomenonItemId = (phenomenonId: string) => `phen-${phenomenonId}`;

/* ── T8: 두 키워드 연결(T3 API)을 Overview에서 고르기 ── */
/** "로블록스 × 메이크업", "로블록스 x 메이크업"(앞뒤 띄어쓰기) → 두 키워드. 같거나 한쪽이 비면 null(단일 키워드 발견). */
export function parseKeywordPair(value: string): { a: string; b: string } | null {
  // 구분자는 앞뒤가 띄어쓴 "×" 또는 소문자 " x "만. "SPY×FAMILY", "Gen X 문화" 같은 고유명사는 단일 키워드로 둔다.
  const match = value.trim().match(/^(.+?)\s+(?:×|x)\s+(.+)$/);
  if (!match) return null;
  const a = match[1].trim().slice(0, 60), b = match[2].trim().slice(0, 60);
  return a && b && a.toLocaleLowerCase("ko-KR") !== b.toLocaleLowerCase("ko-KR") ? { a, b } : null;
}
/** 브라우저에 저장하는 연결 결과(다시 열 때 API를 부르지 않음). */
export type ConnectionRun = { id: string; a: string; b: string; window: DiscoveryWindow; termsA: string[]; termsB: string[]; connections: Connection[]; ledger: EvidenceItem[]; limitations: string[]; generatedAt: string; ownerId?: string };
export const connectionRunId = (a: string, b: string, days: number, generatedAt: string) => `cr${days}-${fnv(`${a}|${b}`)}-${generatedAt.slice(0, 19).replace(/\D/g, "")}`;
export const connectionParentKeyword = (run: Pick<ConnectionRun, "a" | "b">) => `${run.a} × ${run.b}`;
export const connectionContextOf = (run: ConnectionRun, connection: Connection) => phenomenonContextOfConnection(connection, { parentKeyword: connectionParentKeyword(run), window: run.window, termsA: run.termsA, termsB: run.termsB, runId: run.id });
export function connectionPayloadOf(run: ConnectionRun, connection: Connection): SavedPhenomenonPayload {
  const ids = new Set(connection.evidenceIds);
  return { kind: "phenomenon", context: connectionContextOf(run, connection), phenomenon: connection.explanation, relatedKeywords: [], observedPlatforms: connection.platform ? [connection.platform] : [], evidence: run.ledger.filter((item) => ids.has(item.id)), generatedAt: run.generatedAt };
}
