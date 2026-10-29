import { NextResponse } from "next/server";
import { z } from "zod";
import { collisionSchema, labReviewSchema, trendContextSchema } from "@/lib/schemas";
import { createContentPlan, STUDIO_PROMPT_VERSION } from "@/lib/openai-insight";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { clientKeyFrom } from "@/lib/rate-limit";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const text = (max: number) => z.string().trim().max(max);
const requestSchema = z.object({
  trends: z.array(trendContextSchema).min(1).max(4),
  collision: collisionSchema.optional(),
  lab: labReviewSchema.optional(),
  brief: z.object({ platform: text(40).min(1), format: text(60).min(1), target: text(200), tone: text(200) }),
  force: z.boolean().default(false),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 450_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  const { trends, collision, lab, brief, force } = parsed.data;
  const cacheKey = hashKey({ v: STUDIO_PROMPT_VERSION, trends: trends.map((trend) => [trend.key, trend.analyzedAt]), collision: collision?.title, lab: lab?.overall.verdict, brief });
  try {
    const { value, cached } = await runGuarded(clientKeyFrom(request), cacheKey, 12 * 60 * 60 * 1000, () => createContentPlan(trends, collision, lab, brief), { bypassCache: force });
    return NextResponse.json({ mode: "live", cached, analyzedAt: new Date().toISOString(), promptVersion: STUDIO_PROMPT_VERSION, ...value }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "콘텐츠 기획안 생성에 실패했습니다.");
  }
}
