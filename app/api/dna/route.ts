import { NextResponse } from "next/server";
import { z } from "zod";
import { evidenceItemSchema, seriesStatsSchema, trendAnalysisSchema } from "@/lib/schemas";
import { analyzeDnaWithOpenAI, TREND_DNA_PROMPT_VERSION } from "@/lib/openai-dna";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { clientKeyFrom } from "@/lib/rate-limit";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  trend: z.string().trim().min(1).max(100),
  why: trendAnalysisSchema.partial().passthrough(),
  evidence: z.array(evidenceItemSchema).min(1).max(40),
  signalStats: z.array(seriesStatsSchema).max(5).optional(),
  force: z.boolean().default(false),
});

const DNA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  const { trend, why, evidence, signalStats, force } = parsed.data;
  if (!why.origin && !why.triggers) return NextResponse.json({ error: "WHY_REQUIRED", message: "LIVE WHY 결과가 있어야 DNA를 분석할 수 있습니다." }, { status: 422, headers: noStore });
  const cacheKey = hashKey({ v: TREND_DNA_PROMPT_VERSION, trend, why, evidence: evidence.map((item) => item.id) });
  try {
    const { value, cached } = await runGuarded(clientKeyFrom(request), cacheKey, DNA_CACHE_TTL_MS, () => analyzeDnaWithOpenAI({ trend, why, evidence, stats: signalStats }), { bypassCache: force });
    return NextResponse.json({ mode: "live", cached, ...value }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "DNA 분석에 실패했습니다.");
  }
}
