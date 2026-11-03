import { NextResponse } from "next/server";
import { mediaFromEvidence } from "@/lib/visual-media";
import { liveTrendId } from "@/lib/live-trend";
import type { InstagramMedia } from "@/lib/meta";
import { z } from "zod";
import { collectNaverTrend } from "@/lib/naver";
import { analyzePhenomenonWithOpenAI, analyzeTrendWithOpenAI, PHENOMENON_WHY_PROMPT_VERSION, TREND_WHY_PROMPT_VERSION } from "@/lib/openai-analysis";
import { searchInstagramHashtag, MetaGraphError } from "@/lib/meta";
import { dedupeEvidence, instagramEvidence, naverEvidence, toHashtag } from "@/lib/evidence-ledger";
import { collectWebEvidence, type WebCollection } from "@/lib/web-evidence";
import { computeSeriesStats } from "@/lib/signal";
import { assertExternalRate, hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { requirePaidAccess } from "@/lib/api-access";
import { evidenceItemSchema, phenomenonContextSchema, type EvidenceItem } from "@/lib/schemas";
import { phenomenonTrendId, reusePhenomenonEvidence } from "@/lib/discovery";
import type { InstagramCollection } from "@/lib/types";
import type { YouTubeEvidenceCollection } from "@/lib/types";
import { collectYouTubeEvidence } from "@/lib/youtube";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  trend: z.string().trim().min(1).max(100),
  keywords: z.array(z.string().trim().min(1).max(100)).max(5).optional(),
  periodMonths: z.union([z.literal(1), z.literal(3), z.literal(12)]).default(12),
  includeInstagram: z.boolean().default(true),
  includeYouTube: z.boolean().default(true),
  /** 뉴스·공개 자료 웹 검색으로 배경·사건·확산 콘텐츠·브랜드 사례 근거 보강(OpenAI 웹 검색 1회 추가) */
  includeWeb: z.boolean().default(true),
  force: z.boolean().default(false),
  /** T5: 선택한 현상. 있으면 검색어·웹 검색·프롬프트·캐시 키가 모두 이 현상 기준이 된다. 없으면 기존 키워드 분석. */
  phenomenon: phenomenonContextSchema.optional(),
  /** T5: 발견 단계에서 이 현상에 대해 이미 수집한 근거(재사용, D-xx로 다시 번호). 현상의 근거 ID에 있는 것만 쓴다. */
  phenomenonEvidence: z.array(evidenceItemSchema).max(12).optional(),
});

const WHY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  let access;
  try { access = await requirePaidAccess(request); } catch (error) { return errorResponse(error); }
  const { trend, keywords, periodMonths, includeYouTube, includeWeb, force, phenomenon } = parsed.data;
  // 현상 이름은 해시태그가 아니므로 Instagram 해시태그 검색(주간 할당량)을 쓰지 않는다.
  const includeInstagram = phenomenon ? false : parsed.data.includeInstagram;

  try { assertExternalRate(access.clientKey); } catch (error) { return errorResponse(error); }

  if (phenomenon) return analyzePhenomenon(parsed.data, phenomenon, access.clientKey, includeYouTube, includeWeb, force, periodMonths);

  let naver;
  try { naver = await collectNaverTrend(trend, keywords, periodMonths); }
  catch (error) { return errorResponse(error, "NAVER DataLab 연결에 실패했습니다."); }
  const signalStats = computeSeriesStats(naver.series, { endDate: naver.endDate, timeUnit: naver.timeUnit });
  const evidence: EvidenceItem[] = naverEvidence(naver, signalStats);

  const hashtag = toHashtag(trend);
  let instagram: InstagramCollection = { status: "skipped", hashtag, count: 0, message: "Instagram 수집을 선택하지 않았습니다." };
  let instagramMedia: InstagramMedia[] = [];
  if (includeInstagram) {
    try {
      const result = await searchInstagramHashtag(hashtag);
      const items = instagramEvidence(result);
      instagramMedia = [...result.recentMedia, ...result.topMedia];
      evidence.push(...items);
      instagram = { status: result.cache.hit ? "cached" : "live", hashtag: result.query, count: items.length, message: result.hashtagId ? undefined : "해시태그 ID를 찾지 못했습니다." };
    } catch (error) {
      instagram = { status: "error", hashtag, count: 0, message: error instanceof MetaGraphError ? error.message : "Instagram 수집에 실패했습니다." };
    }
  }

  let youtube: YouTubeEvidenceCollection = { status: "skipped", query: trend, videos: [], hourlyDistribution: [], message: "YouTube 수집을 선택하지 않았습니다." };
  if (includeYouTube) {
    try {
      const result = await collectYouTubeEvidence(trend, { force });
      evidence.push(...result.evidence);
      youtube = result.collection;
    } catch (error) {
      youtube = { status: "error", query: trend, videos: [], hourlyDistribution: [], message: error instanceof Error ? error.message : "YouTube 수집에 실패했습니다." };
    }
  }

  const cacheKey = hashKey({ v: TREND_WHY_PROMPT_VERSION, trend, periodMonths, includeWeb, includeYouTube, series: naver.series, evidence: evidence.map((item) => [item.id, item.excerpt]) });
  // 웹 출처 수집과 분석을 한 번의 보호 단위로 묶는다. 웹 검색 실패는 분석을 막지 않는다.
  const analyze = async () => {
    let webItems: EvidenceItem[] = [];
    let web: WebCollection = { status: "skipped", count: 0, searchedSources: 0, droppedUnverified: 0, message: "웹 출처 수집을 선택하지 않았습니다." };
    if (includeWeb) {
      try { ({ items: webItems, web } = await collectWebEvidence(trend)); }
      catch (error) { web = { status: "error", count: 0, searchedSources: 0, droppedUnverified: 0, message: error instanceof Error ? error.message.slice(0, 200) : "웹 출처 수집에 실패했습니다." }; }
    }
    const result = await analyzeTrendWithOpenAI(trend, naver, dedupeEvidence([...evidence, ...webItems]), signalStats);
    return { ...result, webItems, web };
  };
  try {
    const { value, cached } = await runGuarded(access.clientKey, cacheKey, WHY_CACHE_TTL_MS, analyze, { bypassCache: force, cost: includeWeb ? 2 : 1 });
    const { webItems, ...analysis } = value;
    const sources = ["NAVER DataLab", ...(instagram.count ? ["Instagram Graph API"] : []), ...(youtube.status === "live" || youtube.status === "cached" ? ["YouTube Data API v3"] : []), ...(webItems.length ? ["Web sources (OpenAI web search)"] : []), "OpenAI"];
    const allEvidence = dedupeEvidence([...evidence, ...webItems]);
    // V1: 수집한 근거에서 미디어 메타데이터를 만든다(추가 API 호출 없음). Instagram 이미지 URL은 같은 응답의 media_url만 쓴다.
    const media = mediaFromEvidence({ trendId: liveTrendId(trend), evidence: allEvidence, videos: youtube.videos, instagram: instagramMedia });
    return NextResponse.json({ mode: "live", cached, provenance: { sources, demo: false }, naver, signalStats, instagram, youtube, ...analysis, evidence: allEvidence, media }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "OpenAI 분석에 실패했습니다.", { naver, signalStats, evidence, instagram, youtube });
  }
}

type Parsed = z.infer<typeof requestSchema>;
type Phenomenon = NonNullable<Parsed["phenomenon"]>;
/*
 * T5 현상 모드: 상위 키워드가 아니라 선택한 현상으로 검색하고 분석한다.
 * 근거: 발견 단계 근거 재사용(D-xx) + 필요할 때만 새 검색(YouTube: 현상 검색어·관측 기간, 웹: 현상 행동 중심 한·영 검색) + NAVER(현상 검색어, 실패해도 계속).
 * 캐시 키는 현상 ID·맥락 전체를 포함해 같은 이름의 키워드 분석과 겹치지 않는다.
 */
async function analyzePhenomenon(data: Parsed, phenomenon: Phenomenon, clientKey: string, includeYouTube: boolean, includeWeb: boolean, force: boolean, periodMonths: Parsed["periodMonths"]) {
  const reused = reusePhenomenonEvidence(phenomenon, data.phenomenonEvidence);
  const naverTerms = [...new Set([...phenomenon.searchTerms, phenomenon.keyword].filter((term) => term.length <= 20))].slice(0, 3);
  let naver: Awaited<ReturnType<typeof collectNaverTrend>> | null = null;
  try { if (naverTerms.length) naver = await collectNaverTrend(naverTerms[0], naverTerms, periodMonths); } catch { naver = null; }
  const signalStats = naver ? computeSeriesStats(naver.series, { endDate: naver.endDate, timeUnit: naver.timeUnit }) : [];
  const evidence: EvidenceItem[] = [...(naver ? naverEvidence(naver, signalStats) : []), ...reused];
  const instagram: InstagramCollection = { status: "skipped", hashtag: toHashtag(phenomenon.title), count: 0, message: "현상 분석에서는 Instagram 해시태그 검색을 쓰지 않습니다(주간 할당량 보호)." };
  const youtubeQuery = phenomenon.searchTerms[0] ?? phenomenon.title;
  let youtube: YouTubeEvidenceCollection = { status: "skipped", query: youtubeQuery, videos: [], hourlyDistribution: [], message: "발견 근거를 재사용해 YouTube를 새로 검색하지 않았습니다." };
  if (includeYouTube) {
    try {
      const result = await collectYouTubeEvidence(youtubeQuery, { force, days: Math.max(7, Math.min(180, phenomenon.window.days)), order: "relevance" });
      evidence.push(...result.evidence);
      youtube = result.collection;
    } catch (error) {
      youtube = { status: "error", query: youtubeQuery, videos: [], hourlyDistribution: [], message: error instanceof Error ? error.message : "YouTube 수집에 실패했습니다." };
    }
  }
  const cacheKey = hashKey({ v: PHENOMENON_WHY_PROMPT_VERSION, phenomenon, periodMonths, includeWeb, includeYouTube, series: naver?.series ?? null, evidence: evidence.map((item) => [item.id, item.excerpt]) });
  const analyze = async () => {
    let webItems: EvidenceItem[] = [];
    let web: WebCollection = { status: "skipped", count: 0, searchedSources: 0, droppedUnverified: 0, message: "발견 근거를 재사용해 웹을 새로 검색하지 않았습니다." };
    if (includeWeb) {
      try { ({ items: webItems, web } = await collectWebEvidence(phenomenon.title, undefined, undefined, phenomenon)); }
      catch (error) { web = { status: "error", count: 0, searchedSources: 0, droppedUnverified: 0, message: error instanceof Error ? error.message.slice(0, 200) : "웹 출처 수집에 실패했습니다." }; }
    }
    const result = await analyzePhenomenonWithOpenAI(phenomenon, naver, dedupeEvidence([...evidence, ...webItems]), signalStats, reused.map((item) => item.id));
    return { ...result, webItems, web };
  };
  try {
    const { value, cached } = await runGuarded(clientKey, cacheKey, WHY_CACHE_TTL_MS, analyze, { bypassCache: force, cost: includeWeb ? 2 : 1 });
    const { webItems, ...analysis } = value;
    const sources = [...(naver ? ["NAVER DataLab"] : []), ...(reused.length ? ["Discovery evidence (reused)"] : []), ...(youtube.status === "live" || youtube.status === "cached" ? ["YouTube Data API v3"] : []), ...(webItems.length ? ["Web sources (OpenAI web search)"] : []), "OpenAI"];
    const allEvidence = dedupeEvidence([...evidence, ...webItems]);
    const media = mediaFromEvidence({ trendId: phenomenonTrendId(phenomenon), evidence: allEvidence, videos: youtube.videos, instagram: [] });
    return NextResponse.json({ mode: "live", cached, provenance: { sources, demo: false }, naver, signalStats, instagram, youtube, ...analysis, evidence: allEvidence, media }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "OpenAI 분석에 실패했습니다.", { naver, signalStats, evidence, instagram, youtube });
  }
}
