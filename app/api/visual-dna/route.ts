import { NextResponse } from "next/server";
import { z } from "zod";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { requirePaidAccess } from "@/lib/api-access";
import { analyzeVisualDnaWithOpenAI } from "@/lib/visual-dna-analysis";
import { VISUAL_DNA_MAX_IMAGES, VISUAL_DNA_PROMPT_VERSION } from "@/lib/visual-dna";
import { safeYouTubeThumbnail, youtubeIdFromUrl } from "@/lib/visual-media";

export const dynamic = "force-dynamic";

/*
 * V3 Visual DNA: 실제 YouTube 썸네일(최대 6장, 저해상도)을 OpenAI 비전으로 분석한다.
 * 서버가 다시 검사한다: YouTube 영상 URL·i.ytimg.com 썸네일·platform-embed만 허용(클라이언트가 보낸 다른 이미지는 버림).
 * 유료 호출은 기존 보호(접근 제어·분당/일일 상한·결과 캐시)를 그대로 거치며, 이미지 분석은 비용 가중치 2로 센다.
 */
const mediaSchema = z.object({
  mediaId: z.string().max(200), platform: z.string(), sourceUrl: z.string().max(800), thumbnailUrl: z.string().max(1200).nullable(),
  title: z.string().max(300), evidenceIds: z.array(z.string().max(40)).max(10), usageRights: z.string(),
});
const requestSchema = z.object({ trend: z.string().trim().min(1).max(100), media: z.array(mediaSchema).min(1).max(12), force: z.boolean().default(false) });
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 40_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  const { trend, force } = parsed.data;
  const media = parsed.data.media
    .filter((item) => item.platform === "youtube" && item.usageRights === "platform-embed" && youtubeIdFromUrl(item.sourceUrl) && safeYouTubeThumbnail(item.thumbnailUrl) && item.mediaId === `youtube:${youtubeIdFromUrl(item.sourceUrl)}`)
    .slice(0, VISUAL_DNA_MAX_IMAGES)
    .map((item) => ({ ...item, platform: "youtube" as const, usageRights: "platform-embed" as const }));
  if (!media.length) return NextResponse.json({ error: "VISUAL_DNA_NO_IMAGES", message: "분석할 수 있는 실제 이미지가 없습니다. Visual DNA는 YouTube 썸네일이 있는 분석에서만 만듭니다." }, { status: 422, headers: noStore });
  let access;
  try { access = await requirePaidAccess(request); } catch (error) { return errorResponse(error); }
  const cacheKey = hashKey({ v: VISUAL_DNA_PROMPT_VERSION, trend, media: media.map((item) => [item.mediaId, item.thumbnailUrl]) });
  try {
    const { value, cached } = await runGuarded(access.clientKey, cacheKey, CACHE_TTL_MS, async () => ({ ...(await analyzeVisualDnaWithOpenAI(trend, media)), analyzedAt: new Date().toISOString() }), { bypassCache: force, cost: 2 });
    return NextResponse.json({ mode: "live", cached, result: value.dna, validation: value.validation, model: value.model, promptVersion: value.promptVersion, analyzedAt: value.analyzedAt, media }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "Visual DNA 분석에 실패했습니다.");
  }
}
