import type { AnalysisStatus, EvidenceItem, TrendAnalysis } from "./schemas";
import type { LiveAnalysisSnapshot } from "./types";

export type WhyOverview = {
  summary: string;
  status: AnalysisStatus;
  evidenceIds: string[];
  source: "overview" | "what" | "report" | "context" | "trigger" | "motivation" | "dna" | "insufficient";
  needsReanalysis: boolean;
};

const originFailure = /(최초|기원|발원|시작점|발생 시점).{0,30}(확인|파악|특정|확정).{0,12}(없|어렵|못|수 없다)|추가 자료.{0,20}필요|제공된 자료만으로.{0,90}(확인|파악|확정)/;
const normalize = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
const withoutOriginFailure = (value: string | undefined) => normalize(value).split(/(?<=[.!?。])\s+/).filter((sentence) => !originFailure.test(sentence)).join(" ").trim();
const usable = (value: string | undefined, trendName?: string) => {
  const text = normalize(value);
  return text.length >= 24 && text.toLocaleLowerCase("ko-KR") !== normalize(trendName).toLocaleLowerCase("ko-KR") && !originFailure.test(text);
};

const sentences = (value: string) => normalize(value).split(/(?<=[.!?。])\s+/).filter(Boolean);
/** 검색 지수 수치만 말하는 문장(현상의 내용이 없음). */
const statOnly = /(검색 관심도|검색 지수|상대 지수|상대 검색|DataLab).{0,80}(최고치|정점|평균|하락|상승|기록|높았|낮아|낮았)|초기 ?1\/3|최근 ?1\/3|진행 중이므로/;
/** 표본·지수의 한계를 말하는 면책 문장. 카드에서는 상태 배지로 대신한다(WHY 상세에는 그대로 남음). */
const caveat = /(뜻하지|의미하지|대표하지|입증하지|증명하지|설명하지|보여주지|알 수 없|볼 수는 없|단정할 수 없)/;
const clip = (value: string, max = 260) => value.length <= max ? value : `${value.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;

/** 근거가 연결된 문화적 맥락 한 문장: 배경 → 참여 동기 → 확산 콘텐츠 → 원인 가설 순. */
function culturalPoint(report: TrendAnalysis, evidence: EvidenceItem[], trendName: string): { text: string; status: AnalysisStatus; evidenceIds: string[]; source: WhyOverview["source"] } | null {
  const candidates: Array<{ text: string; status: AnalysisStatus; ids: string[]; source: WhyOverview["source"] }> = [
    ...(report.context ? [{ text: report.context.background.summary, status: report.context.background.status, ids: report.context.background.evidenceIds, source: "context" as const }] : []),
    ...report.motivations.map((item) => ({ text: item.explanation, status: item.status, ids: item.evidenceIds, source: "motivation" as const })),
    ...(report.context?.spreadContents ?? []).map((item) => ({ text: item.explanation, status: item.status, ids: item.evidenceIds, source: "context" as const })),
    ...report.triggers.map((item) => ({ text: item.explanation, status: item.status, ids: item.evidenceIds, source: "trigger" as const })),
  ];
  for (const item of candidates) {
    const ids = validIds(item.ids, evidence);
    if (!ids.length || item.status === "Insufficient Evidence") continue;
    const text = sentences(withoutOriginFailure(item.text)).filter((sentence) => !statOnly.test(sentence) && !caveat.test(sentence))[0];
    if (text && usable(text, trendName)) return { text, status: item.status, evidenceIds: ids, source: item.source };
  }
  return null;
}

function validIds(ids: string[] | undefined, evidence: EvidenceItem[]) {
  const valid = new Set(evidence.map((item) => item.id));
  return [...new Set((ids ?? []).filter((id) => valid.has(id)))];
}

/** Every evidence item actually referenced by the report, distinct from everything collected. */
export function usedWhyEvidenceIds(report: TrendAnalysis | undefined, evidence: EvidenceItem[] = []) {
  if (!report) return [];
  const context = report.context;
  const ids = [
    ...(report.overview?.evidenceIds ?? []), ...(report.what?.evidenceIds ?? []), ...report.origin.evidenceIds,
    ...report.triggers.flatMap((item) => item.evidenceIds), ...report.motivations.flatMap((item) => item.evidenceIds),
    ...report.timeline.flatMap((item) => item.evidenceIds),
    ...(context ? [
      ...context.background.evidenceIds,
      ...context.events.flatMap((item) => item.evidenceIds),
      ...context.spreadContents.flatMap((item) => item.evidenceIds),
      ...context.brandCases.flatMap((item) => item.evidenceIds),
    ] : []),
  ];
  return validIds(ids, evidence);
}

export function selectWhyOverview(input: Pick<LiveAnalysisSnapshot, "trendName" | "summary" | "whyReport" | "evidence" | "dna">): WhyOverview {
  const report = input.whyReport;
  const evidence = input.evidence ?? [];
  if (!report) return { summary: "분석 근거 부족 · WHY 재분석 권장", status: "Insufficient Evidence", evidenceIds: [], source: "insufficient", needsReanalysis: true };
  const candidate = report.overview;
  if (candidate && usable(candidate.summary, input.trendName)) return { ...candidate, evidenceIds: validIds(candidate.evidenceIds, evidence), source: "overview", needsReanalysis: false };
  if (report.what && usable(report.what.summary, input.trendName)) return { ...report.what, evidenceIds: validIds(report.what.evidenceIds, evidence), source: "what", needsReanalysis: false };

  // v1-v4 보고서: `trend` 서술에서 기원 실패·검색 지수 수치·면책 문장을 빼고 남는 "현상 설명"을 쓰고,
  // 근거가 연결된 문화적 맥락(배경·참여 동기·확산 콘텐츠) 한 가지를 덧붙인다. 새 사실을 만들지 않고 저장된 문장만 재사용한다.
  const descriptive = sentences(withoutOriginFailure(report.trend)).filter((sentence) => sentence.length >= 15 && !statOnly.test(sentence) && !caveat.test(sentence)).slice(0, 2).join(" ");
  const cultural = culturalPoint(report, evidence, input.trendName);
  const legacy = [descriptive, cultural?.text].filter(Boolean).join(" ");
  if (usable(legacy, input.trendName)) {
    const ids = cultural ? [...new Set([...cultural.evidenceIds])] : usedWhyEvidenceIds(report, evidence);
    // 인용이 없는 `trend` 서술이 섞이면 상태는 Supported Hypothesis보다 높게 표시하지 않는다.
    const status: AnalysisStatus = !cultural ? "Supported Hypothesis" : descriptive && cultural.status === "Verified Signal" ? "Supported Hypothesis" : cultural.status;
    return { summary: clip(legacy), status, evidenceIds: ids, source: descriptive ? "report" : cultural!.source, needsReanalysis: false };
  }
  // 문화적 설명이 하나도 없으면 검색 추이 서술이라도 보여 준다(관찰값이므로 사실 생성 아님).
  const legacyReportSummary = withoutOriginFailure(report.trend);
  if (usable(legacyReportSummary, input.trendName)) return { summary: clip(legacyReportSummary), status: "Supported Hypothesis", evidenceIds: usedWhyEvidenceIds(report, evidence), source: "report", needsReanalysis: false };

  const background = report.context?.background;
  if (background && usable(background.summary, input.trendName) && validIds(background.evidenceIds, evidence).length) return { ...background, evidenceIds: validIds(background.evidenceIds, evidence), source: "context", needsReanalysis: false };
  const trigger = report.triggers.find((item) => usable(item.explanation, input.trendName) && validIds(item.evidenceIds, evidence).length);
  if (trigger) return { summary: trigger.explanation, status: trigger.status, evidenceIds: validIds(trigger.evidenceIds, evidence), source: "trigger", needsReanalysis: false };
  const motivation = report.motivations.find((item) => usable(item.explanation, input.trendName) && validIds(item.evidenceIds, evidence).length);
  if (motivation) return { summary: motivation.explanation, status: motivation.status, evidenceIds: validIds(motivation.evidenceIds, evidence), source: "motivation", needsReanalysis: false };
  if (input.dna?.dominantPattern && usable(input.dna.dominantPattern.explanation, input.trendName)) return { summary: input.dna.dominantPattern.explanation, status: input.dna.dominantPattern.status, evidenceIds: validIds(input.dna.dominantPattern.evidenceIds, evidence), source: "dna", needsReanalysis: false };
  return { summary: "분석 근거 부족 · 핵심 인사이트를 만들려면 WHY 재분석이 필요합니다.", status: "Insufficient Evidence", evidenceIds: [], source: "insufficient", needsReanalysis: true };
}

export function overviewSummary(report: TrendAnalysis, trendName: string, evidence: EvidenceItem[] = []) {
  return selectWhyOverview({ trendName, summary: "", whyReport: report, evidence }).summary;
}
