import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-access";
import { handoffErrorResponse, json } from "@/lib/figma-handoff-server";
import { TemplateError, templateImage } from "@/lib/figma-templates-server";

export const dynamic = "force-dynamic";

/*
 * 템플릿 썸네일(?template=ID) 또는 렌더링 미리보기(?project=&slide=) PNG. 로그인한 본인 것만(RLS).
 * 공개·서명 링크를 만들지 않으므로 만료되는 링크가 없다. 브라우저는 요청할 때마다 로그인 토큰으로 다시 받는다.
 */
export async function GET(request: Request) {
  try {
    const { token } = await requireUser(request);
    const params = new URL(request.url).searchParams;
    const templateId = params.get("template"), projectId = params.get("project"), slideId = params.get("slide");
    let query: { templateId: string } | { projectId: string; slideId: string };
    if (templateId && /^TEMPLATE_(COVER|BODY|CTA)_\d{2}$/.test(templateId)) query = { templateId };
    else if (projectId && slideId && projectId.length <= 200 && slideId.length <= 200) query = { projectId, slideId };
    else return json({ error: "INVALID_REQUEST", message: "template 또는 project·slide가 필요합니다." }, 400);
    const image = await templateImage(token, query);
    if (!image) return json({ error: "NOT_FOUND", message: "이미지가 없습니다. Figma 플러그인에서 동기화·렌더링하세요." }, 404);
    return new NextResponse(new Uint8Array(image.bytes), { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", ETag: `"${image.etag}"`, "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof TemplateError) return json({ error: error.code, message: error.message }, error.status);
    return handoffErrorResponse(error);
  }
}
