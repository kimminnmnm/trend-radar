import type { AnalysisStatus, EvidenceItem, SeriesStats } from "./schemas";

type Series = { title: string; data: Array<{ period: string; ratio: number }> };

const round = (value: number) => Math.round(value * 10) / 10;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/**
 * 한 번의 NAVER 요청 안에서만 의미가 있는 결정적 통계.
 * 서로 다른 요청의 값은 척도가 달라 비교하지 않는다.
 */
export function computeSeriesStats(series: Series[], window?: { endDate: string; timeUnit: "date" | "week" | "month" }): SeriesStats[] {
  return series.map((item) => {
    const sorted = [...item.data].sort((a, b) => a.period.localeCompare(b.period));
    // 조회 종료일이 마지막 주·월의 끝보다 앞서면 그 구간은 아직 진행 중이므로 추세 계산에서 제외한다.
    const partialLast = Boolean(window && window.timeUnit !== "date" && sorted.length && isPartialPeriod(sorted.at(-1)!.period, window.endDate, window.timeUnit));
    const data = partialLast ? sorted.slice(0, -1) : sorted;
    if (data.length < 3) {
      const last = data.at(-1) ?? { period: "-", ratio: 0 };
      return { title: item.title, points: data.length, mean: round(average(data.map((p) => p.ratio))), peak: last, latest: last, earlyAvg: 0, recentAvg: 0, direction: "데이터 부족" as const, partialLastExcluded: partialLast };
    }
    const third = Math.max(1, Math.floor(data.length / 3));
    const earlyAvg = average(data.slice(0, third).map((p) => p.ratio));
    const recentAvg = average(data.slice(-third).map((p) => p.ratio));
    const peak = data.reduce((best, point) => point.ratio > best.ratio ? point : best, data[0]);
    const change = earlyAvg === 0 ? (recentAvg > 0 ? 1 : 0) : (recentAvg - earlyAvg) / earlyAvg;
    const direction = change > 0.15 ? "상승" as const : change < -0.15 ? "하락" as const : "유지" as const;
    return { title: item.title, points: data.length, mean: round(average(data.map((p) => p.ratio))), peak: { period: peak.period, ratio: round(peak.ratio) }, latest: { period: data.at(-1)!.period, ratio: round(data.at(-1)!.ratio) }, earlyAvg: round(earlyAvg), recentAvg: round(recentAvg), direction, partialLastExcluded: partialLast };
  });
}

function isPartialPeriod(period: string, endDate: string, unit: "week" | "month") {
  const start = new Date(`${period}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const last = unit === "week" ? new Date(start.getTime() + 6 * 86_400_000) : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return end < last;
}

/** AI가 반환한 근거 ID 중 실제 원장에 있는 것만 남긴다. */
export function sanitizeIds(ids: string[] | undefined, valid: Set<string>, removed: string[]) {
  const kept: string[] = [];
  for (const id of ids ?? []) {
    if (valid.has(id)) { if (!kept.includes(id)) kept.push(id); }
    else removed.push(id);
  }
  return kept;
}

/** 근거가 없는 Verified/Supported 주장은 Insufficient Evidence로 낮춘다. Creative Hypothesis는 근거 없이 허용한다. */
export function enforceStatus(status: AnalysisStatus, ids: string[], counter: { downgraded: number }): AnalysisStatus {
  if ((status === "Verified Signal" || status === "Supported Hypothesis") && ids.length === 0) { counter.downgraded += 1; return "Insufficient Evidence"; }
  return status;
}

export type ValidationLog = { removedEvidenceIds: string[]; downgraded: number; droppedTimeline?: number };

export function evidenceLookup(evidence: EvidenceItem[] | undefined) {
  return new Map((evidence ?? []).map((item) => [item.id, item]));
}
