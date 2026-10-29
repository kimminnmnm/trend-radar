import { MetaGraphError, searchInstagramHashtag } from "@/lib/meta";
import { checkMetaSearchRateLimit } from "@/lib/rate-limit";
import { AccessError, requirePaidAccess } from "@/lib/api-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query") || "";
  const allowNew = new URL(request.url).searchParams.get("allowNew") === "1";
  // 형식 검사는 로그인 확인과 외부 호출보다 먼저 한다.
  const tag = query.replace(/^#/, "").trim();
  if (!tag || tag.length > 100 || !/^[\p{L}\p{N}_]+$/u.test(tag)) return Response.json({ error: "META_INVALID_HASHTAG", message: "해시태그는 # 없이 문자, 숫자, 밑줄만 입력하세요." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  let clientKey: string;
  try { clientKey = (await requirePaidAccess(request)).clientKey; }
  catch (error) { const access = error instanceof AccessError ? error : new AccessError("접근을 확인하지 못했습니다.", 503, "AUTH_UNAVAILABLE"); return Response.json({ error: access.code, message: access.message }, { status: access.status, headers: { "Cache-Control": "no-store" } }); }
  const rateLimit = checkMetaSearchRateLimit(clientKey);
  const rateHeaders = { "Cache-Control": "private, no-store", "X-RateLimit-Remaining": String(rateLimit.remaining), "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)) };
  if (!rateLimit.allowed) return Response.json({ error: "META_LOCAL_RATE_LIMIT", message: "Instagram 검색 요청이 너무 많습니다. 1분 후 다시 시도하세요." }, { status: 429, headers: rateHeaders });
  try {
    const result = await searchInstagramHashtag(query, { allowNew });
    return Response.json(result, { headers: rateHeaders });
  } catch (error) {
    const metaError = error instanceof MetaGraphError ? error : new MetaGraphError("Instagram 해시태그 검색에 실패했습니다.");
    const message = metaError.reason === "META_APPROVAL_PENDING"
      ? "Meta API 승인 대기 중"
      : metaError.reason === "META_PERMISSION_ERROR"
        ? "Meta API 권한이 부족합니다. 앱 권한과 계정 연결을 다시 확인하세요."
        : metaError.message;
    return Response.json({ error: metaError.reason, message, detail: metaError.reason === "META_APPROVAL_PENDING" ? "Instagram Public Content Access 심사 승인 후 자동으로 연결할 수 있습니다." : undefined, code: metaError.code }, { status: metaError.status, headers: rateHeaders });
  }
}
