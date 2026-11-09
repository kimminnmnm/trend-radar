import "server-only";
import type { z } from "zod";

export class OpenAIAnalysisError extends Error {
  constructor(message: string, public readonly status = 502, public readonly code = "OPENAI_ANALYSIS_ERROR") { super(message); }
}

/** 429는 두 경우다: 계정 크레딧·월 한도 소진(insufficient_quota — 기다려도 안 풀림)과 짧은 시간 요청 몰림(rate limit — 잠시 뒤 재시도). */
export function rateLimitMessage(error?: { code?: string; type?: string }) {
  return error?.code === "insufficient_quota" || error?.type === "insufficient_quota"
    ? "OpenAI 계정의 크레딧 또는 월 사용 한도가 소진됐습니다. platform.openai.com → Billing에서 잔액과 한도를 확인하세요(기다려도 풀리지 않습니다)."
    : "OpenAI 요청이 잠시 한도를 넘었습니다. 1분쯤 뒤 다시 시도하세요.";
}

type ResponsesSource = { url?: string; title?: string };
type ResponsesBody = { output?: Array<{ type?: string; action?: { sources?: ResponsesSource[] }; content?: Array<{ type?: string; text?: string; refusal?: string; annotations?: ResponsesSource[] }> }> } & { error?: { message?: string; code?: string; type?: string }; output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }> };

function getApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new OpenAIAnalysisError("OPENAI_API_KEY가 설정되지 않았습니다.", 503, "OPENAI_NOT_CONFIGURED");
  return apiKey;
}

/** 웹 검색 도구가 실제로 조회·인용한 URL 목록 */
function collectSources(body: ResponsesBody) {
  const sources = new Map<string, { url: string; title?: string }>();
  for (const item of body.output ?? []) {
    for (const source of item.action?.sources ?? []) if (source.url) sources.set(source.url, { url: source.url, title: source.title ?? sources.get(source.url)?.title });
    for (const content of item.content ?? []) for (const annotation of content.annotations ?? []) if (annotation.url) sources.set(annotation.url, { url: annotation.url, title: annotation.title ?? sources.get(annotation.url)?.title });
  }
  return [...sources.values()];
}

export function getModel() { return process.env.OPENAI_MODEL?.trim() || "gpt-6-luna"; }

function extractOutputText(response: ResponsesBody) {
  if (response.output_text) return response.output_text;
  for (const item of response.output || []) for (const content of item.content || []) {
    if (content.type === "refusal") throw new OpenAIAnalysisError(content.refusal || "모델이 분석 요청을 거절했습니다.", 422, "OPENAI_REFUSAL");
    if (content.type === "output_text" && content.text) return content.text;
  }
  throw new OpenAIAnalysisError("OpenAI 응답에 분석 결과가 없습니다.", 502, "OPENAI_EMPTY_OUTPUT");
}

async function postOpenAI(path: string, payload: unknown, timeoutMs: number) {
  let response: Response;
  try {
    response = await fetch(`https://api.openai.com/v1/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getApiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof OpenAIAnalysisError) throw error;
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new OpenAIAnalysisError(timedOut ? "OpenAI 분석 응답 시간이 초과됐습니다. 다시 시도하세요." : "OpenAI API에 연결할 수 없습니다.", 504, timedOut ? "OPENAI_TIMEOUT" : "OPENAI_NETWORK_ERROR");
  }
  const body = await response.json().catch(() => ({})) as ResponsesBody & Record<string, unknown>;
  if (!response.ok) {
    const status = response.status === 401 ? 401 : response.status === 429 ? 429 : 502;
    const message = response.status === 401 ? "OpenAI API 키가 유효하지 않습니다." : response.status === 429 ? rateLimitMessage(body.error) : body.error?.message || "OpenAI 분석 요청에 실패했습니다.";
    throw new OpenAIAnalysisError(message, status, body.error?.code || "OPENAI_REQUEST_FAILED");
  }
  return body;
}

/** Responses API + Structured Outputs(strict JSON Schema) 호출 후 Zod로 다시 검증한다. */
export async function callStructured<T>({ name, jsonSchema, validator, instructions, input, maxOutputTokens = 4000, webSearch = false, images = [], timeoutMs }: {
  name: string;
  jsonSchema: Record<string, unknown>;
  validator: z.ZodType<T>;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
  /** OpenAI 웹 검색 도구 사용. 실제로 조회한 출처 URL을 sources로 함께 반환한다. */
  webSearch?: boolean;
  /** V3 Visual DNA: 분석할 공개 이미지 URL. 비용을 줄이려고 저해상도(detail: low)로만 보낸다. 이미지는 저장하지 않는다(store: false). */
  images?: Array<{ url: string }>;
  /** 응답 대기 한도. 기본 90초(웹 검색 120초). 긴 출력(Creative Collision)만 늘린다. */
  timeoutMs?: number;
}): Promise<{ data: T; model: string; sources: Array<{ url: string; title?: string }> }> {
  const model = getModel();
  const body = await postOpenAI("responses", {
    model, store: false, reasoning: { effort: "low" }, max_output_tokens: maxOutputTokens,
    instructions,
    input: images.length ? [{ role: "user", content: [{ type: "input_text", text: input }, ...images.map((image) => ({ type: "input_image", image_url: image.url, detail: "low" }))] }] : input,
    ...(webSearch ? { tools: [{ type: "web_search" }], include: ["web_search_call.action.sources"] } : {}),
    text: { format: { type: "json_schema", name, strict: true, schema: jsonSchema } },
  }, timeoutMs ?? (webSearch ? 120_000 : 90_000));
  let parsedJson: unknown;
  try { parsedJson = JSON.parse(extractOutputText(body)); }
  catch (error) {
    if (error instanceof OpenAIAnalysisError) throw error;
    throw new OpenAIAnalysisError("OpenAI 응답이 완전한 JSON이 아닙니다. 출력 길이 한도를 초과했을 수 있습니다.", 502, "OPENAI_INVALID_JSON");
  }
  const parsed = validator.safeParse(parsedJson);
  if (!parsed.success) throw new OpenAIAnalysisError(`OpenAI 구조화 출력이 ${name} 스키마와 일치하지 않습니다.`, 502, "OPENAI_SCHEMA_MISMATCH");
  return { data: parsed.data, model, sources: collectSources(body) };
}

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 256;

export async function createEmbedding(text: string): Promise<number[]> {
  const body = await postOpenAI("embeddings", { model: EMBEDDING_MODEL, input: text.slice(0, 6000), dimensions: EMBEDDING_DIMENSIONS }, 20_000) as { data?: Array<{ embedding?: number[] }> };
  const embedding = body.data?.[0]?.embedding;
  if (!embedding?.length) throw new OpenAIAnalysisError("임베딩 응답이 비어 있습니다.", 502, "OPENAI_EMPTY_EMBEDDING");
  return embedding.map((value) => Math.round(value * 1e5) / 1e5);
}

/* JSON Schema 조각. strict 모드에서는 모든 속성이 required이고 additionalProperties:false여야 한다. */
export const js = {
  str: { type: "string" },
  strArr: { type: "array", items: { type: "string" } },
  status: { type: "string", enum: ["Verified Signal", "Supported Hypothesis", "Creative Hypothesis", "Insufficient Evidence"] },
  obj(properties: Record<string, unknown>) { return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) }; },
  arr(items: unknown) { return { type: "array", items }; },
  enumOf(values: readonly string[]) { return { type: "string", enum: values }; },
};
