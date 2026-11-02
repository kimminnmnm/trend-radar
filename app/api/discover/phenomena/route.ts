import { NextResponse } from "next/server";
import { z } from "zod";
import { assertExternalRate, hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { requirePaidAccess } from "@/lib/api-access";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { DISCOVERY_VERSION } from "@/lib/discovery";
import { discoverPhenomena } from "@/lib/openai-discovery";

export const dynamic = "force-dynamic";

/*
 * T1 세부 현상 발견: 넓은 키워드 → 관측 기간 안 실제 자료(YouTube·웹·NAVER 모멘텀)에서 지금 일어나는 세부 현상 후보.
 * OpenAI 2회(웹 검색 1 + 추출 1) · YouTube 검색 1 · NAVER 1. 같은 키워드·기간은 12시간 캐시. Instagram은 새로 검색하지 않는다.
 */
const requestSchema = z.object({ keyword: z.string().trim().min(1).max(60), days: z.number().int().min(3).max(180).default(30), force: z.boolean().default(false) });

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 2_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  let access;
  try { access = await requirePaidAccess(request); assertExternalRate(access.clientKey); } catch (error) { return errorResponse(error); }
  const { keyword, days, force } = parsed.data;
  try {
    const { value, cached } = await runGuarded(access.clientKey, hashKey({ v: DISCOVERY_VERSION, keyword: keyword.toLowerCase(), days, day: new Date().toISOString().slice(0, 10) }), 12 * 60 * 60 * 1000, () => discoverPhenomena(keyword, days), { bypassCache: force, cost: 3 });
    return NextResponse.json({ cached, promptVersion: DISCOVERY_VERSION, ...value }, { headers: noStore });
  } catch (error) { return errorResponse(error, "세부 현상 발견에 실패했습니다."); }
}
