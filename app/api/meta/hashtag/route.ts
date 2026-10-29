import { MetaGraphError, searchInstagramHashtag } from "@/lib/meta";
import { checkMetaSearchRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const rateLimit = checkMetaSearchRateLimit(clientKey);
  const rateHeaders = { "Cache-Control": "private, no-store", "X-RateLimit-Remaining": String(rateLimit.remaining), "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)) };
  if (!rateLimit.allowed) return Response.json({ error: "META_LOCAL_RATE_LIMIT", message: "Instagram 검색 요청이 너무 많습니다. 1분 후 다시 시도하세요." }, { status: 429, headers: rateHeaders });
  try {
    const query = new URL(request.url).searchParams.get("query") || "";
    const result = await searchInstagramHashtag(query);
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
