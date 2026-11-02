"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInClient, type PersistenceResult } from "./cloud-storage";
import { getLiveAnalyses, updateLiveAnalysis } from "./storage";
import { getSupabaseBrowserClient } from "./supabase-browser";
import { visualDnaSchema, type VisualDnaRecord } from "./visual-dna";
import type { LiveAnalysisSnapshot } from "./types";

/*
 * V3 Visual DNA ↔ Supabase trend_visual_dna(마이그레이션 0006).
 * (user_id, trend_id, analyzed_at) 유일: 같은 분석은 다시 저장해도 행이 늘지 않고, 재분석은 새 행으로 보존된다.
 * 테이블이 없으면 브라우저 저장만 유지하고 적용 필요를 알린다.
 */
const missingTable = (message: string) => /trend_visual_dna|schema cache|does not exist|PGRST205/i.test(message);
const hint = (message: string) => missingTable(message) ? "Supabase에 trend_visual_dna 테이블이 없습니다. supabase/migrations/202610300006_trend_visual_dna.sql을 적용하세요." : message;
type Row = { trend_id: string; analyzed_at: string; prompt_version: string; model: string | null; media: unknown; result: unknown; validation: unknown };

export async function upsertVisualDna(supabase: SupabaseClient, userId: string, trendId: string, record: VisualDnaRecord) {
  const { data, error } = await supabase.from("trend_visual_dna").upsert({ user_id: userId, trend_id: trendId, analyzed_at: record.analyzedAt, prompt_version: record.promptVersion, model: record.model, media: record.media, result: record.result, validation: record.validation }, { onConflict: "user_id,trend_id,analyzed_at" }).select("id");
  if (error) return { ok: false as const, error: hint(error.message) };
  if (!(data as unknown[] | null)?.length) return { ok: false as const, error: "Supabase에 반영된 행이 없습니다." };
  return { ok: true as const };
}

/** Visual DNA 저장: 브라우저에 먼저 저장하고, 로그인 상태면 실제 DB 응답으로 클라우드 저장을 확인한다. */
export async function saveVisualDnaEverywhere(trendId: string, record: VisualDnaRecord): Promise<PersistenceResult> {
  const local = updateLiveAnalysis(trendId, { visualDna: record });
  if (!getSupabaseBrowserClient()) return { target: "local", local, cloud: "not-configured", message: "Visual DNA를 이 브라우저에 저장했습니다." };
  const session = await signedInClient();
  if (!session) return { target: "local", local, cloud: "signed-out", message: "Visual DNA를 이 브라우저에 저장했습니다." };
  const result = await upsertVisualDna(session.supabase, session.user.id, trendId, record);
  if (!result.ok) return { target: "local", local, cloud: "failed", error: result.error, message: `클라우드 저장 실패: ${result.error}` };
  return { target: "cloud", local, cloud: "saved", message: "Visual DNA를 브라우저와 Supabase 계정에 저장했습니다(행 확인됨)." };
}

/** 계정의 최신 Visual DNA를 이 브라우저 분석에 붙인다. 로컬이 같거나 더 최신이면 그대로 둔다. */
export function planVisualDnaMerge(local: LiveAnalysisSnapshot[], rows: Row[]) {
  const latest = new Map<string, Row>();
  for (const row of rows) { const prev = latest.get(row.trend_id); if (!prev || new Date(row.analyzed_at) > new Date(prev.analyzed_at)) latest.set(row.trend_id, row); }
  const patches: Array<{ trendId: string; record: VisualDnaRecord }> = [];
  for (const [trendId, row] of latest) {
    const mine = local.find((item) => item.trendId === trendId);
    if (!mine) continue;
    if (mine.visualDna && new Date(mine.visualDna.analyzedAt) >= new Date(row.analyzed_at)) continue;
    const parsed = visualDnaSchema.safeParse(row.result);
    if (!parsed.success || !Array.isArray(row.media)) continue;
    patches.push({ trendId, record: { result: parsed.data, media: row.media as VisualDnaRecord["media"], model: row.model ?? "unknown", analyzedAt: new Date(row.analyzed_at).toISOString(), promptVersion: row.prompt_version, validation: (row.validation as VisualDnaRecord["validation"]) ?? { removedMediaIds: [], downgraded: 0, droppedCommon: 0, droppedPalette: 0 } } });
  }
  return patches;
}

export async function pullVisualDna(client?: SupabaseClient) {
  const session = client ? { supabase: client, user: (await client.auth.getUser()).data.user } : await signedInClient();
  if (!session?.user) return { ok: false, message: "로그인이 필요합니다.", restored: 0 };
  const { data, error } = await session.supabase.from("trend_visual_dna").select("trend_id,analyzed_at,prompt_version,model,media,result,validation").eq("user_id", session.user.id).limit(500);
  // 0006 미적용은 동기화 전체를 실패로 만들지 않는다(다른 데이터는 정상 동기화).
  if (error) return { ok: missingTable(error.message), message: hint(error.message), restored: 0, missingTable: missingTable(error.message) };
  const patches = planVisualDnaMerge(getLiveAnalyses(), (data ?? []) as Row[]);
  for (const patch of patches) updateLiveAnalysis(patch.trendId, { visualDna: patch.record });
  return { ok: true, message: `Visual DNA ${patches.length}개를 가져왔습니다.`, restored: patches.length };
}

export async function pushAllVisualDna(client?: SupabaseClient) {
  const session = client ? { supabase: client, user: (await client.auth.getUser()).data.user } : await signedInClient();
  if (!session?.user) return { ok: false, message: "로그인이 필요합니다.", saved: 0 };
  let saved = 0;
  for (const snapshot of getLiveAnalyses().filter((item) => item.visualDna)) {
    const result = await upsertVisualDna(session.supabase, session.user.id, snapshot.trendId, snapshot.visualDna!);
    if (!result.ok) return { ok: false, message: result.error, saved };
    saved += 1;
  }
  return { ok: true, message: `Visual DNA ${saved}개 저장`, saved };
}
