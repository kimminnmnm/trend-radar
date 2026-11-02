import { readJsonBody } from "@/lib/ai-guard";
import { clientKeyFrom } from "@/lib/rate-limit";
import { claimPairing, handoffErrorResponse, json, limit, limits, preflight } from "@/lib/figma-handoff-server";

export const dynamic = "force-dynamic";

/** 플러그인이 읽기 키로 연결 결과를 확인한다. 허용 전이면 pending, 허용되면 토큰을 한 번만 돌려준다. */
export const OPTIONS = preflight;

export async function POST(request: Request) {
  try {
    limit(limits.pairPoll, clientKeyFrom(request));
    const body = await readJsonBody(request, 400) as { readKey?: unknown } | null;
    const readKey = typeof body?.readKey === "string" && /^[A-Za-z0-9_-]{24,64}$/.test(body.readKey) ? body.readKey : null;
    if (!readKey) return json({ error: "INVALID_REQUEST", message: "연결 키가 올바르지 않습니다." }, 400, true);
    const token = await claimPairing(readKey);
    return json(token ? { status: "connected", token } : { status: "pending" }, 200, true);
  } catch (error) { return handoffErrorResponse(error, true); }
}
