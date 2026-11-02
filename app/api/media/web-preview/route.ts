import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { z } from "zod";
import { assertExternalRate, readJsonBody } from "@/lib/ai-guard";
import { requirePaidAccess } from "@/lib/api-access";
import { errorResponse } from "@/lib/api-response";
import { extractPreviewImage, isPrivateAddress, safeHttpsUrl } from "@/lib/visual-media";

export const dynamic = "force-dynamic";

/*
 * V1 웹 출처 대표 이미지(og:image) 확인. 사용자가 버튼을 눌렀을 때만 호출된다.
 * - 대상은 WHY 근거 원장의 웹 출처 URL(최대 6개). 페이지 HTML의 meta 태그만 읽고 이미지 파일은 받지 않는다(복제 저장 없음).
 * - SSRF 방지: https·443만, DNS 조회 결과가 사설/루프백/링크로컬이면 거부, 리다이렉트는 매 단계 재검증(최대 3회),
 *   HTML만 허용, 300KB·5초 제한. (DNS 재바인딩을 완전히 막지는 못한다. 문서의 위험 항목 참고)
 * - 기존 접근 제어(PAID_API_ACCESS)와 외부 호출 분당 제한을 그대로 적용한다. OpenAI 등 유료 API는 호출하지 않는다.
 */
const MAX_URLS = 6, MAX_BYTES = 300_000, TIMEOUT_MS = 5_000, MAX_REDIRECTS = 3, TTL_MS = 24 * 60 * 60 * 1000;
const requestSchema = z.object({ urls: z.array(z.string().max(800)).min(1).max(MAX_URLS) });
type Result = { url: string; image: string | null; status: "found" | "none" | "blocked" | "error"; message?: string };
const cache = new Map<string, { expiresAt: number; value: Result }>();

async function publicHost(url: string) {
  const host = new URL(url).hostname;
  const addresses = await lookup(host, { all: true, verbatim: true });
  return addresses.length > 0 && addresses.every((entry) => !isPrivateAddress(entry.address));
}

async function readHtml(response: Response) {
  const type = response.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml\+xml/i.test(type)) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).subarray(0, MAX_BYTES));
}

async function preview(input: string): Promise<Result> {
  const start = safeHttpsUrl(input);
  if (!start) return { url: input, image: null, status: "blocked", message: "https 공개 주소만 확인합니다." };
  const cached = cache.get(start);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let url = start;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!(await publicHost(url))) return { url: start, image: null, status: "blocked", message: "사설·내부 주소로 연결되는 URL은 확인하지 않습니다." };
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "TrendRadarPreview/1.0 (+og:image metadata only)", accept: "text/html,application/xhtml+xml" } });
      if (response.status >= 300 && response.status < 400) {
        const next = safeHttpsUrl(new URL(response.headers.get("location") ?? "", url).toString());
        await response.body?.cancel().catch(() => undefined);
        if (!next) return { url: start, image: null, status: "blocked", message: "안전하지 않은 주소로 리다이렉트됩니다." };
        url = next;
        continue;
      }
      if (!response.ok) { await response.body?.cancel().catch(() => undefined); return { url: start, image: null, status: "error", message: `페이지 응답 ${response.status}` }; }
      const html = await readHtml(response);
      const image = html ? extractPreviewImage(html, url) : null;
      const value: Result = image ? { url: start, image, status: "found" } : { url: start, image: null, status: "none", message: "페이지에 대표 이미지(og:image)가 없습니다." };
      cache.set(start, { expiresAt: Date.now() + TTL_MS, value });
      return value;
    }
    return { url: start, image: null, status: "blocked", message: "리다이렉트가 너무 많습니다." };
  } catch {
    return { url: start, image: null, status: "error", message: "페이지를 확인하지 못했습니다." };
  }
}

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await readJsonBody(request, 20_000));
    if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", message: `웹 출처 URL을 1~${MAX_URLS}개 보내세요.` }, { status: 400 });
    const access = await requirePaidAccess(request);
    assertExternalRate(access.clientKey);
    const results = await Promise.all(parsed.data.urls.map(preview));
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "웹 출처 대표 이미지를 확인하지 못했습니다.");
  }
}
