import { NextResponse } from "next/server";
import { z } from "zod";
import { IG_PULSE_PROMPT_VERSION, MAX_TAGS_PER_SCAN, scanIgPulse, type IgPulseProgress } from "@/lib/ig-pulse";
import { hashKey, readJsonBody, runGuarded } from "@/lib/ai-guard";
import { errorResponse, invalidRequest, noStore } from "@/lib/api-response";
import { requirePaidAccess } from "@/lib/api-access";

export const dynamic = "force-dynamic";

const tag = z.string().trim().min(1).max(60);
const requestSchema = z.object({
  force: z.boolean().default(false),
  discover: z.boolean().default(false),
  allowNew: z.boolean().default(false),
  track: z.array(tag).max(MAX_TAGS_PER_SCAN).default([]),
  add: z.array(tag).max(3).default([]),
  /** 지난 스캔에서 한도 때문에 재지 못한 신규 후보(브라우저가 보관). 신규 검색 승인 시에만 쓴다. 출처는 표시용이다. */
  queue: z.array(z.object({
    tag, keyword: z.string().max(80).optional(), category: z.string().max(60).optional(), summary: z.string().max(400).optional(),
    sources: z.array(z.object({ url: z.string().url().max(500).refine((url) => /^https?:\/\//.test(url)), title: z.string().max(200).optional() })).max(2).optional(),
  })).max(20).default([]),
  /** true면 진행 단계를 줄 단위 JSON(NDJSON)으로 보낸 뒤 마지막 줄에 결과를 보낸다. */
  stream: z.boolean().default(false),
});
const PULSE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** 웹 검색 최대 1회 + 태그당 Meta 호출 최대 7회. 같은 요청은 6시간 재사용한다. */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonBody(request, 4_000); } catch (error) { return errorResponse(error); }
  const parsed = requestSchema.safeParse(body ?? {});
  if (!parsed.success) return invalidRequest(parsed.error.issues);
  let access;
  try { access = await requirePaidAccess(request); } catch (error) { return errorResponse(error); }
  const { force, stream, ...input } = parsed.data;
  const cacheKey = hashKey({ v: IG_PULSE_PROMPT_VERSION, day: new Date().toISOString().slice(0, 10), discover: input.discover, allowNew: input.allowNew, track: [...input.track].sort(), add: [...input.add].sort(), queue: input.queue.map((item) => item.tag).sort() });
  const run = (onProgress?: (event: IgPulseProgress) => void) => runGuarded(access.clientKey, cacheKey, PULSE_CACHE_TTL_MS, () => scanIgPulse(input, onProgress), { bypassCache: force });
  if (stream) {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        try {
          const { value, cached } = await run((event) => send({ type: "progress", ...event }));
          send({ type: "result", mode: "live", cached, report: value });
        } catch (error) {
          // 스트림은 이미 200으로 시작했으므로 오류는 마지막 줄로 알린다(상태 코드·메시지는 일반 응답과 같게).
          const failure = error instanceof Error && !("status" in error) ? { status: 502, body: { error: "IG_PULSE_FAILED", message: error.message } } : await (async () => { const response = errorResponse(error, "Instagram 해시태그 스캔에 실패했습니다."); return { status: response.status, body: await response.json() }; })();
          send({ type: "error", status: failure.status, ...failure.body });
        }
        controller.close();
      },
    });
    return new Response(body, { headers: { ...noStore, "Content-Type": "application/x-ndjson; charset=utf-8" } });
  }
  try {
    const { value, cached } = await run();
    return NextResponse.json({ mode: "live", cached, report: value }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && !("status" in error)) return NextResponse.json({ error: "IG_PULSE_FAILED", message: error.message }, { status: 502, headers: noStore });
    return errorResponse(error, "Instagram 해시태그 스캔에 실패했습니다.");
  }
}
