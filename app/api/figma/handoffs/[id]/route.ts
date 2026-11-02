import { getHandoff, handoffErrorResponse, json, limit, limits, markImported, pluginToken, preflight } from "@/lib/figma-handoff-server";

export const dynamic = "force-dynamic";

/** Figma 플러그인 전용. GET: 작업 하나(디자인 데이터). POST: Figma에서 만들었다고 기록. 다른 사용자 작업은 404, 만료는 410. */
export const OPTIONS = preflight;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const tokenHash = pluginToken(request);
    limit(limits.pluginRead, tokenHash);
    const { id } = await ctx.params;
    return json({ handoff: await getHandoff(tokenHash, id) }, 200, true);
  } catch (error) { return handoffErrorResponse(error, true); }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const tokenHash = pluginToken(request);
    limit(limits.pluginRead, tokenHash);
    const { id } = await ctx.params;
    return json({ importCount: await markImported(tokenHash, id) }, 200, true);
  } catch (error) { return handoffErrorResponse(error, true); }
}
