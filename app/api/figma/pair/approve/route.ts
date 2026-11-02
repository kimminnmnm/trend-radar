import { readJsonBody } from "@/lib/ai-guard";
import { requireUser } from "@/lib/api-access";
import { approvePairing, handoffErrorResponse, json, limit, limits } from "@/lib/figma-handoff-server";

export const dynamic = "force-dynamic";

/** 웹(로그인 사용자)이 Figma 플러그인 연결을 허용한다. 토큰은 30일 유효, 해시로만 저장된다. */
export async function POST(request: Request) {
  try {
    const { user, token } = await requireUser(request);
    limit(limits.create, user.id);
    const body = await readJsonBody(request, 400) as { writeKey?: unknown } | null;
    const writeKey = typeof body?.writeKey === "string" && /^[A-Za-z0-9_-]{24,64}$/.test(body.writeKey) ? body.writeKey : null;
    if (!writeKey) return json({ error: "INVALID_REQUEST", message: "연결 키가 올바르지 않습니다. 플러그인에서 다시 연결하세요." }, 400);
    await approvePairing(token, writeKey);
    return json({ ok: true });
  } catch (error) { return handoffErrorResponse(error); }
}
