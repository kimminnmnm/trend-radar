import { NextResponse } from "next/server";
import { z } from "zod";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { requirePaidAccess } from "@/lib/api-access";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { creativeConceptSchema, PRODUCTION_PROMPT_VERSION, productionSettingsSchema } from "@/lib/content-production";
import { imageStatuses } from "@/lib/image-assets";
import { createProductionPlan } from "@/lib/openai-production";
import { contentAngleSchema } from "@/lib/editorial";
import { trendContextSchema } from "@/lib/schemas";
import { editorialContextLockSchema } from "@/lib/editorial-lock";

export const dynamic = "force-dynamic";

/*
 * C3 Content Studio 제작 기획(카드뉴스·숏폼). 단일 트렌드와 Creative Collision 아이디어가 같은 엔진을 쓴다.
 * OpenAI 1회, 같은 입력 12시간 캐시. 근거 ID·이미지 참조는 서버가 다시 검증한다.
 */
const requestSchema = z.object({
  trends: z.array(trendContextSchema).max(2).default([]),
  concept: creativeConceptSchema.optional(),
  settings: productionSettingsSchema,
  assets: z.array(z.object({ id: z.string().max(160), status: z.enum(imageStatuses), title: z.string().max(200) })).max(30).default([]),
  /** E2: 사용자가 고른 콘텐츠 방향. TREND REPORT는 방향 없이도 만들 수 있다. */
  angle: contentAngleSchema.optional(),
  /** ENGINE V2: 사용자가 직접 입력한 주제(가장 우선). */
  customTopic: z.string().trim().max(200).default(""),
  /** ENGINE V2 5단계: 선택한 방향에 맞는 자료를 웹에서 추가 조사(웹 검색 1회 추가). */
  research: z.boolean().default(false),
  /** T6: 편집 맥락 잠금. 있으면 모든 슬라이드가 선택한 현상에 고정되고 품질 게이트가 이탈을 검사한다. */
  contextLock: editorialContextLockSchema.optional(),
  force: z.boolean().default(false),
}).refine((value) => value.trends.length > 0 || value.concept, { message: "트렌드 분석 또는 Creative Collision 아이디어가 필요합니다." })
  .refine((value) => value.settings.format !== "shortform" || value.settings.aspect === "9:16", { message: "숏폼은 9:16만 지원합니다." })
  .refine((value) => value.settings.format !== "cardnews" || value.settings.aspect !== "9:16", { message: "카드뉴스는 1:1 또는 4:5만 지원합니다." })
  .refine((value) => value.angle || (value.settings.mode ?? "editorial") === "report", { message: "콘텐츠 방향을 먼저 고르세요. (방향 없이 만들 수 있는 것은 TREND REPORT뿐입니다.)" });

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 450_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  let access;
  try { access = await requirePaidAccess(request); } catch (error) { return errorResponse(error); }
  const { trends, concept, settings, assets, angle, customTopic, research, force, contextLock } = parsed.data;
  const cacheKey = hashKey({ v: PRODUCTION_PROMPT_VERSION, trends: trends.map((trend) => [trend.key, trend.analyzedAt]), concept, settings, angle, customTopic, research, contextLock: contextLock ?? null, assets: assets.map((item) => item.id) });
  try {
    const { value, cached } = await runGuarded(access.clientKey, cacheKey, 12 * 60 * 60 * 1000, () => createProductionPlan(trends, concept, settings, assets, angle, customTopic, { research, lock: contextLock }), { bypassCache: force, cost: research ? 2 : 1 });
    return NextResponse.json({ mode: "live", cached, generatedAt: new Date().toISOString(), promptVersion: PRODUCTION_PROMPT_VERSION, ...value }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "콘텐츠 제작 기획 생성에 실패했습니다.");
  }
}
