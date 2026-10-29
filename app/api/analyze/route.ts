import { NextResponse } from "next/server";
import { z } from "zod";
import { collectNaverTrend } from "@/lib/naver";
import { analyzeTrendWithOpenAI, TREND_WHY_PROMPT_VERSION } from "@/lib/openai-analysis";
import { searchInstagramHashtag, MetaGraphError } from "@/lib/meta";
import { instagramEvidence, naverEvidence, toHashtag } from "@/lib/evidence-ledger";
import { computeSeriesStats } from "@/lib/signal";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { clientKeyFrom } from "@/lib/rate-limit";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import type { EvidenceItem } from "@/lib/schemas";
import type { InstagramCollection } from "@/lib/types";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  trend: z.string().trim().min(1).max(100),
  keywords: z.array(z.string().trim().min(1).max(100)).max(5).optional(),
  periodMonths: z.union([z.literal(1), z.literal(3), z.literal(12)]).default(12),
  includeInstagram: z.boolean().default(true),
  force: z.boolean().default(false),
});

const WHY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  const { trend, keywords, periodMonths, includeInstagram, force } = parsed.data;

  let naver;
  try { naver = await collectNaverTrend(trend, keywords, periodMonths); }
  catch (error) { return errorResponse(error, "NAVER DataLab 연결에 실패했습니다."); }
  const signalStats = computeSeriesStats(naver.series, { endDate: naver.endDate, timeUnit: naver.timeUnit });
  const evidence: EvidenceItem[] = naverEvidence(naver, signalStats);

  const hashtag = toHashtag(trend);
  let instagram: InstagramCollection = { status: "skipped", hashtag, count: 0, message: "Instagram 수집을 선택하지 않았습니다." };
  if (includeInstagram) {
    try {
      const result = await searchInstagramHashtag(hashtag);
      const items = instagramEvidence(result);
      evidence.push(...items);
      instagram = { status: result.cache.hit ? "cached" : "live", hashtag: result.query, count: items.length, message: result.hashtagId ? undefined : "해시태그 ID를 찾지 못했습니다." };
    } catch (error) {
      instagram = { status: "error", hashtag, count: 0, message: error instanceof MetaGraphError ? error.message : "Instagram 수집에 실패했습니다." };
    }
  }

  const cacheKey = hashKey({ v: TREND_WHY_PROMPT_VERSION, trend, periodMonths, series: naver.series, evidence: evidence.map((item) => [item.id, item.excerpt]) });
  try {
    const { value, cached } = await runGuarded(clientKeyFrom(request), cacheKey, WHY_CACHE_TTL_MS, () => analyzeTrendWithOpenAI(trend, naver, evidence, signalStats), { bypassCache: force });
    return NextResponse.json({ mode: "live", cached, provenance: { sources: ["NAVER DataLab", ...(instagram.count ? ["Instagram Graph API"] : []), "OpenAI"], demo: false }, naver, signalStats, evidence, instagram, ...value }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "OpenAI 분석에 실패했습니다.", { naver, signalStats, evidence, instagram });
  }
}
