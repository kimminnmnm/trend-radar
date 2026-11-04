import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createRateLimiter } from "./rate-limit";
import { HANDOFF_ERRORS, HANDOFF_TTL_HOURS, handoffContentHash, shortCode, type HandoffCreated, type HandoffErrorCode, type HandoffExport, type HandoffSummary } from "./figma-handoff";

/*
 * FIGMA DIRECT EXPORT 서버 로직. 서버에는 service role 키가 없다(두지 않는다).
 * - 웹 요청: 사용자의 Supabase 액세스 토큰으로 PostgREST를 불러 RLS가 본인 행만 허용한다.
 * - 플러그인 요청: Supabase 세션이 없으므로 플러그인 토큰의 SHA-256 해시를 SECURITY DEFINER 함수(0009)에 넘겨 DB가 소유자를 확인한다.
 * - 키·토큰 원문은 로그에 남기지 않고 DB에도 해시만 둔다.
 */
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = (bytes = 32) => randomBytes(bytes).toString("base64url");

export class HandoffError extends Error {
  constructor(public readonly code: HandoffErrorCode, public readonly status: number, message?: string) { super(message ?? HANDOFF_ERRORS[code]); }
}

/** 플러그인 iframe은 origin이 null이라 Access-Control-Allow-Origin: *만 통과한다(Figma 공식 문서). 쿠키 없이 Bearer 토큰만 쓴다. */
export const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "600", "Cache-Control": "no-store" };
export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });
export const json = (body: unknown, status = 200, cors = false) => NextResponse.json(body, { status, headers: cors ? CORS : { "Cache-Control": "no-store" } });
export function handoffErrorResponse(error: unknown, cors = false) {
  if (error instanceof HandoffError) return json({ error: error.code, message: error.message }, error.status, cors);
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
  const code = (error as { code?: unknown })?.code;
  if (status === 401 && code === "AUTH_REQUIRED") return json({ error: "AUTH_REQUIRED", message: (error as Error).message }, 401, cors);
  return json({ error: "UPSTREAM_ERROR", message: HANDOFF_ERRORS.UPSTREAM_ERROR }, 502, cors);
}

export const limits = { pairStart: createRateLimiter(10), pairPoll: createRateLimiter(90), pluginRead: createRateLimiter(120), create: createRateLimiter(20) };
export function limit(check: (key: string) => { allowed: boolean }, key: string) { if (!check(key).allowed) throw new HandoffError("RATE_LIMITED", 429); }

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new HandoffError("HANDOFF_NOT_CONFIGURED", 503, "Supabase 설정이 없습니다.");
  return { origin: new URL(url).origin, anon };
}

type PgError = { code?: string; message?: string };
const missingSchema = (error: PgError) => error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42P01" || error.code === "42883";

/** PostgREST 호출. jwt가 없으면 anon 키로 부른다(플러그인용 함수만 anon 실행 권한이 있다). */
export async function rest<T>(path: string, init: { method?: string; body?: unknown; jwt?: string; prefer?: string } = {}): Promise<T> {
  const { origin, anon } = supabaseConfig();
  let response: Response;
  try {
    response = await fetch(`${origin}/rest/v1/${path}`, {
      method: init.method ?? "GET", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { apikey: anon, Authorization: `Bearer ${init.jwt ?? anon}`, "Content-Type": "application/json", ...(init.prefer ? { Prefer: init.prefer } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch { throw new HandoffError("UPSTREAM_ERROR", 502); }
  const text = await response.text();
  const body = text ? JSON.parse(text) as unknown : null;
  if (response.ok) return body as T;
  const error = (body ?? {}) as PgError;
  if (missingSchema(error)) throw new HandoffError("HANDOFF_NOT_CONFIGURED", 503);
  if (/FIGMA_TOKEN_INVALID/.test(error.message ?? "")) throw new HandoffError("PLUGIN_AUTH_REQUIRED", 401);
  if (/FIGMA_AUTH_REQUIRED|JWT/i.test(error.message ?? "") || response.status === 401) throw new HandoffError("AUTH_REQUIRED", 401);
  if (/FIGMA_PAIRING_BUSY/.test(error.message ?? "")) throw new HandoffError("RATE_LIMITED", 429);
  throw new HandoffError("UPSTREAM_ERROR", 502);
}
export const rpc = <T>(fn: string, args: Record<string, unknown>, jwt?: string) => rest<T>(`rpc/${fn}`, { method: "POST", body: args, jwt });

export const contentHash = (exported: HandoffExport) => handoffContentHash(exported, sha256);

export async function createHandoff(jwt: string, userId: string, exported: HandoffExport, now = new Date()): Promise<HandoffCreated> {
  const hash = contentHash(exported);
  const images = { included: exported.assets.filter((item) => item.figmaImage).length, signed: exported.assets.filter((item) => item.figmaImage?.kind === "signed").length, inline: exported.assets.filter((item) => item.figmaImage?.kind === "inline").length };
  const params = new URLSearchParams({ select: "id,expires_at", project_id: `eq.${exported.project.id}`, content_hash: `eq.${hash}`, expires_at: `gt.${now.toISOString()}`, order: "created_at.desc", limit: "1" });
  const existing = await rest<Array<{ id: string; expires_at: string }>>(`figma_handoffs?${params}`, { jwt });
  if (existing[0]) return { handoffId: existing[0].id, code: shortCode(existing[0].id), expiresAt: existing[0].expires_at, duplicate: true, images };
  const id = randomBytes(32).toString("hex");
  const createdAt = now.toISOString(), expiresAt = new Date(now.getTime() + HANDOFF_TTL_HOURS * 3600_000).toISOString();
  const payload = { ...exported, handoff: { id, projectId: exported.project.id, userId, createdAt, expiresAt } };
  const rows = await rest<Array<{ id: string; expires_at: string }>>("figma_handoffs?select=id,expires_at", { method: "POST", jwt, prefer: "return=representation", body: { id, user_id: userId, project_id: exported.project.id, title: exported.project.title, format: exported.project.format, unit_count: exported.slides.length, content_hash: hash, payload, created_at: createdAt, expires_at: expiresAt } });
  // 반영된 행이 없으면 성공으로 보고하지 않는다.
  if (!rows?.[0]?.id) throw new HandoffError("UPSTREAM_ERROR", 502, "Supabase에 작업이 저장되지 않았습니다(권한 또는 RLS 확인 필요).");
  return { handoffId: rows[0].id, code: shortCode(rows[0].id), expiresAt: rows[0].expires_at, duplicate: false, images };
}

/* ---------- 플러그인 연결(Figma 공식 OAuth-with-plugins 방식: 읽기/쓰기 키 + 폴링) ---------- */

export async function startPairing() {
  const readKey = secret(24), writeKey = secret(24);
  await rpc("figma_pairing_start", { p_read_hash: sha256(readKey), p_write_hash: sha256(writeKey) });
  return { readKey, writeKey };
}
export async function approvePairing(jwt: string, writeKey: string) {
  const token = `trp_${secret(32)}`;
  const ok = await rpc<boolean>("figma_pairing_approve", { p_write_hash: sha256(writeKey), p_token_hash: sha256(token), p_token: token }, jwt);
  if (!ok) throw new HandoffError("PAIRING_EXPIRED", 410);
}
export async function claimPairing(readKey: string) {
  return await rpc<string | null>("figma_pairing_claim", { p_read_hash: sha256(readKey) });
}

/* ---------- 플러그인 조회 ---------- */

export function pluginToken(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(trp_[A-Za-z0-9_-]{20,})$/)?.[1];
  if (!token) throw new HandoffError("PLUGIN_AUTH_REQUIRED", 401);
  return sha256(token);
}
type ListRow = { id: string; project_id: string; title: string; format: "cardnews" | "shortform"; unit_count: number; created_at: string; expires_at: string; imported_at: string | null; import_count: number };
export async function listHandoffs(tokenHash: string, now = Date.now()): Promise<HandoffSummary[]> {
  const rows = await rpc<ListRow[]>("figma_list_handoffs", { p_token_hash: tokenHash });
  return rows.map((row) => ({ id: row.id, projectId: row.project_id, title: row.title, format: row.format, unitCount: row.unit_count, createdAt: row.created_at, expiresAt: row.expires_at, importedAt: row.imported_at, importCount: row.import_count, expired: Date.parse(row.expires_at) <= now, code: shortCode(row.id) }));
}
export async function getHandoff(tokenHash: string, id: string) {
  if (!/^[0-9a-f]{64}$/.test(id)) throw new HandoffError("HANDOFF_NOT_FOUND", 404);
  const rows = await rpc<Array<{ id: string; title: string; expires_at: string; expired: boolean; payload: unknown }>>("figma_get_handoff", { p_token_hash: tokenHash, p_id: id });
  const row = rows[0];
  if (!row) throw new HandoffError("HANDOFF_NOT_FOUND", 404);
  if (row.expired || !row.payload) throw new HandoffError("HANDOFF_EXPIRED", 410);
  return row.payload;
}
export async function markImported(tokenHash: string, id: string) {
  if (!/^[0-9a-f]{64}$/.test(id)) throw new HandoffError("HANDOFF_NOT_FOUND", 404);
  return await rpc<number>("figma_mark_imported", { p_token_hash: tokenHash, p_id: id });
}
