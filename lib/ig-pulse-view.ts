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

/** 이 시간보다 오래된 측정은 보드에서 "N시간 전 측정"으로 표시한다. */
export const BOARD_WINDOW_HOURS = 24;
/**
 * 보드에 남기는 기간: 각 태그의 가장 최근 측정이 이 기간 안이면 보드에 남긴다.
 * (이전에는 "가장 최근 스캔 기준 24시간"이라 결과가 0개인 RESCAN 한 번에 전날 측정이 모두 화면에서 사라졌다.)
 */
export const BOARD_KEEP_DAYS = 7;

/**
 * 과거 보고서에서 측정된 적이 있지만 지금 추적 목록에 없는 태그(복구 후보). 자동으로 추적에 넣지 않는다 — 사용자가 직접 고른다.
 * 사용자가 추적에서 뺀(dismissed) 태그는 뺀 이후 다시 측정되지 않았다면 후보에서 제외한다.
 */
export function restorableTags(reports: IgPulseReport[], tracked: string[], dismissed: DismissedTag[]) {
  const trackedKeys = new Set(tracked.map(key));
  const hiddenUntil = new Map(dismissed.map((entry) => [key(entry.tag), new Date(entry.at).getTime()]));
  const latest = new Map<string, IgPulseItem>();
  for (const item of reports.flatMap((report) => report.items)) {
    const k = key(item.tag);
    if (!item.found || trackedKeys.has(k) || new Date(item.collectedAt).getTime() <= (hiddenUntil.get(k) ?? -Infinity)) continue;
    const seen = latest.get(k);
    if (!seen || new Date(item.collectedAt) > new Date(seen.collectedAt)) latest.set(k, item);
  }
  return [...latest.values()].sort((a, b) => (b.perHour ?? -1) - (a.perHour ?? -1));
}
export type DismissedTag = { tag: string; at: string };

/**
 * 최근 스캔들을 합쳐 태그별 가장 최근 측정을 보여준다. 추적 태그만 다시 재도 앞서 웹 검색으로 찾은 후보가 남는다.
 * 사용자가 추적에서 뺀 태그는 뺀 시각 이전의 측정을 숨긴다(이후 웹 검색이 다시 찾으면 다시 보인다).
 */
export function boardItems(reports: IgPulseReport[], dismissed: DismissedTag[]) {
  // 기준은 "실제로 무언가를 측정한" 가장 최근 시각. 빈 스캔이나 실패한 스캔이 기준을 앞당겨 과거 측정을 밀어내지 않게 한다.
  const measuredTimes = reports.flatMap((report) => report.items.filter((item) => item.found).map((item) => new Date(item.collectedAt).getTime()));
  const newest = measuredTimes.length ? Math.max(...measuredTimes) : 0;
  const hiddenUntil = new Map(dismissed.map((entry) => [key(entry.tag), new Date(entry.at).getTime()]));
  const latest = new Map<string, IgPulseItem>();
  for (const report of reports) {
    if (newest - new Date(report.generatedAt).getTime() > BOARD_KEEP_DAYS * 24 * 36e5) continue;
    for (const item of report.items) {
      const k = key(item.tag);
      if (!item.found || new Date(item.collectedAt).getTime() <= (hiddenUntil.get(k) ?? -Infinity)) continue;
      const seen = latest.get(k);
      if (!seen || new Date(item.collectedAt) > new Date(seen.collectedAt)) latest.set(k, item);
    }
  }
  return [...latest.values()].sort((a, b) => (b.perHour ?? -1) - (a.perHour ?? -1));
}

/* ---------- 2026-11 RESCAN 재설계: 기본 차트는 최신 스캔 결과만 ---------- */

const byNewest = (a: IgPulseReport, b: IgPulseReport) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();

/**
 * 차트에 쓸 보고서: 가장 최근에 실제로 측정된(Instagram에서 확인된 태그가 있는) 스캔.
 * 최신 스캔에서 확인된 태그가 0개면(후보 없음·측정 실패) 그 이전 측정을 쓰고 previous로 표시한다 — 과거 측정을 최신처럼 섞지 않는다.
 */
export function chartSource(reports: IgPulseReport[]) {
  const sorted = [...reports].sort(byNewest);
  const measured = sorted.find((report) => report.items.some((item) => item.found));
  return measured ? { report: measured, previous: measured !== sorted[0], latest: sorted[0] } : null;
}

/** 그 스캔에서 확인된 태그(시간당 게시물 순). 사용자가 추적에서 뺀 태그는 뺀 시각 이전 측정을 숨긴다. */
export function chartItems(report: IgPulseReport, dismissed: DismissedTag[]) {
  const hiddenUntil = new Map(dismissed.map((entry) => [key(entry.tag), new Date(entry.at).getTime()]));
  return report.items.filter((item) => item.found && new Date(item.collectedAt).getTime() > (hiddenUntil.get(key(item.tag)) ?? -Infinity)).sort((a, b) => (b.perHour ?? -1) - (a.perHour ?? -1));
}

export type RisingRow = { item: IgPulseItem; comparison: Extract<PulseComparison, { kind: "change" }> | { kind: "new" } };
/**
 * 오르는 순: 비교 가능한 이전 측정이 있으면 변화율(높은 순), 이전에 한 번도 확인된 적 없는 태그는 NEW(상승률을 만들지 않음, 게시 속도 순).
 * 이전 측정은 있지만 비교할 수 없는 태그(20시간 미만 간격·측정 방식 다름)는 waiting으로 따로 돌려준다.
 */
export function risingRows(items: IgPulseItem[], history: IgPulseReport[]) {
  const changes: RisingRow[] = [], fresh: RisingRow[] = [], waiting: IgPulseItem[] = [];
  for (const item of items) {
    const comparison = comparePulse(item, history);
    if (comparison.kind === "change") { changes.push({ item, comparison }); continue; }
    const before = history.some((report) => report.items.some((old) => key(old.tag) === key(item.tag) && old.found && new Date(old.collectedAt).getTime() < new Date(item.collectedAt).getTime()));
    if (before) waiting.push(item); else fresh.push({ item, comparison: { kind: "new" } });
  }
  changes.sort((a, b) => (b.comparison.kind === "change" && a.comparison.kind === "change" ? b.comparison.changePct - a.comparison.changePct : 0));
  return { ranked: [...changes, ...fresh], waiting };
}

/** 대기열 후보를 보관하는 기간. 웹 검색으로 찾은 화제는 금방 바뀐다. */
export const QUEUE_KEEP_DAYS = 7;
export type QueuedCandidate = { tag: string; keyword?: string; category?: string; summary?: string; sources?: Array<{ url: string; title?: string }>; queuedAt: string; reason: string };
/**
 * 다음 스캔 대기열: 이번에 한도 때문에 재지 못한 신규 후보를 더하고, 이번에 측정을 시도한 태그는 뺀다(중복 제거, 오래된 후보 제외).
 * 측정값을 만들지 않는다 — 후보 정보만 보관한다.
 */
export function nextQueue(previous: QueuedCandidate[], report: IgPulseReport, now = report.generatedAt) {
  const measured = new Set(report.items.map((item) => key(item.tag)));
  const cutoff = new Date(now).getTime() - QUEUE_KEEP_DAYS * 24 * 36e5;
  const merged = new Map<string, QueuedCandidate>();
  for (const item of previous) if (new Date(item.queuedAt).getTime() >= cutoff) merged.set(key(item.tag), item);
  for (const entry of report.deferred) {
    if (!entry.candidate) continue;
    const k = key(entry.tag);
    merged.set(k, { ...entry.candidate, tag: entry.tag, queuedAt: merged.get(k)?.queuedAt ?? now, reason: entry.reason });
  }
  return [...merged.values()].filter((item) => !measured.has(key(item.tag))).slice(0, 20);
}
