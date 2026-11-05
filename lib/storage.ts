import type { CreativeRun } from "./creative-collision";
import { syncProjectSlideImages, type StudioProject } from "./content-production";
import type { DismissedTag } from "./ig-pulse-view";
import type { SavedItemTombstone, CultureRelationFeedback, CultureRelationRecord, CultureVersionRecord, IgPulseCandidate, IgPulseReport, InstagramManualSearchRecord, LiveAnalysisSnapshot, NowTrendReport, SavedCollision, SavedItem, SavedLabReview, WatchCandidate } from "./types";
import { isLiveTrendId, liveTrendId } from "./live-trend";
import { connectionContextOf, connectionPayloadOf, isPhenomenonPayload, phenomenonPayloadOf, type ConnectionRun, type DiscoveryReport, type SavedPhenomenonPayload } from "./discovery";
import type { TrendWebSession } from "./trend-web";

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

/** V4 P0: 브라우저 저장 실패(대부분 저장 공간 부족). 화면 공통 경고 막대가 받는다 — 저장 실패가 조용히 묻히지 않게. */
export const STORAGE_FAILED_EVENT = "trend-radar:storage-failed";
function write<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
    window.dispatchEvent(new Event(STORAGE_EVENT));
    return true;
  } catch {
    try { window.dispatchEvent(new CustomEvent(STORAGE_FAILED_EVENT, { detail: { key } })); } catch { /* 이벤트도 못 보내면 무시 */ }
    return false;
  }
}
/** 이 앱이 쓰는 브라우저 저장 공간(항목별 크기, 큰 순). 문자 수 × 2바이트로 어림한다(브라우저가 UTF-16으로 센다). */
export function storageUsage(): Array<{ key: string; bytes: number }> {
  if (typeof window === "undefined") return [];
  try {
    const rows: Array<{ key: string; bytes: number }> = [];
    for (let i = 0; i < localStorage.length; i += 1) { const key = localStorage.key(i); if (key?.startsWith("trend-radar")) rows.push({ key, bytes: (localStorage.getItem(key)?.length ?? 0) * 2 }); }
    return rows.sort((a, b) => b.bytes - a.bytes);
  } catch { return []; }
}

/*
 * 계정 격리: 로그인 중 저장했거나 클라우드에서 가져온 항목에는 ownerId(Supabase user id)를 붙인다.
 * 화면에는 소유자가 없는 로컬 항목과 현재 로그인 계정의 항목만 보인다. 다른 계정 항목은 지우지 않고 숨긴다.
 */
const OWNER_KEY = "trend-radar-session-owner";
export function getSessionOwner(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}
export function setSessionOwner(userId: string | null) {
  try {
    if (getSessionOwner() === userId) return;
    if (userId) localStorage.setItem(OWNER_KEY, userId); else localStorage.removeItem(OWNER_KEY);
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch { /* 저장소를 쓸 수 없으면 격리 없이 동작 */ }
}
const visibleTo = (owner: string | null) => (item: { ownerId?: string }) => !item.ownerId || item.ownerId === owner;
const sameSlot = (a: { ownerId?: string }, b: { ownerId?: string }) => (a.ownerId ?? null) === (b.ownerId ?? null);

export function getSavedItems(): SavedItem[] { return read<SavedItem>(KEY).filter(visibleTo(getSessionOwner())); }
export function getSavedItem(id: string) { return getSavedItems().find((item) => item.id === id) ?? null; }
export function saveItem(item: SavedItem) {
  const owned = { ...item, ownerId: item.ownerId ?? getSessionOwner() ?? undefined };
  // 다른 계정의 같은 ID 항목은 건드리지 않는다.
  return write(KEY, [owned, ...read<SavedItem>(KEY).filter((saved) => !(saved.id === owned.id && (sameSlot(saved, owned) || !saved.ownerId)))]);
}
export function removeItem(id: string) { const owner = getSessionOwner(); return write(KEY, read<SavedItem>(KEY).filter((item) => !(item.id === id && visibleTo(owner)(item)))); }

/** Workspace 삭제 기록. 다음 동기화에서 삭제한 항목이 다시 생기지 않게 한다. */
const SAVED_TOMBSTONE_KEY = "trend-radar-saved-tombstones";
export function getSavedTombstones(): SavedItemTombstone[] { return read<SavedItemTombstone>(SAVED_TOMBSTONE_KEY); }
export function addSavedTombstone(entry: SavedItemTombstone) { return write(SAVED_TOMBSTONE_KEY, [entry, ...getSavedTombstones().filter((item) => item.id !== entry.id)].slice(0, 500)); }
export function removeSavedTombstone(id: string) { return write(SAVED_TOMBSTONE_KEY, getSavedTombstones().filter((item) => item.id !== id)); }

/** 이전 버전은 LIVE 분석을 데모 트렌드 ID에 저장했다. 읽을 때 키워드 기반 LIVE ID로 옮긴다. */
function normalizeSnapshot(item: LiveAnalysisSnapshot): LiveAnalysisSnapshot {
  return isLiveTrendId(item.trendId) ? item : { ...item, trendId: liveTrendId(item.trendName) };
}

export function getLiveAnalyses(): LiveAnalysisSnapshot[] {
  const seen = new Set<string>();
  const owner = getSessionOwner();
  return read<LiveAnalysisSnapshot>(LIVE_KEY).map(normalizeSnapshot).filter(visibleTo(owner)).filter((item) => !seen.has(item.trendId) && Boolean(seen.add(item.trendId)));
}

export function getLiveAnalysis(trendId: string) { return getLiveAnalyses().find((item) => item.trendId === trendId) ?? null; }

export function saveLiveAnalysis(snapshot: LiveAnalysisSnapshot) {
  const normalized = { ...normalizeSnapshot(snapshot), ownerId: snapshot.ownerId ?? getSessionOwner() ?? undefined };
  // 같은 트렌드라도 다른 계정의 분석은 지우지 않는다. 현재 보이는 같은 트렌드 분석만 교체한다.
  const owner = getSessionOwner();
  return write(LIVE_KEY, [normalized, ...read<LiveAnalysisSnapshot>(LIVE_KEY).map(normalizeSnapshot).filter((item) => !(item.trendId === normalized.trendId && visibleTo(owner)(item)))]);
}

export function updateLiveAnalysis(trendId: string, patch: Partial<LiveAnalysisSnapshot>) {
  const owner = getSessionOwner();
  // 숨겨진 다른 계정 항목까지 보존하도록 전체 목록을 다시 쓴다.
  return write(LIVE_KEY, read<LiveAnalysisSnapshot>(LIVE_KEY).map(normalizeSnapshot).map((item) => item.trendId === trendId && visibleTo(owner)(item) ? { ...item, ...patch } : item));
}

export function removeLiveAnalysis(trendId: string) { const owner = getSessionOwner(); return write(LIVE_KEY, read<LiveAnalysisSnapshot>(LIVE_KEY).map(normalizeSnapshot).filter((item) => !(item.trendId === trendId && visibleTo(owner)(item)))); }

/** V4.5 Creative Collision 실행 기록(생성 아이디어·선택·콘셉트 이미지). 계정별로 보이고, 다른 계정 기록은 지우지 않는다. */
const CREATIVE_KEY = "trend-radar-creative-collisions";
type OwnedCreativeRun = CreativeRun & { ownerId?: string };
export function getCreativeRuns(): CreativeRun[] { return read<OwnedCreativeRun>(CREATIVE_KEY).filter(visibleTo(getSessionOwner())).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
export function saveCreativeRun(run: CreativeRun) {
  const owner = getSessionOwner();
  const all = read<OwnedCreativeRun>(CREATIVE_KEY);
  const prev = all.find((item) => item.id === run.id && visibleTo(owner)(item));
  const next: OwnedCreativeRun = { ...run, ownerId: prev?.ownerId ?? owner ?? undefined };
  // 같은 ID는 갱신, 나머지(다른 계정 포함)는 그대로 둔다. 최대 40개(이미지 포함 용량 보호).
  return write(CREATIVE_KEY, [next, ...all.filter((item) => !(item.id === run.id && visibleTo(owner)(item)))].slice(0, 40));
}
export function removeCreativeRun(id: string) { const owner = getSessionOwner(); return write(CREATIVE_KEY, read<OwnedCreativeRun>(CREATIVE_KEY).filter((item) => !(item.id === id && visibleTo(owner)(item)))); }

/** C3 Content Studio 제작 프로젝트(카드뉴스·숏폼). 수정할 때마다 저장해 새로고침 후에도 이어서 작업한다. */
const STUDIO_PROJECT_KEY = "trend-radar-studio-projects";
type OwnedStudioProject = StudioProject & { ownerId?: string };
export function getStudioProjects(): StudioProject[] { return read<OwnedStudioProject>(STUDIO_PROJECT_KEY).filter(visibleTo(getSessionOwner())).map((project) => syncProjectSlideImages(project)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
export function getStudioProject(id: string) { return getStudioProjects().find((item) => item.id === id) ?? null; }
export function saveStudioProject(project: StudioProject) {
  const owner = getSessionOwner();
  const all = read<OwnedStudioProject>(STUDIO_PROJECT_KEY);
  const prev = all.find((item) => item.id === project.id && visibleTo(owner)(item));
  const normalized = syncProjectSlideImages(project);
  return write(STUDIO_PROJECT_KEY, [{ ...normalized, ownerId: prev?.ownerId ?? owner ?? undefined }, ...all.filter((item) => !(item.id === project.id && visibleTo(owner)(item)))].slice(0, 40));
}

/** 브라우저 저장 공간(localStorage)이 꽉 차 저장하지 못한 Collision을 이 탭에만 임시로 둔다(탭을 닫으면 사라짐). */
const SESSION_COLLISION_KEY = "trend-radar-collisions-tab";
function readTab<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try { const value = JSON.parse(sessionStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? value as T[] : []; }
  catch { return []; }
}
export function getCollisions(): SavedCollision[] {
  const saved = read<SavedCollision>(COLLISION_KEY);
  const tabOnly = readTab<SavedCollision>(SESSION_COLLISION_KEY).filter((item) => !saved.some((other) => other.id === item.id));
  return [...tabOnly, ...saved].filter(visibleTo(getSessionOwner()));
}
/** 저장 위치: "local"(이 브라우저) · "tab"(공간 부족 → 이 탭에만 임시) · false(둘 다 실패). */
export function saveCollision(item: SavedCollision): "local" | "tab" | false {
  const owner = getSessionOwner();
  const owned = { ...item, ownerId: item.ownerId ?? owner ?? undefined };
  // 다른 계정의 Collision은 지우지 않는다(목록 상한은 이 계정에서 보이는 것만 센다).
  const all = read<SavedCollision>(COLLISION_KEY).filter((saved) => saved.id !== owned.id);
  const mine = all.filter(visibleTo(owner)).slice(0, 29), others = all.filter((saved) => !visibleTo(owner)(saved));
  if (write(COLLISION_KEY, [owned, ...mine, ...others])) return "local";
  try {
    sessionStorage.setItem(SESSION_COLLISION_KEY, JSON.stringify([owned, ...readTab<SavedCollision>(SESSION_COLLISION_KEY).filter((saved) => saved.id !== owned.id)].slice(0, 10)));
    window.dispatchEvent(new Event(STORAGE_EVENT));
    return "tab";
  } catch { return false; }
}
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

/* T4: 세부 현상 발견 결과(최근 20개). 계정 격리는 다른 저장 항목과 같은 규칙. 현상 저장은 Workspace(saveItem)로 한다. */
const DISCOVERY_KEY = "trend-radar-discoveries";
const CONNECTION_RUNS_KEY = "trend-radar-connection-runs";
const TREND_WEB_KEY = "trend-radar-trend-web-sessions";
/** T8: 두 키워드 연결 결과(최근 10개). */
export function getConnectionRuns(): ConnectionRun[] { return read<ConnectionRun>(CONNECTION_RUNS_KEY).filter(visibleTo(getSessionOwner())).sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt)); }
export function saveConnectionRun(run: ConnectionRun) {
  const item = { ...run, ownerId: run.ownerId ?? getSessionOwner() ?? undefined };
  return write(CONNECTION_RUNS_KEY, [item, ...read<ConnectionRun>(CONNECTION_RUNS_KEY).filter((saved) => saved.id !== item.id)].slice(0, 10));
}
export function getDiscoveryReports(): DiscoveryReport[] { return read<DiscoveryReport>(DISCOVERY_KEY).filter(visibleTo(getSessionOwner())).sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt)); }
export function saveDiscoveryReport(report: DiscoveryReport) {
  const item = { ...report, ownerId: report.ownerId ?? getSessionOwner() ?? undefined };
  return write(DISCOVERY_KEY, [item, ...read<DiscoveryReport>(DISCOVERY_KEY).filter((saved) => saved.id !== item.id)].slice(0, 20));
}
/** W9: 그래프·두 노드 선택·선택 연결을 브라우저에서 복원한다. Workspace 저장은 SavedItem으로 별도 동기화한다. */
export function getTrendWebSessions(): TrendWebSession[] { return read<TrendWebSession>(TREND_WEB_KEY).filter(visibleTo(getSessionOwner())).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
export function saveTrendWebSession(session: TrendWebSession) {
  const item = { ...session, selectedNodeIds: [...new Set(session.selectedNodeIds)].slice(0, 2), ownerId: session.ownerId ?? getSessionOwner() ?? undefined };
  return write(TREND_WEB_KEY, [item, ...read<TrendWebSession>(TREND_WEB_KEY).filter((saved) => !(saved.id === item.id && visibleTo(getSessionOwner())(saved)))].slice(0, 20));
}
/** Workspace에 저장한 현상 또는 저장된 발견 결과에서 현상을 찾는다(WHY·Studio 진입용). */
export function findPhenomenon(phenomenonId: string): SavedPhenomenonPayload | null {
  const saved = getSavedItems().map((item) => item.payload).find((payload): payload is SavedPhenomenonPayload => isPhenomenonPayload(payload) && payload.context.phenomenonId === phenomenonId);
  if (saved) return saved;
  if (phenomenonId.startsWith("conn-")) {
    const runId = phenomenonId.slice(5).split("~")[0];
    const run = getConnectionRuns().find((item) => item.id === runId);
    const connection = run?.connections.find((item) => connectionContextOf(run, item).phenomenonId === phenomenonId);
    return run && connection ? connectionPayloadOf(run, connection) : null;
  }
  const [reportId, signalId] = phenomenonId.split("~");
  const report = getDiscoveryReports().find((item) => item.id === reportId);
  const signal = report?.signals.find((item) => item.signalId === signalId);
  return report && signal ? phenomenonPayloadOf(report, signal) : null;
}

const IG_PULSE_KEY = "trend-radar-ig-pulse";
const IG_TRACK_KEY = "trend-radar-ig-track";
const IG_QUOTA_AUDIT_KEY = "trend-radar-ig-quota-audit";
const IG_MANUAL_SEARCH_KEY = "trend-radar-ig-manual-searches";
export const IG_PULSE_RETENTION = 90;
export type IgQuotaAuditEntry = { tag: string; hashtagId?: string | null; searchedAt: string; releaseAt: string; source: "pulse" | "manual" };
type OwnedTag = { tag: string; ownerId?: string };
type OwnedDismissedTag = DismissedTag & { ownerId?: string };
const ownedVisible = (owner: string | null) => (item: { ownerId?: string }) => owner ? item.ownerId === owner : !item.ownerId;
const stableHash = (value: string) => { let hash = 0x811c9dc5; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193); } return (hash >>> 0).toString(16).padStart(8, "0"); };
export const igPulseReportId = (report: Pick<IgPulseReport, "generatedAt" | "items">) => `pulse-${stableHash(`${report.generatedAt}|${report.items.map((item) => item.tag.toLocaleLowerCase()).sort().join(",")}`)}`;
/** 전일 대비 비교를 위해 최근 측정을 보관한다(최신순). */
export function getIgPulseReports(): IgPulseReport[] { return read<IgPulseReport>(IG_PULSE_KEY).filter(ownedVisible(getSessionOwner())).sort((a,b)=>new Date(b.generatedAt).getTime()-new Date(a.generatedAt).getTime()); }
export function saveIgPulseReports(reports: IgPulseReport[]) {
  const owner = getSessionOwner();
  const otherAccounts = read<IgPulseReport>(IG_PULSE_KEY).filter((item) => !ownedVisible(owner)(item));
  const mine = reports.map((report) => ({ ...report, id: report.id ?? igPulseReportId(report), ownerId: owner ?? undefined })).sort((a,b)=>new Date(b.generatedAt).getTime()-new Date(a.generatedAt).getTime()).slice(0, IG_PULSE_RETENTION);
  return write(IG_PULSE_KEY, [...mine, ...otherAccounts]);
}
export function saveIgPulseReport(report: IgPulseReport) {
  const next = { ...report, id: report.id ?? igPulseReportId(report), ownerId: report.ownerId ?? getSessionOwner() ?? undefined };
  const saved = saveIgPulseReports([next, ...getIgPulseReports().filter((item) => (item.id ?? igPulseReportId(item)) !== next.id && item.generatedAt !== next.generatedAt)]);
  report.items.filter((item) => item.usedQuota).forEach((item) => recordIgQuotaUse({ tag: item.tag, hashtagId: item.hashtagId, searchedAt: item.collectedAt, source: "pulse" }));
  return saved;
}
/** 다음 스캔에서 다시 측정할 해시태그. 이미 조회한 태그라 주간 한도를 쓰지 않는다. */
export function getIgTrackedTags(): string[] {
  const owner = getSessionOwner();
  return read<string | OwnedTag>(IG_TRACK_KEY).flatMap((item) => typeof item === "string" ? (!owner ? [item] : []) : ownedVisible(owner)(item) ? [item.tag] : []);
}
export function saveIgTrackedTags(tags: string[]) {
  const owner = getSessionOwner();
  const all = read<string | OwnedTag>(IG_TRACK_KEY);
  const others = all.filter((item) => typeof item === "string" ? Boolean(owner) : !ownedVisible(owner)(item));
  const mine: Array<string | OwnedTag> = [...new Set(tags)].slice(0, 10).map((tag) => owner ? { tag, ownerId: owner } : tag);
  return write(IG_TRACK_KEY, [...mine, ...others]);
}
export function getIgQuotaAudit(): IgQuotaAuditEntry[] { return read<IgQuotaAuditEntry>(IG_QUOTA_AUDIT_KEY); }
export function recordIgQuotaUse(entry: Omit<IgQuotaAuditEntry, "releaseAt">) {
  const key = entry.tag.toLocaleLowerCase();
  const releaseAt = new Date(new Date(entry.searchedAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return write(IG_QUOTA_AUDIT_KEY, [{ ...entry, releaseAt }, ...getIgQuotaAudit().filter((item) => item.tag.toLocaleLowerCase() !== key)].slice(0, 60));
}
const IG_QUEUE_KEY = "trend-radar-ig-queue";
/** 다음 RESCAN 대기열: 한도 때문에 아직 재지 못한 신규 후보(측정값이 아니다). 계정별로 나눈다. */
export type IgQueuedCandidate = IgPulseCandidate & { queuedAt: string; reason: string };
export function getIgQueue(): IgQueuedCandidate[] { return read<IgQueuedCandidate & { ownerId?: string }>(IG_QUEUE_KEY).filter(ownedVisible(getSessionOwner())); }
export function saveIgQueue(items: IgQueuedCandidate[]) { const owner=getSessionOwner();const others=read<IgQueuedCandidate & { ownerId?: string }>(IG_QUEUE_KEY).filter((item)=>!ownedVisible(owner)(item));return write(IG_QUEUE_KEY,[...items.slice(0,20).map((item)=>({...item,ownerId:owner??undefined})),...others]); }
const IG_DISMISSED_KEY = "trend-radar-ig-dismissed";
/** 추적에서 뺀 태그와 뺀 시각. 그 이전 측정은 보드에서 숨긴다. */
export function getIgDismissed(): DismissedTag[] { const owner=getSessionOwner();return read<OwnedDismissedTag>(IG_DISMISSED_KEY).filter(ownedVisible(owner)).map(({tag,at})=>({tag,at})); }
export function saveIgDismissed(items: DismissedTag[]) { const owner=getSessionOwner();const others=read<OwnedDismissedTag>(IG_DISMISSED_KEY).filter((item)=>!ownedVisible(owner)(item));return write(IG_DISMISSED_KEY,[...items.slice(0,50).map((item)=>({...item,ownerId:owner??undefined})),...others]); }

export function getInstagramManualSearches(): InstagramManualSearchRecord[] { return read<InstagramManualSearchRecord>(IG_MANUAL_SEARCH_KEY).filter(ownedVisible(getSessionOwner())).sort((a,b)=>new Date(b.collectedAt).getTime()-new Date(a.collectedAt).getTime()); }
export function saveInstagramManualSearch(record: InstagramManualSearchRecord) { const owner=getSessionOwner();const next={...record,ownerId:record.ownerId??owner??undefined};const others=read<InstagramManualSearchRecord>(IG_MANUAL_SEARCH_KEY).filter((item)=>!ownedVisible(owner)(item));return write(IG_MANUAL_SEARCH_KEY,[next,...getInstagramManualSearches().filter((item)=>item.id!==next.id),...others].slice(0,200)); }

/** First signed-in account claims legacy unowned Instagram data locally; nothing is uploaded or deleted. */
export function claimLegacyInstagramData(userId: string) {
  try {
    const reports=read<IgPulseReport>(IG_PULSE_KEY).map((item)=>item.ownerId?item:{...item,ownerId:userId,id:item.id??igPulseReportId(item)});
    const tags=read<string|OwnedTag>(IG_TRACK_KEY).map((item)=>typeof item==="string"?{tag:item,ownerId:userId}:item);
    const dismissed=read<OwnedDismissedTag>(IG_DISMISSED_KEY).map((item)=>item.ownerId?item:{...item,ownerId:userId});
    const manual=read<InstagramManualSearchRecord>(IG_MANUAL_SEARCH_KEY).map((item)=>item.ownerId?item:{...item,ownerId:userId});
    localStorage.setItem(IG_PULSE_KEY,JSON.stringify(reports));localStorage.setItem(IG_TRACK_KEY,JSON.stringify(tags));localStorage.setItem(IG_DISMISSED_KEY,JSON.stringify(dismissed));localStorage.setItem(IG_MANUAL_SEARCH_KEY,JSON.stringify(manual));window.dispatchEvent(new Event(STORAGE_EVENT));return true;
  } catch { return false; }
}

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
  const keys = [KEY, LIVE_KEY, COLLISION_KEY, LAB_KEY, WATCH_KEY, NOW_KEY, IG_PULSE_KEY, IG_TRACK_KEY, IG_QUEUE_KEY, IG_QUOTA_AUDIT_KEY, IG_DISMISSED_KEY, IG_MANUAL_SEARCH_KEY, CULTURE_VERSIONS_KEY, CULTURE_RELATIONS_KEY, RELATION_FEEDBACK_KEY, SAVED_TOMBSTONE_KEY, CREATIVE_KEY, STUDIO_PROJECT_KEY, DISCOVERY_KEY, CONNECTION_RUNS_KEY, TREND_WEB_KEY];
  try {
    keys.forEach((key) => localStorage.removeItem(key));
    window.dispatchEvent(new Event(STORAGE_EVENT));
    return true;
  } catch { return false; }
}
