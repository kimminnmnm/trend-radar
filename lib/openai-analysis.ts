import "server-only";
import { z } from "zod";
import { trendAnalysisSchema, whyInsightSchema, type EvidenceItem, type PhenomenonContext, type SeriesStats, type TrendAnalysis, type WhyContext, type WhyPhenomenon } from "./schemas";
import type { NaverTrendSignal } from "./naver";
import { callStructured, js } from "./openai-client";
import { phenomenonAnchorTerms } from "./discovery";
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

/* ── T5: Context-Aware WHY — 선택한 현상 자체를 분석 ── */
export const PHENOMENON_WHY_PROMPT_VERSION = "why-phenomenon-v1";

const phenomenonJsonSchema = { ...analysisJsonSchema, properties: { ...analysisJsonSchema.properties, phenomenon: js.obj({ who: js.obj({ summary: js.str, status: js.status, evidenceIds: js.strArr }), how: js.obj({ summary: js.str, status: js.status, evidenceIds: js.strArr }) }) }, required: [...analysisJsonSchema.required, "phenomenon"] };
const phenomenonModelSchema = trendAnalysisSchema.omit({ phenomenon: true }).extend({ phenomenon: z.object({ who: whyInsightSchema, how: whyInsightSchema }) });

const phenomenonInstructions = (context: PhenomenonContext) => [
  "PHENOMENON MODE. The user selected ONE specific phenomenon inside a broader parent keyword. Analyze this phenomenon itself — its subject, action, object and direction — not the parent keyword in general, not the parent keyword's history, and not a different direction of the same concepts.",
  `Selected phenomenon: "${context.title}". Parent keyword: ${context.keyword}. Subject: ${context.subject || "(not extracted)"}. Action: ${context.action || context.coreBehavior || "(not extracted)"}. Object: ${context.object || "(not extracted)"}. Direction: ${context.direction || "(not specified)"}. Cultural context noted at discovery: ${context.culturalContext || "(none)"}. Observed window: ${context.window.from}~${context.window.to}. Server evidence status at discovery: ${context.verificationStatus} (${context.independentSources} independent source(s)).`,
  "Map the sections as follows. WHAT (what): what concretely happens in this phenomenon. WHO (phenomenon.who): who does what — creators, viewers, players, brands — only as the evidence shows. HOW (phenomenon.how): how it is expressed and shared — formats, platforms, titles, recurring patterns. CULTURAL CONTEXT (context.background): which cultures or communities this exact behavior connects. WHY NOW (triggers): the interest background visible in the current evidence; temporal coincidence is not causation and you must not assert why it spread. EVIDENCE: cite ledger ids everywhere.",
  "Origin is optional in this mode. If the ledger does not show where this phenomenon started, set origin.summary to a short note that the analysis focuses on the phenomenon's current form and its first origin was not verified, with empty evidenceIds. Never fill origin, background or what with the parent keyword's general history.",
  "D-xx items were collected during discovery specifically for this phenomenon and are reused here. Evidence that only concerns the parent keyword in general, or a different direction, must not be cited as support for claims about this phenomenon; mention it only to contrast.",
  context.verificationStatus === "OBSERVED" ? "The phenomenon is observed in independent sources; still do not call it popular, viral or rising unless a cited source says so." : "The phenomenon is an early or limited signal. Describe it as such. Never call it a trend, popular, viral or rising. Say what evidence is missing.",
  "If the ledger has little about the selected direction, keep the analysis short and list the gaps in missingEvidence instead of substituting general facts. Unsupported sections must use Insufficient Evidence with empty evidenceIds.",
].join(" ");

export { phenomenonAnchorTerms };
/** 서버 결정적 검사: WHAT·대표 요약이 현상 핵심어를 담는지, 상위 키워드의 역사·기원 설명으로 이탈했는지, 근거가 약한데 유행으로 단정했는지. */
export function checkPhenomenonFocus(report: Pick<TrendAnalysis, "what" | "overview">, context: PhenomenonContext) {
  const anchorTerms = phenomenonAnchorTerms(context);
  const text = `${report.what?.summary ?? ""} ${report.overview?.summary ?? ""}`;
  const hits = anchorTerms.filter((term) => text.toLowerCase().includes(term.toLowerCase()));
  const anchored = anchorTerms.length === 0 || hits.length >= Math.min(2, anchorTerms.length);
  const warnings: string[] = [];
  if (!anchored) warnings.push(`WHAT·대표 요약에 선택한 현상의 핵심어(${anchorTerms.join(", ")})가 거의 없습니다. 주제가 이탈했을 수 있습니다.`);
  if (/역사|기원|유래|시초/.test(text)) warnings.push("WHAT·대표 요약이 현상 대신 역사·기원을 설명하고 있을 수 있습니다.");
  if (context.verificationStatus !== "OBSERVED" && /유행|급상승|바이럴|인기를 끌|대세/.test(text)) warnings.push("근거가 제한적인 현상인데 유행·인기로 표현한 문장이 있습니다.");
  return { anchorTerms, anchored, warnings };
}

export async function analyzePhenomenonWithOpenAI(context: PhenomenonContext, signal: NaverTrendSignal | null, evidence: EvidenceItem[], stats: SeriesStats[], reusedEvidenceIds: string[]): Promise<WhyResult> {
  const input = [
    `분석 대상(선택한 현상): ${context.title}`,
    `상위 키워드: ${context.keyword}`,
    signal ? `NAVER 요청 조건: ${signal.startDate}~${signal.endDate}, 단위 ${signal.timeUnit}, 키워드 그룹 ${signal.series.map((s) => s.title).join(", ")}` : "NAVER: 이 현상의 검색어로는 수집하지 못함(검색 관심도 근거 없음)",
    signal ? `서버 계산 통계(NAVER, 같은 요청 내 비교만 유효): ${JSON.stringify(stats)}` : "",
    signal ? `NAVER 원시 시계열: ${JSON.stringify(signal.series.map((s) => ({ title: s.title, data: s.data })))}` : "",
    `EVIDENCE LEDGER: ${JSON.stringify(ledgerForPrompt(evidence))}`,
  ].filter(Boolean).join("\n");
  const { data, model } = await callStructured({ name: "phenomenon_why_analysis", jsonSchema: phenomenonJsonSchema, validator: phenomenonModelSchema, instructions: `${instructions} ${phenomenonInstructions(context)}`, input, maxOutputTokens: 5000 });
  const { phenomenon: lens, ...rest } = data;
  const { report, validation } = validateWhyReport({ ...rest, trend: context.title }, evidence);
  const valid = new Set(evidence.map((item) => item.id));
  const removed: string[] = [];
  const counter = { downgraded: 0 };
  const insight = (item: z.infer<typeof whyInsightSchema>) => { const evidenceIds = sanitizeIds(item.evidenceIds, valid, removed); return { ...item, evidenceIds, status: enforceStatus(item.status, evidenceIds, counter) }; };
  const phenomenon: WhyPhenomenon = { context, who: insight(lens.who), how: insight(lens.how), reusedEvidenceIds, checks: checkPhenomenonFocus(report, context) };
  return {
    report: { ...report, phenomenon }, model, analyzedAt: new Date().toISOString(), promptVersion: PHENOMENON_WHY_PROMPT_VERSION,
    validation: { ...validation, removedEvidenceIds: [...new Set([...validation.removedEvidenceIds, ...removed])], downgraded: validation.downgraded + counter.downgraded },
  };
}
