import { NextResponse } from "next/server";
import { z } from "zod";
import { IG_PULSE_PROMPT_VERSION, MAX_TAGS_PER_SCAN, scanIgPulse } from "@/lib/ig-pulse";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { clientKeyFrom } from "@/lib/rate-limit";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const tag = z.string().trim().min(1).max(60);
const requestSchema = z.object({
  force: z.boolean().default(false),
  discover: z.boolean().default(true),
  track: z.array(tag).max(MAX_TAGS_PER_SCAN).default([]),
  add: z.array(tag).max(3).default([]),
});
const PULSE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** 웹 검색 최대 1회 + 태그당 Meta 호출 최대 7회. 같은 요청은 6시간 재사용한다. */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 4_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body ?? {});
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  const { force, ...input } = parsed.data;
  const cacheKey = hashKey({ v: IG_PULSE_PROMPT_VERSION, day: new Date().toISOString().slice(0, 10), discover: input.discover, track: [...input.track].sort(), add: [...input.add].sort() });
  try {
    const { value, cached } = await runGuarded(clientKeyFrom(request), cacheKey, PULSE_CACHE_TTL_MS, () => scanIgPulse(input), { bypassCache: force });
    return NextResponse.json({ mode: "live", cached, report: value }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && !("status" in error)) return NextResponse.json({ error: "IG_PULSE_FAILED", message: error.message }, { status: 502, headers: noStore });
    return errorResponse(error, "Instagram 해시태그 스캔에 실패했습니다.");
  }
}
