import { clientKeyFrom } from "@/lib/rate-limit";
import { PAIRING_TTL_MINUTES } from "@/lib/figma-handoff";
import { handoffErrorResponse, json, limit, limits, preflight, startPairing } from "@/lib/figma-handoff-server";

export const dynamic = "force-dynamic";

/*
 * Figma 플러그인 연결 시작(로그인 없음). Figma 공식 "OAuth with plugins" 방식:
 * 서버가 읽기/쓰기 키를 만들고, 플러그인은 쓰기 키로 TREND RADAR 연결 페이지를 열고 읽기 키로 결과를 폴링한다. 각 키는 한 번만 쓰인다.
 */
export const OPTIONS = preflight;

export async function POST(request: Request) {
  try {
    limit(limits.pairStart, clientKeyFrom(request));
    const { readKey, writeKey } = await startPairing();
    // 쓰기 키는 주소의 # 뒤에 둔다(서버 로그·Referer로 전달되지 않음).
    return json({ readKey, connectUrl: `${new URL(request.url).origin}/figma/connect#key=${writeKey}`, expiresInSec: PAIRING_TTL_MINUTES * 60 }, 201, true);
  } catch (error) { return handoffErrorResponse(error, true); }
}
