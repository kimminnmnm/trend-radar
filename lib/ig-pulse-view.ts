import type { IgPulseItem, IgPulseReport } from "./types";

/** 같은 태그의 이전 측정과 비교할 최소 간격. 이보다 가까우면 하루 안의 시간대 차이만 보게 된다. */
export const MIN_COMPARE_GAP_HOURS = 20;

export type PulseComparison =
  | { kind: "change"; changePct: number; previous: { perHour: number; collectedAt: string } }
  | { kind: "baseline" }
  | { kind: "basis-mismatch"; previousAt: string };

const key = (tag: string) => tag.toLocaleLowerCase();

/** 최신 측정을 20시간 이상 이전의 가장 가까운 측정과 비교한다. 측정 방식(24시간 전체/최근 표본)이 다르면 비교하지 않는다. */
export function comparePulse(item: IgPulseItem, history: IgPulseReport[]): PulseComparison {
  const now = new Date(item.collectedAt).getTime();
  const previous = history.flatMap((report) => report.items)
    .filter((old) => key(old.tag) === key(item.tag) && old.found && old.perHour !== null && now - new Date(old.collectedAt).getTime() >= MIN_COMPARE_GAP_HOURS * 36e5)
    .sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime())[0];
  if (!previous || item.perHour === null) return { kind: "baseline" };
  if (previous.rateBasis !== item.rateBasis) return { kind: "basis-mismatch", previousAt: previous.collectedAt };
  const base = previous.perHour!;
  const changePct = base > 0 ? Math.round(((item.perHour - base) / base) * 1000) / 10 : item.perHour > 0 ? Infinity : 0;
  return { kind: "change", changePct, previous: { perHour: base, collectedAt: previous.collectedAt } };
}

/** 자동으로 추적 목록에 넣을 최소 게시 속도(시간당). 거의 쓰이지 않는 태그로 목록이 차지 않게 한다. */
export const AUTO_TRACK_MIN_PER_HOUR = 1;

/** 다음 스캔의 추적 목록: 사용자가 고른 태그를 먼저 두고, 이번에 측정된 태그 중 활발한 것을 활동량 순으로 채운다. */
export function nextTrackList(current: string[], report: IgPulseReport, limit = 10) {
  const measured = report.items.filter((item) => item.found && (item.perHour ?? 0) >= AUTO_TRACK_MIN_PER_HOUR).sort((a, b) => (b.perHour ?? 0) - (a.perHour ?? 0)).map((item) => item.tag);
  const seen = new Set<string>();
  return [...current, ...measured].filter((tag) => { const k = key(tag); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
}

/** 보드에 함께 보여줄 범위: 가장 최근 스캔 기준 24시간 안의 스캔들 */
export const BOARD_WINDOW_HOURS = 24;
export type DismissedTag = { tag: string; at: string };

/**
 * 최근 스캔들을 합쳐 태그별 가장 최근 측정을 보여준다. 추적 태그만 다시 재도 앞서 웹 검색으로 찾은 후보가 남는다.
 * 사용자가 추적에서 뺀 태그는 뺀 시각 이전의 측정을 숨긴다(이후 웹 검색이 다시 찾으면 다시 보인다).
 */
export function boardItems(reports: IgPulseReport[], dismissed: DismissedTag[]) {
  const newest = Math.max(...reports.map((report) => new Date(report.generatedAt).getTime()));
  const hiddenUntil = new Map(dismissed.map((entry) => [key(entry.tag), new Date(entry.at).getTime()]));
  const latest = new Map<string, IgPulseItem>();
  for (const report of reports) {
    if (newest - new Date(report.generatedAt).getTime() > BOARD_WINDOW_HOURS * 36e5) continue;
    for (const item of report.items) {
      const k = key(item.tag);
      if (!item.found || new Date(item.collectedAt).getTime() <= (hiddenUntil.get(k) ?? -Infinity)) continue;
      const seen = latest.get(k);
      if (!seen || new Date(item.collectedAt) > new Date(seen.collectedAt)) latest.set(k, item);
    }
  }
  return [...latest.values()].sort((a, b) => (b.perHour ?? -1) - (a.perHour ?? -1));
}
