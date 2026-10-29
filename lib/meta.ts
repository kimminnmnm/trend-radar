import "server-only";

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v26.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const REQUIRED_HASHTAG_PERMISSIONS = ["pages_show_list", "instagram_basic", "pages_read_engagement"] as const;
const HASHTAG_CACHE_TTL_MS = 5 * 60 * 1000;
const HASHTAG_CACHE_MAX = 50;

type GraphErrorBody = { error?: { message?: string; type?: string; code?: number; error_subcode?: number } };
type PageRecord = { id: string; name: string; instagram_business_account?: { id: string; username?: string; name?: string } };
export type InstagramMedia = { id: string; caption?: string; media_type?: string; permalink?: string; timestamp?: string };
export type HashtagSearchResult = {
  source: "live_meta";
  query: string;
  hashtagId: string | null;
  collectedAt: string;
  recentMedia: InstagramMedia[];
  topMedia: InstagramMedia[];
  topMediaAvailable: boolean;
  warnings: string[];
  cache: { hit: boolean; ttlSeconds: number };
  metrics: { postCount: null; growthRate: null; reason: string };
};

const hashtagCache = new Map<string, { expiresAt: number; value: HashtagSearchResult }>();

export class MetaGraphError extends Error {
  constructor(message: string, public readonly code?: number, public readonly status = 502, public readonly reason = "META_GRAPH_ERROR") { super(message); }
}

function getToken() {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  if (!token) throw new MetaGraphError("META_ACCESS_TOKEN이 설정되지 않았습니다.", undefined, 503, "META_NOT_CONFIGURED");
  return token;
}

function getConfiguredIgUserId() { return process.env.META_IG_USER_ID?.trim() || null; }

async function graphFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new MetaGraphError(timedOut ? "Meta API 응답 시간이 초과됐습니다. 잠시 후 다시 시도하세요." : "Meta API에 연결할 수 없습니다.", undefined, 504, timedOut ? "META_TIMEOUT" : "META_NETWORK_ERROR");
  }
  const body = await response.json() as T & GraphErrorBody;
  if (!response.ok || body.error) {
    const detail = body.error;
    const message = detail?.message || "Meta Graph API 요청이 실패했습니다.";
    const reason = detail?.code === 190
      ? "META_TOKEN_EXPIRED"
      : detail?.code === 10 && message.includes("Instagram Public Content Access")
        ? "META_APPROVAL_PENDING"
        : response.status === 403 || detail?.code === 200 || detail?.code === 10
          ? "META_PERMISSION_ERROR"
          : detail?.code === 4 || detail?.code === 17 || detail?.code === 32 || detail?.code === 613
            ? "META_RATE_LIMITED"
            : "META_GRAPH_ERROR";
    const status = reason === "META_TOKEN_EXPIRED" ? 401 : reason === "META_APPROVAL_PENDING" || reason === "META_PERMISSION_ERROR" ? 403 : reason === "META_RATE_LIMITED" ? 429 : response.status;
    throw new MetaGraphError(message, detail?.code, status, reason);
  }
  return body;
}

export type MetaConnectionStatus = {
  configured: boolean;
  igUserConfigured: boolean;
  tokenValid: boolean;
  graphVersion: string;
  permissions: { granted: string[]; declined: string[]; requiredForHashtag: readonly string[]; missingForHashtag: string[] };
  pages: Array<{ id: string; name: string; instagramProfessional: null | { id: string; username?: string; name?: string } }>;
  token: { expiresAt?: string; dataAccessExpiresAt?: string; expiresSoon: boolean };
  publicContentAccess: { status: "pending" | "approved" | "unknown"; message: string };
  canAttemptHashtagSearch: boolean;
  requirements: string[];
  error?: { message: string; code?: number; reason: string };
};

export async function getMetaConnectionStatus(): Promise<MetaConnectionStatus> {
  const approvalSetting = process.env.META_PUBLIC_CONTENT_ACCESS?.trim();
  const publicContentStatus = approvalSetting === "approved" ? "approved" : approvalSetting === "pending" ? "pending" : "unknown";
  const base: MetaConnectionStatus = {
    configured: Boolean(process.env.META_ACCESS_TOKEN?.trim()),
    igUserConfigured: Boolean(getConfiguredIgUserId()),
    tokenValid: false,
    graphVersion: GRAPH_VERSION,
    permissions: { granted: [], declined: [], requiredForHashtag: REQUIRED_HASHTAG_PERMISSIONS, missingForHashtag: [...REQUIRED_HASHTAG_PERMISSIONS] },
    pages: [],
    token: { expiresSoon: false },
    publicContentAccess: {
      status: publicContentStatus,
      message: publicContentStatus === "approved" ? "Instagram Public Content Access 승인됨" : publicContentStatus === "pending" ? "Meta API 승인 대기 중" : "실제 해시태그 요청으로 접근 권한을 확인합니다.",
    },
    canAttemptHashtagSearch: false,
    requirements: ["Instagram Business 또는 Creator 계정 ID가 필요합니다.", "공개 해시태그 콘텐츠 조회 권한은 실제 API 응답으로 최종 확인합니다."],
  };
  if (!base.configured) return base;

  try {
    await graphFetch<{ id: string }>("me", { fields: "id" });
    base.tokenValid = true;
    const [permissionsResponse, pagesResponse, debugResponse] = await Promise.all([
      graphFetch<{ data: Array<{ permission: string; status: string }> }>("me/permissions"),
      graphFetch<{ data: PageRecord[] }>("me/accounts", { fields: "id,name,instagram_business_account{id,username,name}" }),
      graphFetch<{ data: { expires_at?: number; data_access_expires_at?: number } }>("debug_token", { input_token: getToken() }).catch((): { data: { expires_at?: number; data_access_expires_at?: number } } => ({ data: {} })),
    ]);
    base.permissions.granted = permissionsResponse.data.filter((item) => item.status === "granted").map((item) => item.permission);
    base.permissions.declined = permissionsResponse.data.filter((item) => item.status !== "granted").map((item) => item.permission);
    base.permissions.missingForHashtag = REQUIRED_HASHTAG_PERMISSIONS.filter((permission) => !base.permissions.granted.includes(permission));
    base.pages = pagesResponse.data.map((page) => ({ id: page.id, name: page.name, instagramProfessional: page.instagram_business_account || null }));
    const expiresAt = debugResponse.data.expires_at ? new Date(debugResponse.data.expires_at * 1000) : undefined;
    const dataAccessExpiresAt = debugResponse.data.data_access_expires_at ? new Date(debugResponse.data.data_access_expires_at * 1000) : undefined;
    base.token = { expiresAt: expiresAt?.toISOString(), dataAccessExpiresAt: dataAccessExpiresAt?.toISOString(), expiresSoon: Boolean(expiresAt && expiresAt.getTime() - Date.now() < 24 * 60 * 60 * 1000) };
    const hasIgUser = Boolean(getConfiguredIgUserId() || base.pages.some((page) => page.instagramProfessional));
    base.canAttemptHashtagSearch = publicContentStatus !== "pending" && base.permissions.missingForHashtag.length === 0 && hasIgUser;
    return base;
  } catch (error) {
    const metaError = error instanceof MetaGraphError ? error : new MetaGraphError("Meta 연결 상태를 확인할 수 없습니다.");
    return { ...base, error: { message: metaError.message, code: metaError.code, reason: metaError.reason } };
  }
}

function normalizeHashtag(query: string) {
  const normalized = query.replace(/^#/, "").trim();
  if (!normalized || normalized.length > 100 || !/^[\p{L}\p{N}_]+$/u.test(normalized)) throw new MetaGraphError("해시태그는 # 없이 문자, 숫자, 밑줄만 입력하세요.", undefined, 400, "META_INVALID_HASHTAG");
  return normalized;
}

function readCache(cacheKey: string) {
  const cached = hashtagCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) { hashtagCache.delete(cacheKey); return null; }
  return { ...cached.value, cache: { hit: true, ttlSeconds: Math.max(1, Math.ceil((cached.expiresAt - Date.now()) / 1000)) } };
}

function writeCache(cacheKey: string, value: HashtagSearchResult) {
  if (hashtagCache.size >= HASHTAG_CACHE_MAX) hashtagCache.delete(hashtagCache.keys().next().value as string);
  hashtagCache.set(cacheKey, { value, expiresAt: Date.now() + HASHTAG_CACHE_TTL_MS });
}

export async function searchInstagramHashtag(query: string): Promise<HashtagSearchResult> {
  const normalized = normalizeHashtag(query);
  const status = await getMetaConnectionStatus();
  if (!status.tokenValid) {
    const expired = status.error?.reason === "META_TOKEN_EXPIRED";
    throw new MetaGraphError(expired ? "Meta 액세스 토큰이 만료되었거나 유효하지 않습니다. 새 토큰을 발급해 서버를 재시작하세요." : status.error?.message || "유효한 Meta 사용자 토큰이 필요합니다.", status.error?.code, 401, expired ? "META_TOKEN_EXPIRED" : status.error?.reason || "META_GRAPH_ERROR");
  }
  const discoveredAccount = status.pages.find((page) => page.instagramProfessional)?.instagramProfessional;
  const accountId = getConfiguredIgUserId() || discoveredAccount?.id;
  if (!accountId) throw new MetaGraphError("META_IG_USER_ID를 설정하거나 Facebook 페이지에 Instagram 프로페셔널 계정을 연결하세요.", undefined, 409, "META_IG_USER_NOT_FOUND");
  if (status.permissions.missingForHashtag.length) throw new MetaGraphError(`필수 권한이 없습니다: ${status.permissions.missingForHashtag.join(", ")}`, undefined, 403, "META_PERMISSION_ERROR");
  if (status.publicContentAccess.status === "pending") throw new MetaGraphError("Meta API 승인 대기 중입니다. Instagram Public Content Access 승인 후 검색할 수 있습니다.", 10, 403, "META_APPROVAL_PENDING");

  const cacheKey = `${accountId}:${normalized.toLocaleLowerCase()}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const hashtag = await graphFetch<{ data: Array<{ id: string }> }>("ig_hashtag_search", { user_id: accountId, q: normalized });
  const hashtagId = hashtag.data[0]?.id;
  const emptyResult: HashtagSearchResult = { source: "live_meta", query: normalized, hashtagId: null, collectedAt: new Date().toISOString(), recentMedia: [], topMedia: [], topMediaAvailable: true, warnings: [], cache: { hit: false, ttlSeconds: HASHTAG_CACHE_TTL_MS / 1000 }, metrics: { postCount: null, growthRate: null, reason: "Meta Hashtag Search API는 전체 게시물 수와 관심도 상승률을 제공하지 않습니다." } };
  if (!hashtagId) { writeCache(cacheKey, emptyResult); return emptyResult; }

  const mediaParams = { user_id: accountId, fields: "id,caption,media_type,permalink,timestamp", limit: "12" };
  const recent = await graphFetch<{ data: InstagramMedia[] }>(`${hashtagId}/recent_media`, mediaParams);
  let topMedia: InstagramMedia[] = [];
  let topMediaAvailable = true;
  const warnings: string[] = [];
  try {
    const top = await graphFetch<{ data: InstagramMedia[] }>(`${hashtagId}/top_media`, mediaParams);
    topMedia = top.data;
  } catch (error) {
    const metaError = error instanceof MetaGraphError ? error : new MetaGraphError("top_media 조회에 실패했습니다.");
    if (metaError.reason === "META_TOKEN_EXPIRED" || metaError.reason === "META_RATE_LIMITED") throw metaError;
    topMediaAvailable = false;
    warnings.push("현재 권한 또는 API 버전에서는 top_media를 조회할 수 없어 recent_media만 표시합니다.");
  }
  const result: HashtagSearchResult = { ...emptyResult, hashtagId, recentMedia: recent.data, topMedia, topMediaAvailable, warnings };
  writeCache(cacheKey, result);
  return result;
}

/* ── HASHTAG PULSE: recent_media를 넘겨 최근 게시 속도를 측정한다 ─────────────── */

export const HASHTAG_WEEKLY_LIMIT = 30;
const PULSE_MAX_PAGES = 6;
const PULSE_PAGE_SIZE = "50";
const DAY_MS = 24 * 60 * 60 * 1000;

export type HashtagPulseMeasure = {
  tag: string;
  hashtagId: string | null;
  collectedAt: string;
  sampled: number;
  pagesFetched: number;
  /** recent_media(최근 24시간)를 끝까지 받았는지. true면 posts24h가 정확한 값이다. */
  complete: boolean;
  posts24h: number;
  oldestAt: string | null;
  spanHours: number | null;
  /** complete면 24시간 평균, 아니면 받은 표본 구간(최근 spanHours시간)의 속도 */
  perHour: number | null;
  rateBasis: "24h-full" | "recent-sample";
  samplePosts: Array<{ permalink: string; timestamp: string }>;
};

/** 해시태그 조회에 쓸 Instagram 프로페셔널 계정 ID */
export async function resolveIgAccountId() {
  const configured = getConfiguredIgUserId();
  if (configured) return configured;
  const pages = await graphFetch<{ data: PageRecord[] }>("me/accounts", { fields: "instagram_business_account{id}" });
  const id = pages.data.find((page) => page.instagram_business_account)?.instagram_business_account?.id;
  if (!id) throw new MetaGraphError("META_IG_USER_ID를 설정하거나 Facebook 페이지에 Instagram 프로페셔널 계정을 연결하세요.", undefined, 409, "META_IG_USER_NOT_FOUND");
  return id;
}

/** 최근 7일 안에 조회한 해시태그. 이 목록에 있는 태그는 다시 조회해도 주간 한도를 쓰지 않는다. */
export async function getRecentlySearchedHashtags(accountId: string) {
  const response = await graphFetch<{ data: Array<{ id: string; name?: string }> }>(`${accountId}/recently_searched_hashtags`, { fields: "id,name", limit: "30" });
  return response.data.map((item) => (item.name ?? "").toLocaleLowerCase()).filter(Boolean);
}

export function normalizeHashtagName(query: string) { return normalizeHashtag(query.replace(/\s+/g, "")); }

export async function measureHashtagPulse(accountId: string, query: string): Promise<HashtagPulseMeasure> {
  const tag = normalizeHashtagName(query);
  const collectedAt = new Date();
  const search = await graphFetch<{ data: Array<{ id: string }> }>("ig_hashtag_search", { user_id: accountId, q: tag });
  const hashtagId = search.data[0]?.id ?? null;
  const empty: HashtagPulseMeasure = { tag, hashtagId, collectedAt: collectedAt.toISOString(), sampled: 0, pagesFetched: 0, complete: true, posts24h: 0, oldestAt: null, spanHours: null, perHour: hashtagId ? 0 : null, rateBasis: "24h-full", samplePosts: [] };
  if (!hashtagId) return empty;

  const media: InstagramMedia[] = [];
  let after: string | undefined;
  let pagesFetched = 0;
  let complete = false;
  type MediaPage = { data: InstagramMedia[]; paging?: { next?: string; cursors?: { after?: string } } };
  const fetchPage = () => graphFetch<MediaPage>(`${hashtagId}/recent_media`, { user_id: accountId, fields: "id,permalink,timestamp", limit: PULSE_PAGE_SIZE, ...(after ? { after } : {}) });
  while (pagesFetched < PULSE_MAX_PAGES) {
    let page: MediaPage;
    try {
      // 게시물이 많은 태그는 응답이 느리다. 시간 초과는 한 번 재시도한다.
      page = await fetchPage().catch((error) => { if (error instanceof MetaGraphError && error.reason === "META_TIMEOUT") return fetchPage(); throw error; });
    } catch (error) {
      // 이미 받은 페이지가 있으면 그 표본으로 속도를 계산한다(complete=false).
      if (pagesFetched > 0 && error instanceof MetaGraphError && error.reason === "META_TIMEOUT") break;
      throw error;
    }
    pagesFetched += 1;
    media.push(...page.data);
    after = page.paging?.next ? page.paging.cursors?.after : undefined;
    if (!after || !page.data.length) { complete = true; break; }
  }
  const times = [...new Set(media.map((item) => item.id))].map((id) => media.find((item) => item.id === id)!)
    .filter((item) => item.timestamp).map((item) => ({ ...item, t: new Date(item.timestamp!).getTime() }))
    .filter((item) => Number.isFinite(item.t)).sort((a, b) => b.t - a.t);
  const within = times.filter((item) => collectedAt.getTime() - item.t <= DAY_MS);
  const oldest = times.at(-1);
  const spanHours = times.length > 1 ? (collectedAt.getTime() - oldest!.t) / 36e5 : null;
  // 끝까지 받았으면 24시간 전체 평균, 아니면 받은 표본이 걸친 최근 구간의 속도
  const perHour = complete ? within.length / 24 : spanHours && spanHours > 0 ? times.length / spanHours : null;
  return {
    ...empty, sampled: times.length, pagesFetched, complete, posts24h: within.length,
    oldestAt: oldest ? new Date(oldest.t).toISOString() : null,
    spanHours: spanHours === null ? null : Math.round(spanHours * 10) / 10,
    perHour: perHour === null ? null : Math.round(perHour * 10) / 10,
    rateBasis: complete ? "24h-full" : "recent-sample",
    samplePosts: times.filter((item) => item.permalink).slice(0, 3).map((item) => ({ permalink: item.permalink!, timestamp: item.timestamp! })),
  };
}
