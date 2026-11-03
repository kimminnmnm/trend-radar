import { NextResponse } from "next/server";
import { z } from "zod";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { requirePaidAccess } from "@/lib/api-access";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { creativeConceptSchema } from "@/lib/content-production";
import { ANGLE_PROMPT_VERSION, contentModes } from "@/lib/editorial";
import { createAngles } from "@/lib/openai-editorial";
import { trendContextSchema } from "@/lib/schemas";
import { editorialContextLockSchema } from "@/lib/editorial-lock";

export const dynamic = "force-dynamic";

/*
 * E2 콘텐츠 방향(Angle) 5개 제안. 카드뉴스를 바로 만들지 않고 방향부터 고르게 한다.
 * OpenAI 1회(뻔한 제목·방향 부족이면 1회만 재생성), 같은 입력 12시간 캐시. 근거 ID는 서버가 다시 검증한다.
 */
const requestSchema = z.object({
  trends: z.array(trendContextSchema).max(2).default([]),
  concept: creativeConceptSchema.optional(),
  mode: z.enum(contentModes),
  settings: z.object({ format: z.enum(["cardnews", "shortform"]), target: z.string().trim().max(200).default(""), goal: z.string().trim().max(200).default(""), tone: z.string().trim().max(200).default("") }),
  /** ENGINE V2: 사용자가 직접 입력한 주제. 있으면 5개 방향 모두 이 주제를 다룬다. */
  customTopic: z.string().trim().max(200).default(""),
  /** T6: 편집 맥락 잠금. 있으면 5개 방향 모두 선택한 현상을 다루고 금지 이탈을 피한다. */
  contextLock: editorialContextLockSchema.optional(),
  force: z.boolean().default(false),
}).refine((value) => value.trends.length > 0 || value.concept, { message: "트렌드 분석 또는 Creative Collision 아이디어가 필요합니다." })
  .refine((value) => value.mode !== "concept" || value.concept, { message: "CREATIVE CONCEPT 모드는 Creative Collision 아이디어가 필요합니다." });

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 450_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  let access;
  try { access = await requirePaidAccess(request); } catch (error) { return errorResponse(error); }
  const { trends, concept, mode, settings, customTopic, force, contextLock } = parsed.data;
  const cacheKey = hashKey({ v: ANGLE_PROMPT_VERSION, trends: trends.map((trend) => [trend.key, trend.analyzedAt]), concept, mode, settings, customTopic, contextLock: contextLock ?? null });
  try {
    const { value, cached } = await runGuarded(access.clientKey, cacheKey, 12 * 60 * 60 * 1000, () => createAngles(trends, concept, mode, settings, customTopic, contextLock), { bypassCache: force });
    return NextResponse.json({ cached, generatedAt: new Date().toISOString(), promptVersion: ANGLE_PROMPT_VERSION, mode, ...value }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "콘텐츠 방향 제안에 실패했습니다.");
  }
}
