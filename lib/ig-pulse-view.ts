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
