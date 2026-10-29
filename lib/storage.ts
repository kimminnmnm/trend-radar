import type { DismissedTag } from "./ig-pulse-view";
import type { IgPulseReport, LiveAnalysisSnapshot, NowTrendReport, SavedCollision, SavedItem, SavedLabReview, WatchCandidate } from "./types";
import { isLiveTrendId, liveTrendId } from "./live-trend";

const KEY = "trend-radar-workspace";
const LIVE_KEY = "trend-radar-live-analyses";
const COLLISION_KEY = "trend-radar-collisions";
const LAB_KEY = "trend-radar-lab-reviews";
const WATCH_KEY = "trend-radar-watchlist";
export const STORAGE_EVENT = "trend-radar:storage";

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try { const value = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? value as T[] : []; }
  catch { return []; }
}

function write<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
    window.dispatchEvent(new Event(STORAGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function getSavedItems(): SavedItem[] { return read<SavedItem>(KEY); }
export function getSavedItem(id: string) { return getSavedItems().find((item) => item.id === id) ?? null; }
export function saveItem(item: SavedItem) { return write(KEY, [item, ...getSavedItems().filter((saved) => saved.id !== item.id)]); }
export function removeItem(id: string) { return write(KEY, getSavedItems().filter((item) => item.id !== id)); }

/** 이전 버전은 LIVE 분석을 데모 트렌드 ID에 저장했다. 읽을 때 키워드 기반 LIVE ID로 옮긴다. */
function normalizeSnapshot(item: LiveAnalysisSnapshot): LiveAnalysisSnapshot {
  return isLiveTrendId(item.trendId) ? item : { ...item, trendId: liveTrendId(item.trendName) };
}

export function getLiveAnalyses(): LiveAnalysisSnapshot[] {
  const seen = new Set<string>();
  return read<LiveAnalysisSnapshot>(LIVE_KEY).map(normalizeSnapshot).filter((item) => !seen.has(item.trendId) && Boolean(seen.add(item.trendId)));
}

export function getLiveAnalysis(trendId: string) { return getLiveAnalyses().find((item) => item.trendId === trendId) ?? null; }

export function saveLiveAnalysis(snapshot: LiveAnalysisSnapshot) {
  const normalized = normalizeSnapshot(snapshot);
  return write(LIVE_KEY, [normalized, ...getLiveAnalyses().filter((item) => item.trendId !== normalized.trendId)]);
}

export function updateLiveAnalysis(trendId: string, patch: Partial<LiveAnalysisSnapshot>) {
  return write(LIVE_KEY, getLiveAnalyses().map((item) => item.trendId === trendId ? { ...item, ...patch } : item));
}

export function removeLiveAnalysis(trendId: string) { return write(LIVE_KEY, getLiveAnalyses().filter((item) => item.trendId !== trendId)); }

export function getCollisions(): SavedCollision[] { return read<SavedCollision>(COLLISION_KEY); }
export function saveCollision(item: SavedCollision) { return write(COLLISION_KEY, [item, ...getCollisions().filter((saved) => saved.id !== item.id)].slice(0, 30)); }
export function removeCollision(id: string) { return write(COLLISION_KEY, getCollisions().filter((item) => item.id !== id)); }

export function getLabReviews(): SavedLabReview[] { return read<SavedLabReview>(LAB_KEY); }
export function saveLabReview(item: SavedLabReview) { return write(LAB_KEY, [item, ...getLabReviews().filter((saved) => saved.id !== item.id)].slice(0, 30)); }

export function getWatchlist(): WatchCandidate[] { return read<WatchCandidate>(WATCH_KEY); }
export function saveWatchlist(items: WatchCandidate[]) { return write(WATCH_KEY, items.slice(0, 50)); }

const NOW_KEY = "trend-radar-now-2030";
export function getNowReports(): NowTrendReport[] { return read<NowTrendReport>(NOW_KEY); }
export function saveNowReport(report: NowTrendReport) { return write(NOW_KEY, [report, ...getNowReports()].slice(0, 5)); }

const IG_PULSE_KEY = "trend-radar-ig-pulse";
const IG_TRACK_KEY = "trend-radar-ig-track";
/** 전일 대비 비교를 위해 최근 측정을 보관한다(최신순). */
export function getIgPulseReports(): IgPulseReport[] { return read<IgPulseReport>(IG_PULSE_KEY); }
export function saveIgPulseReport(report: IgPulseReport) { return write(IG_PULSE_KEY, [report, ...getIgPulseReports()].slice(0, 30)); }
/** 다음 스캔에서 다시 측정할 해시태그. 이미 조회한 태그라 주간 한도를 쓰지 않는다. */
export function getIgTrackedTags(): string[] { return read<string>(IG_TRACK_KEY); }
export function saveIgTrackedTags(tags: string[]) { return write(IG_TRACK_KEY, [...new Set(tags)].slice(0, 10)); }
const IG_DISMISSED_KEY = "trend-radar-ig-dismissed";
/** 추적에서 뺀 태그와 뺀 시각. 그 이전 측정은 보드에서 숨긴다. */
export function getIgDismissed(): DismissedTag[] { return read<DismissedTag>(IG_DISMISSED_KEY); }
export function saveIgDismissed(items: DismissedTag[]) { return write(IG_DISMISSED_KEY, items.slice(0, 50)); }
