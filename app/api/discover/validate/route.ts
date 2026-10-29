import { NextResponse } from "next/server";
import { z } from "zod";
import { collectNaverTrend } from "@/lib/naver";
import { computeSeriesStats } from "@/lib/signal";
import { readJsonBody } from "@/lib/ai-guard";
import { clientKeyFrom, createRateLimiter } from "@/lib/rate-limit";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const limiter = createRateLimiter(10);
const requestSchema = z.object({ keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(5), periodMonths: z.union([z.literal(3), z.literal(12)]).default(3) });

/**
 * 후보 키워드를 하나의 NAVER 요청으로 묶어 같은 척도에서만 비교한다. AI 호출 없음.
 */
export async function POST(request: Request) {
  if (!limiter(clientKeyFrom(request)).allowed) return NextResponse.json({ error: "LOCAL_RATE_LIMIT", message: "검증 요청이 너무 많습니다. 1분 후 다시 시도하세요." }, { status: 429, headers: noStore });
  let body: unknown;
  try { body = await readJsonBody(request, 5_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  const [first, ...rest] = [...new Set(parsed.data.keywords)];
  try {
    const naver = await collectNaverTrend(first, rest, parsed.data.periodMonths);
    const stats = computeSeriesStats(naver.series, { endDate: naver.endDate, timeUnit: naver.timeUnit });
    const ranked = [...stats].sort((a, b) => (b.recentAvg - b.earlyAvg) - (a.recentAvg - a.earlyAvg));
    return NextResponse.json({ mode: "live", batchId: `${naver.collectedAt}-${naver.series.map((s) => s.title).join("|")}`, collectedAt: naver.collectedAt, startDate: naver.startDate, endDate: naver.endDate, timeUnit: naver.timeUnit, stats: ranked, methodology: "같은 요청 안의 키워드끼리만 비교한 상대 지수입니다. 정렬 기준: 최근 1/3 평균 − 초기 1/3 평균. 다른 배치와 비교하지 마세요." }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "NAVER 검증에 실패했습니다.");
  }
}
