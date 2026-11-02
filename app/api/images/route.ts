import { NextResponse } from "next/server";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { requirePaidAccess } from "@/lib/api-access";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { imageRequestSchema } from "@/lib/image-assets";
import { generateImage } from "@/lib/openai-image";

export const dynamic = "force-dynamic";

/*
 * AI 이미지 1장. Creative Collision(purpose=concept → AI CONCEPT VISUAL)과 Content Studio(cover·body·thumbnail·background → AI PRODUCTION ASSET)가 함께 쓴다.
 * 사용자가 버튼을 눌렀을 때만 호출된다. 비용 가중치 3, 같은 설정은 7일 캐시. 실제 증거 이미지가 아니다.
 */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 12_000); } catch (error) { return errorResponse(error); }
  const parsed = imageRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  let access;
  try { access = await requirePaidAccess(request); } catch (error) { return errorResponse(error); }
  const { force, ...settings } = parsed.data;
  const status = settings.purpose === "concept" ? "AI CONCEPT VISUAL" : "AI PRODUCTION ASSET";
  try {
    const { value, cached } = await runGuarded(access.clientKey, hashKey({ v: "ai-image-v2", ...settings }), 7 * 24 * 60 * 60 * 1000, () => generateImage({ ...settings, force: false }), { bypassCache: force, cost: 3 });
    return NextResponse.json({ kind: status, status, cached, createdAt: new Date().toISOString(), mimeType: "image/jpeg", aspect: settings.aspect, purpose: settings.purpose, ...value }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "이미지 생성에 실패했습니다.");
  }
}
