import { NextResponse } from "next/server";
import { z } from "zod";
import { assertExternalRate, hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { requirePaidAccess } from "@/lib/api-access";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { CONNECTION_VERSION } from "@/lib/discovery";
import { discoverConnections } from "@/lib/openai-discovery";

export const dynamic = "force-dynamic";

/*
 * T3 두 키워드의 실제 연결 탐색: 행동이 들어간 검색어로 확장 → YouTube·웹에서 두 개념이 함께 나오는 자료 → 방향별 현상으로 분리 →
 * 서버가 관측된 연결 / 떠오르는 신호 / 창의적 가설로 판정. OpenAI 3회 · YouTube 최대 2회. 같은 조합·기간은 12시간 캐시.
 */
const requestSchema = z.object({ a: z.string().trim().min(1).max(60), b: z.string().trim().min(1).max(60), days: z.number().int().min(3).max(365).default(90), context: z.string().trim().max(200).default(""), force: z.boolean().default(false) })
  .refine((value) => value.a.toLowerCase() !== value.b.toLowerCase(), { message: "서로 다른 두 키워드를 고르세요." });

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 2_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  let access;
  try { access = await requirePaidAccess(request); assertExternalRate(access.clientKey); } catch (error) { return errorResponse(error); }
  const { a, b, days, context, force } = parsed.data;
  try {
    const { value, cached } = await runGuarded(access.clientKey, hashKey({ v: CONNECTION_VERSION, pair: [a.toLowerCase(), b.toLowerCase()], days, context, day: new Date().toISOString().slice(0, 10) }), 12 * 60 * 60 * 1000, () => discoverConnections(a, b, days, context), { bypassCache: force, cost: 4 });
    return NextResponse.json({ cached, promptVersion: CONNECTION_VERSION, ...value }, { headers: noStore });
  } catch (error) { return errorResponse(error, "연결 탐색에 실패했습니다."); }
}
