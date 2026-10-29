import "server-only";
import { trendAnalysisSchema, type EvidenceItem, type SeriesStats, type TrendAnalysis } from "./schemas";
import type { NaverTrendSignal } from "./naver";
import { callStructured, js } from "./openai-client";
import { ledgerForPrompt } from "./evidence-ledger";
import { enforceStatus, sanitizeIds, type ValidationLog } from "./signal";

export { OpenAIAnalysisError } from "./openai-client";

const analysisJsonSchema = js.obj({
  trend: js.str,
  origin: js.obj({ summary: js.str, evidenceIds: js.strArr }),
  triggers: js.arr(js.obj({ title: js.str, explanation: js.str, status: js.status, evidenceIds: js.strArr })),
  timeline: js.arr(js.obj({ date: js.str, label: js.str, evidenceIds: js.strArr })),
  motivations: js.arr(js.obj({ label: js.str, explanation: js.str, status: js.status, evidenceIds: js.strArr })),
  futureScenarios: js.arr(js.obj({ title: js.str, explanation: js.str, status: js.enumOf(["Creative Hypothesis"]) })),
  missingEvidence: js.strArr,
});

export const TREND_WHY_PROMPT_VERSION = "why-live-v2";

const instructions = [
  "You are TREND RADAR, a cautious Korean cultural intelligence analyst. Return Korean analysis only in the requested JSON schema.",
  "You receive an EVIDENCE LEDGER built by the server from real API responses. You may cite evidence only by these exact ids. Never invent ids, articles, URLs, events, people, brands, dates, surveys, or sources.",
  "NAVER-xx items are a relative search-interest index (0-100 within one request), not absolute volume, origin, causality, demographics, or consumer psychology.",
  "IG-xx items are a small sample of Instagram hashtag posts returned by the API. They show what some posts contain; they do not represent all of Instagram, popularity, or demographics.",
  "Status rules: Verified Signal = directly observable in the cited evidence (e.g. a peak period in NAVER data, a word that literally appears in captions). Supported Hypothesis = an interpretation that cited evidence makes plausible. Creative Hypothesis = speculative. Insufficient Evidence = the question matters but the ledger cannot answer it.",
  "Temporal coincidence between search interest and posts is not proof of causation. Say so when relevant.",
  "Timeline entries must be dated observations taken from the evidence (NAVER periods or IG post timestamps, YYYY-MM-DD) and must cite that evidence. Do not add external historical events that are not in the ledger.",
  "Origin: if the ledger cannot establish where the trend started, say that verification is needed and use an empty evidenceIds array.",
  "Future scenarios must always be Creative Hypothesis. List concrete missing evidence that would be needed to verify the hypotheses.",
].join(" ");

export type WhyResult = { report: TrendAnalysis; model: string; analyzedAt: string; promptVersion: string; validation: ValidationLog };

export function validateWhyReport(report: TrendAnalysis, evidence: EvidenceItem[]): { report: TrendAnalysis; validation: ValidationLog } {
  const valid = new Set(evidence.map((item) => item.id));
  const removed: string[] = [];
  const counter = { downgraded: 0 };
  const triggers = report.triggers.map((item) => { const evidenceIds = sanitizeIds(item.evidenceIds, valid, removed); return { ...item, evidenceIds, status: enforceStatus(item.status, evidenceIds, counter) }; });
  const motivations = report.motivations.map((item) => { const evidenceIds = sanitizeIds(item.evidenceIds, valid, removed); return { ...item, evidenceIds, status: enforceStatus(item.status, evidenceIds, counter) }; });
  const allTimeline = report.timeline.map((item) => ({ ...item, evidenceIds: sanitizeIds(item.evidenceIds, valid, removed) }));
  // 근거 없는 타임라인 항목은 관찰 사실이 아니므로 제외하고 날짜순으로 정렬한다.
  const timeline = allTimeline.filter((item) => item.evidenceIds.length > 0).sort((a, b) => a.date.localeCompare(b.date));
  return {
    report: { ...report, origin: { ...report.origin, evidenceIds: sanitizeIds(report.origin.evidenceIds, valid, removed) }, triggers, motivations, timeline },
    validation: { removedEvidenceIds: [...new Set(removed)], downgraded: counter.downgraded, droppedTimeline: allTimeline.length - timeline.length },
  };
}

export async function analyzeTrendWithOpenAI(trend: string, signal: NaverTrendSignal, evidence: EvidenceItem[], stats: SeriesStats[]): Promise<WhyResult> {
  const input = [
    `분석 대상: ${trend}`,
    `NAVER 요청 조건: ${signal.startDate}~${signal.endDate}, 단위 ${signal.timeUnit}, 키워드 그룹 ${signal.series.map((s) => s.title).join(", ")}`,
    `서버 계산 통계(NAVER, 같은 요청 내 비교만 유효): ${JSON.stringify(stats)}`,
    `NAVER 원시 시계열: ${JSON.stringify(signal.series.map((s) => ({ title: s.title, data: s.data })))}`,
    `EVIDENCE LEDGER: ${JSON.stringify(ledgerForPrompt(evidence))}`,
  ].join("\n");
  const { data, model } = await callStructured({ name: "trend_why_analysis", jsonSchema: analysisJsonSchema, validator: trendAnalysisSchema, instructions, input, maxOutputTokens: 5000 });
  const { report, validation } = validateWhyReport(data, evidence);
  return { report, model, analyzedAt: new Date().toISOString(), promptVersion: TREND_WHY_PROMPT_VERSION, validation };
}
