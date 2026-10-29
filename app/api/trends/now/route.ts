import { NextResponse } from "next/server";
import { z } from "zod";
import { scanTrendNow, TREND_NOW_PROMPT_VERSION } from "@/lib/trend-now";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { clientKeyFrom } from "@/lib/rate-limit";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ force: z.boolean().default(false) });
const NOW_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/** 웹 검색 1회 + NAVER 최대 3회. 같은 날 결과는 서버에서 12시간 재사용한다. */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 1_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body ?? {});
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  const cacheKey = hashKey({ v: TREND_NOW_PROMPT_VERSION, day: new Date().toISOString().slice(0, 10) });
  try {
    const { value, cached } = await runGuarded(clientKeyFrom(request), cacheKey, NOW_CACHE_TTL_MS, scanTrendNow, { bypassCache: parsed.data.force });
    return NextResponse.json({ mode: "live", cached, report: value }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && !("status" in error)) return NextResponse.json({ error: "TREND_NOW_FAILED", message: error.message }, { status: 502, headers: noStore });
    return errorResponse(error, "2030 트렌드 스캔에 실패했습니다.");
  }
}
