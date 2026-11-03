import { NextResponse } from "next/server";
import { z } from "zod";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { requirePaidAccess } from "@/lib/api-access";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { CREATIVE_PROMPT_VERSION, creativeTrendInputSchema, ideaTypes, inputReport } from "@/lib/creative-collision";
import { generateCreativeCollision } from "@/lib/openai-creative";

export const dynamic = "force-dynamic";

/*
 * V4.5 Creative Collision 생성. 클라이언트에 저장된 WHY·DNA·Visual DNA·관계 결과를 그대로 받는다(재분석 없음).
 * OpenAI 1회(비용 가중치 2), 같은 입력은 24시간 캐시. "다시 생성"은 force로 캐시를 우회한다.
 */
const requestSchema = z.object({
  a: creativeTrendInputSchema,
  b: creativeTrendInputSchema,
  relation: z.object({ type: z.string().max(60), score: z.number().min(0).max(1).nullable(), sharedAttributes: z.array(z.string().max(120)).max(12), signals: z.number().int().min(0).max(50), selectedConnectionId: z.string().max(160).optional(), selectedPhenomenon: z.string().max(200).optional(), subject: z.string().max(80).optional(), action: z.string().max(80).optional(), object: z.string().max(120).optional(), direction: z.string().max(100).optional(), culturalContext: z.string().max(500).optional(), evidenceIds: z.array(z.string().max(80)).max(24).optional(), verificationStatus: z.string().max(60).optional() }).nullable().default(null),
  prior: z.object({ title: z.string().max(200), opportunities: z.array(z.string().max(400)).max(6), tensions: z.array(z.string().max(400)).max(6) }).nullable().default(null),
  focusType: z.enum(ideaTypes).optional(),
  force: z.boolean().default(false),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 200_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  const { a, b, relation, prior, focusType, force } = parsed.data;
  if (a.key === b.key) return NextResponse.json({ error: "SAME_TREND", message: "서로 다른 두 트렌드를 고르세요." }, { status: 400, headers: noStore });
  if (!a.why && !a.dna) return NextResponse.json({ error: "INSUFFICIENT_INPUT", message: `${a.name}에 WHY·DNA 결과가 없어 아이디어를 만들 수 없습니다.` }, { status: 422, headers: noStore });
  if (!b.why && !b.dna) return NextResponse.json({ error: "INSUFFICIENT_INPUT", message: `${b.name}에 WHY·DNA 결과가 없어 아이디어를 만들 수 없습니다.` }, { status: 422, headers: noStore });
  let access;
  try { access = await requirePaidAccess(request); } catch (error) { return errorResponse(error); }
  const inputs = inputReport(a, b, relation, prior);
  const cacheKey = hashKey({ v: CREATIVE_PROMPT_VERSION, a, b, relation, prior, focusType: focusType ?? null });
  try {
    const { value, cached } = await runGuarded(access.clientKey, cacheKey, 24 * 60 * 60 * 1000, () => generateCreativeCollision(a, b, relation, prior, inputs.missing, focusType), { bypassCache: force, cost: 2 });
    return NextResponse.json({ mode: "live", cached, analyzedAt: new Date().toISOString(), promptVersion: CREATIVE_PROMPT_VERSION, inputs, ...value }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "Creative Collision 생성에 실패했습니다.");
  }
}
