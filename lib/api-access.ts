import "server-only";
import { createHash } from "node:crypto";
import { clientKeyFrom } from "./rate-limit";

/*
 * 비용이 드는 API(OpenAI · NAVER · Meta)의 호출 권한.
 *   PAID_API_ACCESS=open      누구나 호출(개발 기본값)
 *   PAID_API_ACCESS=auth      Supabase 로그인 사용자만(배포 기본값)
 *   PAID_API_ACCESS=allowlist PAID_API_ALLOWED_EMAILS에 있는 이메일만
 * 로그인 사용자는 IP 대신 사용자 ID로 요청 한도를 센다(x-forwarded-for 위조로 우회 불가).
 */
export type AccessMode = "open" | "auth" | "allowlist";
export type Access = { clientKey: string; userId: string | null; mode: AccessMode };

export class AccessError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) { super(message); }
}

export function accessMode(): AccessMode {
  const value = process.env.PAID_API_ACCESS?.trim().toLowerCase();
  if (value === "open" || value === "auth" || value === "allowlist") return value;
  return process.env.NODE_ENV === "production" ? "auth" : "open";
}

const VERIFY_TTL_MS = 5 * 60 * 1000;
const verified = new Map<string, { expiresAt: number; user: { id: string; email: string | null } | null }>();

/** Supabase Auth 서버에 토큰을 확인한다. 결과는 토큰 해시 기준 5분 캐시. */
async function verifySupabaseToken(token: string) {
  const key = createHash("sha256").update(token).digest("hex");
  const hit = verified.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.user;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new AccessError("로그인 확인에 필요한 Supabase 설정이 없습니다.", 503, "AUTH_NOT_CONFIGURED");
  let user: { id: string; email: string | null } | null = null;
  try {
    const response = await fetch(`${new URL(url).origin}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (response.ok) { const body = await response.json() as { id?: string; email?: string }; if (body.id) user = { id: body.id, email: body.email ?? null }; }
  } catch {
    throw new AccessError("로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도하세요.", 503, "AUTH_UNAVAILABLE");
  }
  if (verified.size > 500) verified.clear();
  verified.set(key, { user, expiresAt: Date.now() + VERIFY_TTL_MS });
  return user;
}

export async function requirePaidAccess(request: Request): Promise<Access> {
  const mode = accessMode();
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (mode === "open") {
    const user = token ? await verifySupabaseToken(token).catch(() => null) : null;
    return { mode, userId: user?.id ?? null, clientKey: user ? `user:${user.id}` : `ip:${clientKeyFrom(request)}` };
  }
  if (!token) throw new AccessError("실제 API 분석은 로그인 후 사용할 수 있습니다. Account에서 로그인하세요.", 401, "AUTH_REQUIRED");
  const user = await verifySupabaseToken(token);
  if (!user) throw new AccessError("로그인이 만료됐습니다. 다시 로그인하세요.", 401, "AUTH_REQUIRED");
  if (mode === "allowlist") {
    const allowed = (process.env.PAID_API_ALLOWED_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (!user.email || !allowed.includes(user.email.toLowerCase())) throw new AccessError("이 계정은 실제 API 분석 권한이 없습니다. 저장된 결과와 DEMO는 볼 수 있습니다.", 403, "ACCESS_DENIED");
  }
  return { mode, userId: user.id, clientKey: `user:${user.id}` };
}

/** 로그인 필수 기능(비용 없음): 접근 모드와 관계없이 Supabase 로그인 사용자와 그 액세스 토큰을 돌려준다. */
export async function requireUser(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) throw new AccessError("로그인이 필요합니다. Account에서 로그인하세요.", 401, "AUTH_REQUIRED");
  const user = await verifySupabaseToken(token);
  if (!user) throw new AccessError("로그인이 만료됐습니다. 다시 로그인하세요.", 401, "AUTH_REQUIRED");
  return { user, token };
}
