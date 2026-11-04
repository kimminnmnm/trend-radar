import { readJsonBody } from "@/lib/ai-guard";
import { requireUser } from "@/lib/api-access";
import { handoffErrorResponse, json, limit, limits, pluginToken, preflight } from "@/lib/figma-handoff-server";
import { TEMPLATE_SYNC_MAX_CHARS, templateSyncRequestSchema } from "@/lib/figma-templates";
import { TemplateError, deleteTemplates, listPreviews, listTemplates, pluginTemplateAction, pluginTemplateHashes } from "@/lib/figma-templates-server";

export const dynamic = "force-dynamic";

/*
 * MY TEMPLATES 동기화·조회. 비용 있는 API 호출 없음.
 * POST   (Figma 플러그인, 플러그인 토큰): 템플릿 하나 동기화(sync/failed) · 마무리(finish) · 변경 감지(changes) · 렌더링 미리보기(preview).
 * GET    플러그인 토큰이면 저장된 디자인 지문, Supabase 로그인이면 내 템플릿 목록(썸네일 제외) + ?project=의 렌더링 미리보기 목록.
 * DELETE (웹, 로그인): 등록 해제 ?template=ID, 없으면 전부.
 */
export const OPTIONS = preflight;
const isPlugin = (request: Request) => /^Bearer\s+trp_/.test(request.headers.get("authorization") ?? "");
function errorResponse(error: unknown, cors: boolean) {
  if (error instanceof TemplateError) return json({ error: error.code, message: error.message }, error.status, cors);
  if ((error as { code?: string }).code === "PAYLOAD_TOO_LARGE") return json({ error: "PAYLOAD_TOO_LARGE", message: "썸네일이 너무 큽니다." }, 413, cors);
  return handoffErrorResponse(error, cors);
}

export async function POST(request: Request) {
  try {
    const tokenHash = pluginToken(request);
    limit(limits.pluginRead, tokenHash);
    const parsed = templateSyncRequestSchema.safeParse(await readJsonBody(request, TEMPLATE_SYNC_MAX_CHARS + 20_000));
    if (!parsed.success) return json({ error: "INVALID_REQUEST", message: parsed.error.issues[0]?.message ?? "템플릿 데이터 형식이 올바르지 않습니다." }, 400, true);
    return json(await pluginTemplateAction(tokenHash, parsed.data), 200, true);
  } catch (error) { return errorResponse(error, true); }
}

export async function GET(request: Request) {
  if (isPlugin(request)) {
    try {
      const tokenHash = pluginToken(request);
      limit(limits.pluginRead, tokenHash);
      return json({ templates: await pluginTemplateHashes(tokenHash) }, 200, true);
    } catch (error) { return errorResponse(error, true); }
  }
  try {
    const { token } = await requireUser(request);
    const project = new URL(request.url).searchParams.get("project");
    if (project !== null && (!project || project.length > 200)) return json({ error: "INVALID_REQUEST", message: "프로젝트 ID가 올바르지 않습니다." }, 400);
    const [templates, previews] = await Promise.all([listTemplates(token), project ? listPreviews(token, project) : Promise.resolve([])]);
    return json({ templates, previews });
  } catch (error) { return errorResponse(error, false); }
}

export async function DELETE(request: Request) {
  try {
    const { token } = await requireUser(request);
    const template = new URL(request.url).searchParams.get("template");
    if (template !== null && !/^TEMPLATE_(COVER|BODY|CTA)_\d{2}$/.test(template)) return json({ error: "INVALID_REQUEST", message: "템플릿 이름이 올바르지 않습니다." }, 400);
    return json({ deleted: await deleteTemplates(token, template ?? undefined) });
  } catch (error) { return errorResponse(error, false); }
}
