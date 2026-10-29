import type { TrendContext } from "./schemas";
import type { LiveAnalysisSnapshot, Trend } from "./types";

export const LIVE_PREFIX = "live-";

/** LIVE 트렌드는 키워드에서 파생된 고유 ID를 갖는다. 데모 트렌드 ID와 절대 겹치지 않는다. */
export function liveTrendId(keyword: string) {
  return LIVE_PREFIX + keyword.trim().replace(/\s+/g, "-").toLocaleLowerCase("ko-KR");
}

export function isLiveTrendId(id: string) { return id.startsWith(LIVE_PREFIX) && id.length > LIVE_PREFIX.length; }

export function keywordFromLiveId(id: string) { return id.slice(LIVE_PREFIX.length).replace(/-/g, " "); }

export function safeDecode(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function makeLiveTrend(id: string, name = keywordFromLiveId(id)): Trend {
  return { id, name, en: "LIVE KEYWORD", category: "Live", summary: "NAVER DataLab·Instagram 실데이터와 OpenAI 해석으로 분석하는 사용자 지정 키워드입니다.", signal: "LIVE", status: "Supported Hypothesis", tags: [], accent: "#008080" };
}

export function trendPath(id: string, view: "why" | "dna") { return `/trends/${encodeURIComponent(id)}/${view}`; }

/** 저장된 LIVE 분석을 Collision·Lab·Studio API 입력으로 변환한다. WHY 근거가 없으면 null. */
export function toTrendContext(snapshot: LiveAnalysisSnapshot): TrendContext | null {
  if (!snapshot.whyReport || !snapshot.evidence?.length) return null;
  return {
    key: snapshot.trendId,
    name: snapshot.trendName,
    keywords: snapshot.keywords.slice(0, 5),
    analyzedAt: snapshot.analyzedAt,
    why: snapshot.whyReport,
    dna: snapshot.dna,
    evidence: snapshot.evidence,
    signalStats: snapshot.signalStats,
  };
}
