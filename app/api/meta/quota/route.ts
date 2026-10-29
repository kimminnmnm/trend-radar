import { assertExternalRate } from "@/lib/ai-guard";
import { requirePaidAccess } from "@/lib/api-access";
import { errorResponse, noStore } from "@/lib/api-response";
import { getHashtagQuotaStatus } from "@/lib/meta";

export const dynamic = "force-dynamic";

/** 최근 조회 목록 확인은 새 해시태그 검색이 아니며 주간 고유 태그 한도를 소진하지 않는다. */
export async function GET(request: Request) {
  try {
    const access = await requirePaidAccess(request);
    assertExternalRate(access.clientKey);
    return Response.json(await getHashtagQuotaStatus(), { headers: noStore });
  } catch (error) {
    return errorResponse(error, "Instagram 해시태그 한도를 확인하지 못했습니다.");
  }
}
