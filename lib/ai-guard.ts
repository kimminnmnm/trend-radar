import "server-only";
import { createHash } from "node:crypto";
import { createRateLimiter } from "./rate-limit";

/*
 * OpenAI 비용 보호: (1) 동일 입력 결과 캐시 (2) 동시 중복 요청 병합 (3) 클라이언트별 분당 제한 (4) 프로세스 일일 상한.
 * 캐시 적중은 호출 횟수에 포함하지 않는다. 서버 메모리 기반이므로 재시작 시 초기화된다.
 */
const perMinute = createRateLimiter(Number(process.env.OPENAI_RATE_PER_MINUTE) || 6);
/** OpenAI 이전에 NAVER·Meta를 부르는 라우트용 분당 한도 */
const externalPerMinute = createRateLimiter(Number(process.env.EXTERNAL_RATE_PER_MINUTE) || 10);
const DAILY_LIMIT = Number(process.env.OPENAI_DAILY_LIMIT) || 60;
const CACHE_MAX = 100;
let daily = { day: "", count: 0 };
const cache = new Map<string, { expiresAt: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export class GuardError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) { super(message); }
}

export function hashKey(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

export function assertExternalRate(clientKey: string) {
  if (!externalPerMinute(clientKey).allowed) throw new GuardError("외부 데이터 요청이 너무 많습니다. 1분 후 다시 시도하세요.", 429, "EXTERNAL_RATE_LIMIT");
}

function consumeBudget(clientKey: string, cost = 1) {
  const minute = perMinute(clientKey);
  if (!minute.allowed) throw new GuardError("AI 분석 요청이 너무 많습니다. 1분 후 다시 시도하세요.", 429, "AI_LOCAL_RATE_LIMIT");
  const today = new Date().toISOString().slice(0, 10);
  if (daily.day !== today) daily = { day: today, count: 0 };
  if (daily.count + cost > DAILY_LIMIT) throw new GuardError(`오늘의 AI 분석 상한(${DAILY_LIMIT}회)에 도달했습니다. OPENAI_DAILY_LIMIT으로 조정할 수 있습니다.`, 429, "AI_DAILY_LIMIT");
  daily.count += cost;
}

export async function runGuarded<T>(clientKey: string, cacheKey: string, ttlMs: number, fn: () => Promise<T>, options: { bypassCache?: boolean; cost?: number } = {}): Promise<{ value: T; cached: boolean }> {
  const hit = cache.get(cacheKey);
  if (!options.bypassCache && hit && hit.expiresAt > Date.now()) return { value: hit.value as T, cached: true };
  const pending = inflight.get(cacheKey);
  if (pending) return { value: await pending as T, cached: true };
  consumeBudget(clientKey, options.cost ?? 1);
  const promise = fn();
  inflight.set(cacheKey, promise);
  try {
    const value = await promise;
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(cacheKey, { value, expiresAt: Date.now() + ttlMs });
    return { value, cached: false };
  } finally {
    inflight.delete(cacheKey);
  }
}

export function aiUsageToday() {
  const today = new Date().toISOString().slice(0, 10);
  return { used: daily.day === today ? daily.count : 0, limit: DAILY_LIMIT };
}

/** 요청 본문 크기 제한(문자 수) 후 JSON 파싱 */
export async function readJsonBody(request: Request, maxChars = 250_000) {
  const text = await request.text().catch(() => "");
  if (text.length > maxChars) throw new GuardError("요청 본문이 너무 큽니다.", 413, "PAYLOAD_TOO_LARGE");
  try { return JSON.parse(text) as unknown; } catch { return null; }
}
