import { NextResponse } from "next/server";
import { z } from "zod";
import { assertExternalRate, readJsonBody } from "@/lib/ai-guard";
import { requirePaidAccess } from "@/lib/api-access";
import { errorResponse } from "@/lib/api-response";
import { MetaGraphError, searchInstagramHashtag } from "@/lib/meta";
import { safeInstagramMediaUrl, safeInstagramPermalink, type InstagramImage } from "@/lib/visual-media";

export const dynamic = "force-dynamic";

/*
 * Instagram 사진 다시 받기. WHY 화면 버튼, 또는 Overview·Discover에서 사진 없는 분석 카드를 채울 때 호출된다.
 * - 이미 조회한 해시태그만 재조회한다(allowNew 없음 → 새 해시태그는 그 태그만 실패, 주간 한도를 쓰지 않음). 결과는 기존 해시태그 캐시를 공유한다.
 * - 공식 Graph API의 media_url만 쓴다(스크래핑·임베드 없음). 사진 파일은 받지 않고 URL만 돌려준다(복제 저장 없음).
 * - 계정 아이디·캡션은 응답에 넣지 않는다. VIDEO는 media_url이 영상 파일이라 제외한다.
 * - 한 요청에 해시태그 최대 12개(분당 외부 요청 한도는 요청 단위로 1회 소모).
 */
const MAX_TAGS = 12;
const requestSchema = z.union([
  z.object({ hashtag: z.string().trim().min(1).max(100) }).transform((value) => [value.hashtag]),
  z.object({ hashtags: z.array(z.string().trim().min(1).max(100)).min(1).max(MAX_TAGS) }).transform((value) => [...new Set(value.hashtags)]),
]);
type MediaLike = { permalink?: string; media_url?: string; media_type?: string; timestamp?: string };

const pick = (edge: InstagramImage["edge"]) => (item: MediaLike): InstagramImage | null => {
  const permalink = safeInstagramPermalink(item.permalink);
  const imageUrl = item.media_type !== "VIDEO" ? safeInstagramMediaUrl(item.media_url) : null;
  return permalink && imageUrl ? { permalink, imageUrl, mediaType: item.media_type ?? "IMAGE", timestamp: item.timestamp, edge } : null;
};

async function fetchTag(hashtag: string) {
  try {
    const result = await searchInstagramHashtag(hashtag);
    const images = [...result.topMedia.map(pick("top_media")), ...result.recentMedia.map(pick("recent_media"))].filter((item): item is InstagramImage => item !== null);
    return { hashtag, ok: true as const, collectedAt: result.collectedAt, cached: result.cache.hit, images };
  } catch (error) {
    // 인증·한도 문제는 모든 태그에 같으므로 요청 전체를 실패로 돌린다. 새 해시태그 등 태그별 문제는 그 태그만 실패.
    if (error instanceof MetaGraphError && ["META_NOT_CONFIGURED", "META_TOKEN_EXPIRED", "META_RATE_LIMITED", "META_PERMISSION_ERROR", "META_APPROVAL_PENDING", "META_IG_USER_NOT_FOUND"].includes(error.reason ?? "")) throw error;
    return { hashtag, ok: false as const, error: error instanceof MetaGraphError ? error.reason : "META_GRAPH_ERROR", message: error instanceof Error ? error.message : "Instagram 사진을 받지 못했습니다." };
  }
}

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await readJsonBody(request, 4_000));
    if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", message: `해시태그를 1~${MAX_TAGS}개 보내세요.` }, { status: 400 });
    const access = await requirePaidAccess(request);
    assertExternalRate(access.clientKey);
    const results = [];
    for (const tag of parsed.data) results.push(await fetchTag(tag)); // 순차 호출로 Meta 요청을 몰아서 보내지 않는다.
    const first = results[0];
    // 단일 해시태그 요청(WHY 화면)은 기존 응답 형태를 유지한다.
    if (results.length === 1 && first.ok) return NextResponse.json({ hashtag: first.hashtag, collectedAt: first.collectedAt, cached: first.cached, images: first.images, results }, { headers: { "Cache-Control": "no-store" } });
    if (results.length === 1 && !first.ok) return NextResponse.json({ error: first.error, message: first.message, results }, { status: 409, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Instagram 사진을 다시 받지 못했습니다.");
  }
}
