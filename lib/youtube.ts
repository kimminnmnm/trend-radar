import "server-only";
import type { EvidenceItem } from "./schemas";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 50;
const MAX_RESULTS = 10;
const DAILY_SEARCH_LIMIT = Number(process.env.YOUTUBE_DAILY_SEARCH_LIMIT) || 20;

export type YouTubeVideo = {
  id: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: number | null;
  url: string;
};

export type YouTubeCollection = {
  status: "live" | "cached";
  query: string;
  collectedAt: string;
  period: { publishedAfter: string; publishedBefore: string };
  videos: YouTubeVideo[];
  hourlyDistribution: Array<{ hour: number; count: number }>;
  methodology: string;
  cache: { hit: boolean; ttlSeconds: number };
  quota: { searchCalls: number; detailCalls: number; dailySearchUsed: number; dailySearchLimit: number };
};

type GoogleError = { error?: { code?: number; message?: string; errors?: Array<{ reason?: string }> } };
type CacheEntry = { expiresAt: number; value: YouTubeCollection; evidence: EvidenceItem[] };
const cache = new Map<string, CacheEntry>();
let daily = { day: "", searches: 0, details: 0 };

export class YouTubeApiError extends Error {
  constructor(message: string, public readonly status = 502, public readonly reason = "YOUTUBE_API_ERROR") { super(message); }
}

function key() {
  const value = process.env.YOUTUBE_API_KEY?.trim();
  if (!value) throw new YouTubeApiError("YOUTUBE_API_KEY가 설정되지 않았습니다.", 503, "YOUTUBE_NOT_CONFIGURED");
  return value;
}

function today() { return new Date().toISOString().slice(0, 10); }
function refreshDaily() { const day = today(); if (daily.day !== day) daily = { day, searches: 0, details: 0 }; }
export function youtubeUsageToday() { refreshDaily(); return { searchUsed: daily.searches, detailUsed: daily.details, searchLimit: DAILY_SEARCH_LIMIT }; }

async function youtubeFetch<T>(path: "search" | "videos", params: Record<string, string>) {
  const url = new URL(`${API_BASE}/${path}`);
  Object.entries({ ...params, key: key() }).forEach(([name, value]) => url.searchParams.set(name, value));
  let response: Response;
  try { response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) }); }
  catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    throw new YouTubeApiError(timeout ? "YouTube API 응답 시간이 초과됐습니다." : "YouTube API에 연결할 수 없습니다.", 504, timeout ? "YOUTUBE_TIMEOUT" : "YOUTUBE_NETWORK_ERROR");
  }
  const body = await response.json() as T & GoogleError;
  if (!response.ok || body.error) {
    const reason = body.error?.errors?.[0]?.reason ?? "";
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || reason === "rateLimitExceeded") throw new YouTubeApiError("YouTube Data API 할당량을 초과했습니다. Google Cloud Console의 Quotas에서 사용량을 확인하세요.", 429, "YOUTUBE_QUOTA_EXCEEDED");
    if (reason === "keyInvalid" || response.status === 400 && /API key/i.test(body.error?.message ?? "")) throw new YouTubeApiError("YouTube API 키가 유효하지 않거나 YouTube Data API v3가 활성화되지 않았습니다.", 401, "YOUTUBE_KEY_INVALID");
    throw new YouTubeApiError(body.error?.message || "YouTube Data API 요청에 실패했습니다.", response.status, "YOUTUBE_API_ERROR");
  }
  return body;
}

const cleanQuery = (value: string) => value.trim().replace(/\s+/g, " ").slice(0, 100);
const hourInKorea = (value: string) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" }).format(new Date(value)));

export async function collectYouTubeEvidence(queryValue: string, options: { force?: boolean } = {}) {
  const query = cleanQuery(queryValue);
  if (!query) throw new YouTubeApiError("YouTube 검색 키워드가 비어 있습니다.", 400, "YOUTUBE_INVALID_QUERY");
  const cacheKey = query.toLocaleLowerCase("ko-KR");
  const hit = cache.get(cacheKey);
  if (!options.force && hit && hit.expiresAt > Date.now()) {
    const ttlSeconds = Math.max(1, Math.ceil((hit.expiresAt - Date.now()) / 1000));
    return { collection: { ...hit.value, status: "cached" as const, cache: { hit: true, ttlSeconds } }, evidence: hit.evidence };
  }
  refreshDaily();
  if (daily.searches >= DAILY_SEARCH_LIMIT) throw new YouTubeApiError(`YouTube 검색의 서버 일일 상한(${DAILY_SEARCH_LIMIT}회)에 도달했습니다.`, 429, "YOUTUBE_LOCAL_DAILY_LIMIT");

  const collectedAt = new Date();
  const publishedBefore = collectedAt.toISOString();
  const publishedAfter = new Date(collectedAt.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  daily.searches += 1;
  const search = await youtubeFetch<{ items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; publishedAt?: string } }> }>("search", {
    part: "snippet", type: "video", q: query, maxResults: String(MAX_RESULTS), order: "date",
    publishedAfter, publishedBefore, relevanceLanguage: "ko", regionCode: "KR", safeSearch: "moderate",
  });
  const searchItems = search.items ?? [];
  const ids = searchItems.map((item) => item.id?.videoId).filter((id): id is string => Boolean(id));
  let statistics = new Map<string, number | null>();
  if (ids.length) {
    daily.details += 1;
    const details = await youtubeFetch<{ items?: Array<{ id?: string; statistics?: { viewCount?: string } }> }>("videos", { part: "statistics", id: ids.join(",") });
    statistics = new Map((details.items ?? []).flatMap((item) => item.id ? [[item.id, item.statistics?.viewCount ? Number(item.statistics.viewCount) : null] as const] : []));
  }
  const videos: YouTubeVideo[] = searchItems.flatMap((item) => {
    const id = item.id?.videoId, snippet = item.snippet;
    if (!id || !snippet?.title || !snippet.publishedAt) return [];
    return [{ id, title: snippet.title, channelTitle: snippet.channelTitle ?? "채널 정보 없음", publishedAt: snippet.publishedAt, viewCount: statistics.get(id) ?? null, url: `https://www.youtube.com/watch?v=${id}` }];
  });
  const counts = new Map<number, number>();
  videos.forEach((video) => { const hour = hourInKorea(video.publishedAt); counts.set(hour, (counts.get(hour) ?? 0) + 1); });
  const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({ hour, count: counts.get(hour) ?? 0 }));
  const evidence: EvidenceItem[] = videos.map((video, index) => ({
    id: `YT-${String(index + 1).padStart(2, "0")}`,
    kind: "youtube_video",
    title: video.title.slice(0, 200),
    source: `YouTube Data API · ${video.channelTitle}`.slice(0, 120),
    url: video.url,
    date: video.publishedAt,
    collectedAt: collectedAt.toISOString(),
    excerpt: `공개 영상 검색 결과. 게시 ${video.publishedAt}, 조회수 ${video.viewCount === null ? "비공개/미제공" : video.viewCount.toLocaleString("ko-KR")}회(수집 시점 값). 조회수와 게시 시각은 트렌드의 원인이나 전체 YouTube 대표성을 증명하지 않음.`.slice(0, 800),
  }));
  const collection: YouTubeCollection = {
    status: "live", query, collectedAt: collectedAt.toISOString(), period: { publishedAfter, publishedBefore }, videos, hourlyDistribution,
    methodology: `최근 30일, 한국 지역·한국어 관련성 조건으로 최신순 최대 ${MAX_RESULTS}개 공개 영상을 수집한 검색 표본입니다. 전체 YouTube 트렌드나 인과관계를 대표하지 않습니다.`,
    cache: { hit: false, ttlSeconds: CACHE_TTL_MS / 1000 },
    quota: { searchCalls: 1, detailCalls: ids.length ? 1 : 0, dailySearchUsed: daily.searches, dailySearchLimit: DAILY_SEARCH_LIMIT },
  };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(cacheKey, { value: collection, evidence, expiresAt: Date.now() + CACHE_TTL_MS });
  return { collection, evidence };
}
