import { NextResponse } from "next/server";
import { z } from "zod";
import { collisionSchema, trendContextSchema } from "@/lib/schemas";
import { LAB_PROMPT_VERSION, reviewOpportunity } from "@/lib/openai-insight";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { requirePaidAccess } from "@/lib/api-access";

export const dynamic = "force-dynamic";

const text = (max: number) => z.string().trim().max(max);
const requestSchema = z.object({
  trends: z.array(trendContextSchema).min(1).max(4),
  collision: collisionSchema.optional(),
  brief: z.object({ brand: text(80).min(1), description: text(500), audience: text(200), platform: text(40), opportunity: text(300) }),
  force: z.boolean().default(false),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 400_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  let access;
  try { access = await requirePaidAccess(request); } catch (error) { return errorResponse(error); }
  const { trends, collision, brief, force } = parsed.data;
  const cacheKey = hashKey({ v: LAB_PROMPT_VERSION, trends: trends.map((trend) => [trend.key, trend.analyzedAt]), collision: collision?.title, brief });
  try {
    const { value, cached } = await runGuarded(access.clientKey, cacheKey, 12 * 60 * 60 * 1000, () => reviewOpportunity(trends, collision, brief), { bypassCache: force });
    return NextResponse.json({ mode: "live", cached, analyzedAt: new Date().toISOString(), promptVersion: LAB_PROMPT_VERSION, ...value }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "Trend Lab 검토에 실패했습니다.");
  }
}
