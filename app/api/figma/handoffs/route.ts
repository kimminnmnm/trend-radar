import { readJsonBody } from "@/lib/ai-guard";
import { requireUser } from "@/lib/api-access";
import { HANDOFF_MAX_CHARS, handoffExportSchema } from "@/lib/figma-handoff";
import { createHandoff, handoffErrorResponse, json, limit, limits, listHandoffs, pluginToken, preflight } from "@/lib/figma-handoff-server";

export const dynamic = "force-dynamic";

/*
 * POST (웹 Content Studio, Supabase 로그인): Figma 디자인 데이터를 검증해 작업(Handoff)으로 저장한다. 비용 있는 API 호출 없음.
 * GET  (Figma 플러그인, 플러그인 토큰): 내 최근 작업 목록(payload 없음).
 */
export const OPTIONS = preflight;

export async function POST(request: Request) {
  try {
    const { user, token } = await requireUser(request);
    limit(limits.create, user.id);
    const body = await readJsonBody(request, HANDOFF_MAX_CHARS) as { export?: unknown } | null;
    const parsed = handoffExportSchema.safeParse(body?.export);
    if (!parsed.success) return json({ error: "INVALID_REQUEST", message: parsed.error.issues[0]?.message ?? "Figma 디자인 데이터 형식이 올바르지 않습니다.", issues: parsed.error.issues.slice(0, 5) }, 400);
    return json(await createHandoff(token, user.id, parsed.data), 201);
  } catch (error) {
    if ((error as { code?: string }).code === "PAYLOAD_TOO_LARGE") return json({ error: "PAYLOAD_TOO_LARGE", message: "디자인 데이터가 너무 큽니다(5MB). 이미지를 계정에 저장한 뒤 다시 보내세요." }, 413);
    return handoffErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const tokenHash = pluginToken(request);
    limit(limits.pluginRead, tokenHash);
    return json({ handoffs: await listHandoffs(tokenHash) }, 200, true);
  } catch (error) { return handoffErrorResponse(error, true); }
}
