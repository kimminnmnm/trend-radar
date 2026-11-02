import { NextResponse } from "next/server";
import { mediaFromEvidence } from "@/lib/visual-media";
import { liveTrendId } from "@/lib/live-trend";
import type { InstagramMedia } from "@/lib/meta";
import { z } from "zod";
import { collectNaverTrend } from "@/lib/naver";
import { analyzeTrendWithOpenAI, TREND_WHY_PROMPT_VERSION } from "@/lib/openai-analysis";
import { searchInstagramHashtag, MetaGraphError } from "@/lib/meta";
import { dedupeEvidence, instagramEvidence, naverEvidence, toHashtag } from "@/lib/evidence-ledger";
import { collectWebEvidence, type WebCollection } from "@/lib/web-evidence";
import { computeSeriesStats } from "@/lib/signal";
import { assertExternalRate, hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { requirePaidAccess } from "@/lib/api-access";
import type { EvidenceItem } from "@/lib/schemas";
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
});

const WHY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  let access;
  try { access = await requirePaidAccess(request); } catch (error) { return errorResponse(error); }
  const { trend, keywords, periodMonths, includeInstagram, includeYouTube, includeWeb, force } = parsed.data;

  try { assertExternalRate(access.clientKey); } catch (error) { return errorResponse(error); }

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
