import { NextResponse } from "next/server";
import { z } from "zod";
import { trendContextSchema } from "@/lib/schemas";
import { analyzeCollision, COLLISION_PROMPT_VERSION } from "@/lib/openai-insight";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { requirePaidAccess } from "@/lib/api-access";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  trends: z.array(trendContextSchema.extend({ dna: trendContextSchema.shape.dna.unwrap() })).min(2).max(4),
  similarities: z.array(z.object({ a: z.string(), b: z.string(), cosine: z.number().min(-1).max(1) })).max(12).default([]),
  force: z.boolean().default(false),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 400_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  let access;
  try { access = await requirePaidAccess(request); } catch (error) { return errorResponse(error); }
  const { trends, similarities, force } = parsed.data;
  const cacheKey = hashKey({ v: COLLISION_PROMPT_VERSION, trends: trends.map((trend) => [trend.key, trend.analyzedAt, trend.dna.dominantPattern.title]) });
  try {
    const { value, cached } = await runGuarded(access.clientKey, cacheKey, 24 * 60 * 60 * 1000, () => analyzeCollision(trends, similarities), { bypassCache: force });
    return NextResponse.json({ mode: "live", cached, analyzedAt: new Date().toISOString(), promptVersion: COLLISION_PROMPT_VERSION, ...value }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "Collision 분석에 실패했습니다.");
  }
}
