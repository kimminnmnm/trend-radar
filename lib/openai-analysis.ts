import "server-only";
import { trendAnalysisSchema, type EvidenceItem, type SeriesStats, type TrendAnalysis, type WhyContext } from "./schemas";
import type { NaverTrendSignal } from "./naver";
import { callStructured, js } from "./openai-client";
import { ledgerForPrompt } from "./evidence-ledger";
import { enforceStatus, sanitizeIds, type ValidationLog } from "./signal";

export { OpenAIAnalysisError } from "./openai-client";

const analysisJsonSchema = js.obj({
  trend: js.str,
  what: js.obj({ summary: js.str, status: js.status, evidenceIds: js.strArr }),
  overview: js.obj({ summary: js.str, status: js.status, evidenceIds: js.strArr }),
  origin: js.obj({ summary: js.str, evidenceIds: js.strArr }),
  triggers: js.arr(js.obj({ title: js.str, explanation: js.str, status: js.status, evidenceIds: js.strArr })),
  timeline: js.arr(js.obj({ date: js.str, label: js.str, evidenceIds: js.strArr })),
  motivations: js.arr(js.obj({ label: js.str, explanation: js.str, status: js.status, evidenceIds: js.strArr })),
  futureScenarios: js.arr(js.obj({ title: js.str, explanation: js.str, status: js.enumOf(["Creative Hypothesis"]) })),
  missingEvidence: js.strArr,
  context: js.obj({
    background: js.obj({ summary: js.str, status: js.status, evidenceIds: js.strArr }),
    events: js.arr(js.obj({ date: js.str, label: js.str, evidenceIds: js.strArr })),
    spreadContents: js.arr(js.obj({ title: js.str, explanation: js.str, status: js.status, evidenceIds: js.strArr })),
    brandCases: js.arr(js.obj({ brand: js.str, summary: js.str, date: js.str, evidenceIds: js.strArr })),
  }),
});

export const TREND_WHY_PROMPT_VERSION = "why-live-v5-balanced";

const instructions = [
  "You are TREND RADAR, a cautious Korean cultural intelligence analyst. Return Korean analysis only in the requested JSON schema.",
  "You receive an EVIDENCE LEDGER built by the server from real API responses. You may cite evidence only by these exact ids. Never invent ids, articles, URLs, events, people, brands, dates, surveys, or sources.",
  "First disambiguate the user's keyword from the evidence. Do not silently analyze a different person, character, event, product, or homonym. If the meaning remains ambiguous, state the ambiguity in what.summary and missingEvidence.",
  "Structure the analysis as: WHAT = what; WHY NOW = triggers; CULTURAL CONTEXT = context; AUDIENCE MOTIVATION = motivations; SPREADING CONTENT = context.spreadContents; ORIGIN = origin.",
  "overview is the representative insight shown on the Overview card. It must explain the most distinctive currently observed feature, cultural context, or audience response supported by evidence. Never use an unverified-origin sentence, a generic lack-of-causality disclaimer, or a request for more data as overview.summary.",
  "what describes the current observable phenomenon using concrete keyword-specific details. Do not make causal claims in what.",
  "NAVER-xx items are a relative search-interest index (0-100 within one request), not absolute volume, origin, causality, demographics, or consumer psychology.",
  "IG-xx items are a small sample of Instagram hashtag posts returned by the API. They show what some posts contain; they do not represent all of Instagram, popularity, or demographics.",
  "YT-xx items are a small, recent YouTube search sample with public titles, publication times and view counts at collection time. They do not represent all YouTube trends. A high view count, upload cluster or temporal coincidence is not evidence that a video caused the trend.",
  "Status rules: Verified Signal = directly observable in the cited evidence (e.g. a peak period in NAVER data, a word that literally appears in captions). Supported Hypothesis = an interpretation that cited evidence makes plausible. Creative Hypothesis = speculative. Insufficient Evidence = the question matters but the ledger cannot answer it.",
  "Temporal coincidence between search interest and posts is not proof of causation. Say so when relevant.",
  "Timeline entries must be dated observations taken from the evidence (NAVER periods, IG post timestamps, or YT publication timestamps, YYYY-MM-DD) and must cite that evidence. Do not add external historical events that are not in the ledger.",
  "Origin is only one section. If the ledger cannot establish where the trend started, say that verification is needed and use an empty evidenceIds array, but still provide useful WHAT, WHY NOW, context, motivation, and overview when their evidence exists.",
  "Future scenarios must always be Creative Hypothesis. List concrete missing evidence that would be needed to verify the hypotheses.",
  "WEB-xx items are AI summaries of public web pages (news, magazines, brand pages) found by web search. They show that a source reported something, not that it caused the trend. Never treat a WEB item as proof of causation.",
  "context.background: the trend's background or history as reported by WEB sources (Verified Signal only when a cited source states it directly; otherwise Supported Hypothesis or Insufficient Evidence).",
  "context.events: real-world cultural events reported by WEB sources, each with the date given by the source (YYYY-MM-DD, YYYY-MM or YYYY) and citing WEB ids. context.brandCases: reported brand collaborations or marketing uses with brand name, date and WEB ids. If no WEB source reports them, return empty arrays.",
  "context.spreadContents: content that may have influenced the spread (videos, dramas, celebrities, memes). Influence on spread is a causal claim: use Supported Hypothesis when a cited source makes it plausible, otherwise Creative Hypothesis.",
  "Timeline may include WEB-reported dated events in addition to NAVER periods and IG timestamps, always citing the evidence.",
].join(" ");

export type WhyResult = { report: TrendAnalysis; model: string; analyzedAt: string; promptVersion: string; validation: ValidationLog };

export function validateWhyReport(report: TrendAnalysis, evidence: EvidenceItem[]): { report: TrendAnalysis; validation: ValidationLog } {
  const valid = new Set(evidence.map((item) => item.id));
  const removed: string[] = [];
  const counter = { downgraded: 0 };
  const triggers = report.triggers.map((item) => { const evidenceIds = sanitizeIds(item.evidenceIds, valid, removed); return { ...item, evidenceIds, status: enforceStatus(item.status, evidenceIds, counter) }; });
  const motivations = report.motivations.map((item) => { const evidenceIds = sanitizeIds(item.evidenceIds, valid, removed); return { ...item, evidenceIds, status: enforceStatus(item.status, evidenceIds, counter) }; });
  const context = report.context ? validateContext(report.context, valid, webIds(evidence), removed, counter) : undefined;
  const validateInsight = (item: TrendAnalysis["overview"] | TrendAnalysis["what"]) => {
    if (!item) return undefined;
    const evidenceIds = sanitizeIds(item.evidenceIds, valid, removed);
    return { ...item, evidenceIds, status: enforceStatus(item.status, evidenceIds, counter) };
  };
  const what = validateInsight(report.what);
  const overview = validateInsight(report.overview);
  const allTimeline = report.timeline.map((item) => ({ ...item, evidenceIds: sanitizeIds(item.evidenceIds, valid, removed) }));
  // 근거 없는 타임라인 항목은 관찰 사실이 아니므로 제외하고 날짜순으로 정렬한다.
  const timeline = allTimeline.filter((item) => item.evidenceIds.length > 0).sort((a, b) => a.date.localeCompare(b.date));
  return {
    report: { ...report, ...(what ? { what } : {}), ...(overview ? { overview } : {}), ...(context ? { context: context.value } : {}), origin: { ...report.origin, evidenceIds: sanitizeIds(report.origin.evidenceIds, valid, removed) }, triggers, motivations, timeline },
    validation: { removedEvidenceIds: [...new Set(removed)], downgraded: counter.downgraded, droppedTimeline: allTimeline.length - timeline.length, droppedContext: context?.dropped ?? 0 },
  };
}

const webIds = (evidence: EvidenceItem[]) => new Set(evidence.filter((item) => item.kind === "web_source").map((item) => item.id));

/**
 * 보도된 사실(사건·브랜드 사례)은 WEB 근거가 있어야 남긴다. 확산 콘텐츠는 원인 주장이므로 Verified Signal을 Supported Hypothesis로 낮춘다.
 */
function validateContext(context: WhyContext, valid: Set<string>, web: Set<string>, removed: string[], counter: { downgraded: number }) {
  const reported = <T extends { evidenceIds: string[] }>(items: T[]) => items.map((item) => ({ ...item, evidenceIds: sanitizeIds(item.evidenceIds, valid, removed) })).filter((item) => item.evidenceIds.some((id) => web.has(id)));
  const events = reported(context.events).sort((a, b) => a.date.localeCompare(b.date));
  const brandCases = reported(context.brandCases);
  const spreadContents = context.spreadContents.map((item) => {
    const evidenceIds = sanitizeIds(item.evidenceIds, valid, removed);
    let status = enforceStatus(item.status, evidenceIds, counter);
    if (status === "Verified Signal") { status = "Supported Hypothesis"; counter.downgraded += 1; }
    return { ...item, evidenceIds, status };
  });
  const backgroundIds = sanitizeIds(context.background.evidenceIds, valid, removed);
  const background = { ...context.background, evidenceIds: backgroundIds, status: enforceStatus(context.background.status, backgroundIds, counter) };
  const dropped = context.events.length - events.length + context.brandCases.length - brandCases.length;
  return { value: { background, events, spreadContents, brandCases }, dropped };
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
