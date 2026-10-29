import { NextResponse } from "next/server";
import { z } from "zod";
import { scanTrendNow, TREND_NOW_PROMPT_VERSION } from "@/lib/trend-now";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { requirePaidAccess } from "@/lib/api-access";
import { koreaDateKey } from "@/lib/korea-date";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ force: z.boolean().default(false) });
const NOW_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/** 웹 검색 1회 + NAVER 최대 3회. 같은 날 결과는 서버에서 12시간 재사용한다. */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 1_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body ?? {});
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  let access;
  try { access = await requirePaidAccess(request); } catch (error) { return errorResponse(error); }
  // 서비스 대상이 한국이므로 UTC가 아니라 KST 자정에 새 일일 스캔으로 전환한다.
  const cacheKey = hashKey({ v: TREND_NOW_PROMPT_VERSION, day: koreaDateKey() });
  try {
    const { value, cached } = await runGuarded(access.clientKey, cacheKey, NOW_CACHE_TTL_MS, scanTrendNow, { bypassCache: parsed.data.force });
    return NextResponse.json({ mode: "live", cached, report: value }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && !("status" in error)) return NextResponse.json({ error: "TREND_NOW_FAILED", message: error.message }, { status: 502, headers: noStore });
    return errorResponse(error, "2030 트렌드 스캔에 실패했습니다.");
  }
}
