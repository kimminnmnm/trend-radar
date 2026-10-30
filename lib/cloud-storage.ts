"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveAnalysisSnapshot, SavedItem } from "./types";
import type { TrendAnalysis } from "./schemas";
import { saveLiveAnalysis } from "./storage";
import { getSupabaseBrowserClient } from "./supabase-browser";
import { isLiveTrendId, liveTrendId } from "./live-trend";

export type PersistenceResult = { target: "cloud" | "local"; message: string };

const tableMissing = (message: string) => /schema cache|does not exist|PGRST205|column/i.test(message);
const cloudHint = (message: string) => tableMissing(message) ? "Supabase 테이블이 없습니다. supabase/migrations의 SQL을 적용하세요." : message;

/**
 * trend_analyses.source는 0001 마이그레이션의 check 제약으로 'NAVER DataLab + OpenAI'만 허용한다.
 * YouTube 포함 분석은 이 값으로 저장하고, YouTube 사용 여부는 youtube 컬럼으로 복원한다(rowToSnapshot).
 * (YouTube 포함 source를 그대로 넣으면 check 제약 위반으로 클라우드 저장이 실패했다.)
 */
const CLOUD_SOURCE = "NAVER DataLab + OpenAI";

type CloudUpsert = { ok: true; id: string; created: boolean } | { ok: false; error: string };

/**
 * 같은 사용자·트렌드·분석 시각의 행이 있으면 갱신하고, 없으면 만든다. 같은 분석이 여러 행으로 중복 저장되지 않게 한다.
 * (trend_analyses에는 이 조합의 유일 제약이 없으므로 앱에서 먼저 조회한다.)
 */
export async function upsertCloudAnalysis(supabase: SupabaseClient, userId: string, snapshot: LiveAnalysisSnapshot): Promise<CloudUpsert> {
  if (!snapshot.whyReport) return { ok: false, error: "WHY 결과가 없는 분석은 저장하지 않습니다." };
  const base = {
    user_id: userId, trend_id: snapshot.trendId, trend_name: snapshot.trendName, keywords: snapshot.keywords, period_months: snapshot.periodMonths,
    source: CLOUD_SOURCE, report: snapshot.whyReport, naver_signal: snapshot.naverSignal ?? {}, prompt_version: snapshot.whyPromptVersion ?? "unknown", analyzed_at: snapshot.analyzedAt,
  };
  const extended = { ...base, evidence: snapshot.evidence ?? [], signal_stats: snapshot.signalStats ?? null, ...(snapshot.dna ? { dna: snapshot.dna, dna_generated_at: snapshot.dnaGeneratedAt ?? null, dna_model: snapshot.dnaModel ?? null } : {}) };
  const full = { ...extended, youtube: snapshot.youtube ?? null };
  const existing = await supabase.from("trend_analyses").select("id").eq("user_id", userId).eq("trend_id", snapshot.trendId).eq("analyzed_at", snapshot.analyzedAt).order("created_at", { ascending: true }).limit(1);
  if (existing.error) return { ok: false, error: cloudHint(existing.error.message) };
  const existingId = (existing.data as Array<{ id: string }> | null)?.[0]?.id;
  // 0004 전이면 youtube 컬럼만 빼고, 0003 전이면 기본 컬럼으로 한 번 더 폴백한다.
  for (const row of [full, extended, base]) {
    const result = existingId
      ? await supabase.from("trend_analyses").update(row).eq("id", existingId).eq("user_id", userId).select("id")
      : await supabase.from("trend_analyses").insert(row).select("id");
    if (result.error) { if (/youtube|column/i.test(result.error.message)) continue; return { ok: false, error: cloudHint(result.error.message) }; }
    const id = (result.data as Array<{ id: string }> | null)?.[0]?.id;
    // update가 0행이면 오류 없이 빈 결과가 온다. 이를 성공으로 보고하지 않는다.
    if (!id) return { ok: false, error: "Supabase에 반영된 행이 없습니다(권한 또는 RLS 확인 필요)." };
    return { ok: true, id, created: !existingId };
  }
  return { ok: false, error: "Supabase 테이블 컬럼이 앱과 맞지 않습니다. supabase/migrations를 확인하세요." };
}

async function signedInClient() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function persistLiveAnalysis(snapshot: LiveAnalysisSnapshot, report: TrendAnalysis, naverSignal: unknown, promptVersion: string): Promise<PersistenceResult> {
  const localSaved = saveLiveAnalysis(snapshot);
  const local = localSaved ? "이 브라우저에 저장했습니다" : "브라우저 저장 공간이 부족해 저장하지 못했습니다";
  if (!getSupabaseBrowserClient()) return { target: "local", message: `${local}. (Supabase 미설정)` };
  const session = await signedInClient();
  if (!session) return { target: "local", message: `${local}. 로그인하면 Cloud Workspace에도 저장됩니다.` };
  const result = await upsertCloudAnalysis(session.supabase, session.user.id, { ...snapshot, whyReport: report, naverSignal, whyPromptVersion: promptVersion });
  if (!result.ok) return { target: "local", message: `${local}. 클라우드 저장 실패: ${result.error}` };
  return { target: "cloud", message: `${local}. Supabase 개인 Workspace에도 저장했습니다.` };
}

export async function persistLiveDna(snapshot: LiveAnalysisSnapshot): Promise<PersistenceResult> {
  if (!snapshot.dna) return { target: "local", message: "DNA를 이 브라우저에 저장했습니다." };
  const session = await signedInClient();
  if (!session) return { target: "local", message: "DNA를 이 브라우저에 저장했습니다." };
  // WHY 행이 없으면(이전 저장 실패 포함) WHY와 DNA를 함께 저장한다. 0행 갱신을 성공으로 보지 않는다.
  const result = await upsertCloudAnalysis(session.supabase, session.user.id, snapshot);
  if (!result.ok) return { target: "local", message: `DNA를 브라우저에 저장했습니다. 클라우드 저장 실패: ${result.error}` };
  return { target: "cloud", message: "DNA를 브라우저와 Supabase에 저장했습니다." };
}

export async function persistSavedItem(item: SavedItem) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("saved_items").insert({ user_id: user.id, item_type: item.type, title: item.title, subtitle: item.subtitle, payload: { ...item.payload, clientId: item.id, mode: item.mode } });
}

type CloudRow = Record<string, unknown>;

const toIso = (value: unknown) => { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : date.toISOString(); };

export function rowToSnapshot(row: CloudRow): LiveAnalysisSnapshot {
  const report = row.report as TrendAnalysis | undefined;
  const trendName = String(row.trend_name);
  const storedTrendId = String(row.trend_id);
  return {
    id: String(row.id),
    // 2026-10-28 이전 행의 데모 ID를 로컬 저장소와 같은 LIVE ID로 읽는다.
    trendId: isLiveTrendId(storedTrendId) ? storedTrendId : liveTrendId(trendName),
    trendName,
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    periodMonths: (row.period_months === 1 || row.period_months === 3 ? row.period_months : 12) as 1 | 3 | 12,
    summary: report?.origin?.summary ? String(report.origin.summary) : "저장된 LIVE WHY 분석",
    // Postgres는 "+00:00" 형식으로 돌려준다. 로컬 원장은 ISO "Z" 문자열로 버전을 식별하므로 형식을 맞춘다.
    analyzedAt: toIso(row.analyzed_at),
    // DB source 컬럼은 제약 때문에 항상 NAVER+OpenAI다. YouTube 사용 여부는 youtube 컬럼에서 복원한다.
    source: row.source === "NAVER DataLab + YouTube + OpenAI" || ["live", "cached"].includes(String((row.youtube as { status?: string } | null)?.status)) ? "NAVER DataLab + YouTube + OpenAI" : "NAVER DataLab + OpenAI",
    whyReport: report,
    naverSignal: row.naver_signal,
    whyPromptVersion: row.prompt_version ? String(row.prompt_version) : undefined,
    evidence: Array.isArray(row.evidence) ? row.evidence as LiveAnalysisSnapshot["evidence"] : undefined,
    signalStats: Array.isArray(row.signal_stats) ? row.signal_stats as LiveAnalysisSnapshot["signalStats"] : undefined,
    youtube: (row.youtube as LiveAnalysisSnapshot["youtube"]) ?? undefined,
    dna: (row.dna as LiveAnalysisSnapshot["dna"]) ?? undefined,
    dnaGeneratedAt: row.dna_generated_at ? toIso(row.dna_generated_at) : undefined,
    dnaModel: row.dna_model ? String(row.dna_model) : undefined,
  };
}

export async function loadCloudAnalyses(client?: SupabaseClient, limit = 50) {
  const supabase = client ?? getSupabaseBrowserClient();
  if (!supabase) return { configured: false, authenticated: false, analyses: [] as LiveAnalysisSnapshot[] };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { configured: true, authenticated: false, analyses: [] as LiveAnalysisSnapshot[] };
  const base = "id,trend_id,trend_name,keywords,period_months,source,report,naver_signal,prompt_version,analyzed_at";
  const query = (columns: string) => supabase.from("trend_analyses").select(columns).order("created_at", { ascending: false }).limit(limit).returns<CloudRow[]>();
  let { data, error } = await query(`${base},evidence,signal_stats,youtube,dna,dna_generated_at,dna_model`);
  if (error && /youtube|column/i.test(error.message)) ({ data, error } = await query(`${base},evidence,signal_stats,dna,dna_generated_at,dna_model`));
  if (error && /column/i.test(error.message)) ({ data, error } = await query(base));
  if (error) return { configured: true, authenticated: true, analyses: [] as LiveAnalysisSnapshot[], error: cloudHint(error.message) };
  return { configured: true, authenticated: true, analyses: (data || []).map(rowToSnapshot) };
}
