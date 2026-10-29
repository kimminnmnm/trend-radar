import type { DismissedTag } from "./ig-pulse-view";
import type { CultureRelationFeedback, CultureRelationRecord, CultureVersionRecord, IgPulseReport, LiveAnalysisSnapshot, NowTrendReport, SavedCollision, SavedItem, SavedLabReview, WatchCandidate } from "./types";
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
export function saveNowReport(report: NowTrendReport) {
  const previous = getNowReports().filter((item) => item.generatedAt !== report.generatedAt);
  return write(NOW_KEY, [report, ...previous].slice(0, 5));
}

const IG_PULSE_KEY = "trend-radar-ig-pulse";
const IG_TRACK_KEY = "trend-radar-ig-track";
const IG_QUOTA_AUDIT_KEY = "trend-radar-ig-quota-audit";
export type IgQuotaAuditEntry = { tag: string; hashtagId?: string | null; searchedAt: string; releaseAt: string; source: "pulse" | "manual" };
/** 전일 대비 비교를 위해 최근 측정을 보관한다(최신순). */
export function getIgPulseReports(): IgPulseReport[] { return read<IgPulseReport>(IG_PULSE_KEY); }
export function saveIgPulseReport(report: IgPulseReport) {
  const saved = write(IG_PULSE_KEY, [report, ...getIgPulseReports()].slice(0, 30));
  report.items.filter((item) => item.usedQuota).forEach((item) => recordIgQuotaUse({ tag: item.tag, hashtagId: item.hashtagId, searchedAt: item.collectedAt, source: "pulse" }));
  return saved;
}
/** 다음 스캔에서 다시 측정할 해시태그. 이미 조회한 태그라 주간 한도를 쓰지 않는다. */
export function getIgTrackedTags(): string[] { return read<string>(IG_TRACK_KEY); }
export function saveIgTrackedTags(tags: string[]) { return write(IG_TRACK_KEY, [...new Set(tags)].slice(0, 10)); }
export function getIgQuotaAudit(): IgQuotaAuditEntry[] { return read<IgQuotaAuditEntry>(IG_QUOTA_AUDIT_KEY); }
export function recordIgQuotaUse(entry: Omit<IgQuotaAuditEntry, "releaseAt">) {
  const key = entry.tag.toLocaleLowerCase();
  const releaseAt = new Date(new Date(entry.searchedAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return write(IG_QUOTA_AUDIT_KEY, [{ ...entry, releaseAt }, ...getIgQuotaAudit().filter((item) => item.tag.toLocaleLowerCase() !== key)].slice(0, 60));
}
const IG_DISMISSED_KEY = "trend-radar-ig-dismissed";
/** 추적에서 뺀 태그와 뺀 시각. 그 이전 측정은 보드에서 숨긴다. */
export function getIgDismissed(): DismissedTag[] { return read<DismissedTag>(IG_DISMISSED_KEY); }
export function saveIgDismissed(items: DismissedTag[]) { return write(IG_DISMISSED_KEY, items.slice(0, 50)); }

const ONBOARDING_KEY = "trend-radar-onboarded";
/** 첫 방문 안내를 닫았는지. 배열 저장소가 아니므로 직접 읽고 쓴다. */
export function getOnboardingDone(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(ONBOARDING_KEY) === "1"; } catch { return false; }
}
export function setOnboardingDone(done: boolean) {
  try {
    if (done) localStorage.setItem(ONBOARDING_KEY, "1"); else localStorage.removeItem(ONBOARDING_KEY);
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch { /* 저장소를 쓸 수 없으면 이번 화면에서만 닫힌다. */ }
}

/** 공용 PC 로그아웃용: 이 브라우저에 저장된 분석·기획 데이터를 지운다(첫 방문 안내 상태는 유지). 클라우드 데이터는 지우지 않는다. */
/** Culture Map 원장: DNA 메타데이터 버전 이력과 계산된 관계. 재분석해도 이전 버전을 지우지 않는다. */
const CULTURE_VERSIONS_KEY = "trend-radar-culture-versions";
const CULTURE_RELATIONS_KEY = "trend-radar-culture-relations";
export function getCultureVersions(): CultureVersionRecord[] { return read<CultureVersionRecord>(CULTURE_VERSIONS_KEY); }
export function getCultureRelations(): CultureRelationRecord[] { return read<CultureRelationRecord>(CULTURE_RELATIONS_KEY); }
export function saveCultureLedger(versions: CultureVersionRecord[], relations: CultureRelationRecord[]) {
  try {
    localStorage.setItem(CULTURE_VERSIONS_KEY, JSON.stringify(versions));
    localStorage.setItem(CULTURE_RELATIONS_KEY, JSON.stringify(relations));
    window.dispatchEvent(new Event(STORAGE_EVENT));
    return true;
  } catch { return false; }
}

const RELATION_FEEDBACK_KEY = "trend-radar-culture-relation-feedback";
export function getRelationFeedback(): CultureRelationFeedback[] { return read<CultureRelationFeedback>(RELATION_FEEDBACK_KEY); }
export function saveRelationFeedback(item: CultureRelationFeedback) {
  return write(RELATION_FEEDBACK_KEY, [item, ...getRelationFeedback().filter((saved) => saved.pair !== item.pair)].slice(0, 300));
}

export function clearLocalAnalysisData() {
  const keys = [KEY, LIVE_KEY, COLLISION_KEY, LAB_KEY, WATCH_KEY, NOW_KEY, IG_PULSE_KEY, IG_TRACK_KEY, IG_QUOTA_AUDIT_KEY, IG_DISMISSED_KEY, CULTURE_VERSIONS_KEY, CULTURE_RELATIONS_KEY, RELATION_FEEDBACK_KEY];
  try {
    keys.forEach((key) => localStorage.removeItem(key));
    window.dispatchEvent(new Event(STORAGE_EVENT));
    return true;
  } catch { return false; }
}
