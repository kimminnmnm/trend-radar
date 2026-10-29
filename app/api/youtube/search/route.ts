import { z } from "zod";
import { assertExternalRate, readJsonBody } from "@/lib/ai-guard";
import { requirePaidAccess } from "@/lib/api-access";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { collectYouTubeEvidence } from "@/lib/youtube";

export const dynamic = "force-dynamic";
const requestSchema = z.object({ query: z.string().trim().min(1).max(100), force: z.boolean().default(false) });

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 2_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  try {
    const access = await requirePaidAccess(request);
    assertExternalRate(access.clientKey);
    const result = await collectYouTubeEvidence(parsed.data.query, { force: parsed.data.force });
    return Response.json({ mode: "live", ...result }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "YouTube 영상 검색에 실패했습니다.");
  }
}
