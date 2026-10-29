"use client";

import type { LiveAnalysisSnapshot, SavedItem } from "./types";
import type { TrendAnalysis } from "./schemas";
import { saveLiveAnalysis } from "./storage";
import { getSupabaseBrowserClient } from "./supabase-browser";

export type PersistenceResult = { target: "cloud" | "local"; message: string };

const tableMissing = (message: string) => /schema cache|does not exist|PGRST205|column/i.test(message);
const cloudHint = (message: string) => tableMissing(message) ? "Supabase 테이블이 없습니다. supabase/migrations의 SQL을 적용하세요." : message;

export async function persistLiveAnalysis(snapshot: LiveAnalysisSnapshot, report: TrendAnalysis, naverSignal: unknown, promptVersion: string): Promise<PersistenceResult> {
  const localSaved = saveLiveAnalysis(snapshot);
  const local = localSaved ? "이 브라우저에 저장했습니다" : "브라우저 저장 공간이 부족해 저장하지 못했습니다";
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { target: "local", message: `${local}. (Supabase 미설정)` };
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { target: "local", message: `${local}. 로그인하면 Cloud Workspace에도 저장됩니다.` };
  const row = {
    user_id: user.id, trend_id: snapshot.trendId, trend_name: snapshot.trendName, keywords: snapshot.keywords, period_months: snapshot.periodMonths,
    source: snapshot.source, report, naver_signal: naverSignal, prompt_version: promptVersion, analyzed_at: snapshot.analyzedAt,
  };
  let { error } = await supabase.from("trend_analyses").insert({ ...row, evidence: snapshot.evidence ?? [], signal_stats: snapshot.signalStats ?? null });
  // 202610280003 마이그레이션 전이면 확장 컬럼 없이 다시 시도한다.
  if (error && /column/i.test(error.message)) ({ error } = await supabase.from("trend_analyses").insert(row));
  if (error) return { target: "local", message: `${local}. 클라우드 저장 실패: ${cloudHint(error.message)}` };
  return { target: "cloud", message: `${local}. Supabase 개인 Workspace에도 저장했습니다.` };
}

export async function persistLiveDna(snapshot: LiveAnalysisSnapshot): Promise<PersistenceResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !snapshot.dna) return { target: "local", message: "DNA를 이 브라우저에 저장했습니다." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { target: "local", message: "DNA를 이 브라우저에 저장했습니다." };
  const { error } = await supabase.from("trend_analyses").update({ dna: snapshot.dna, dna_generated_at: snapshot.dnaGeneratedAt, dna_model: snapshot.dnaModel }).eq("user_id", user.id).eq("trend_id", snapshot.trendId).eq("analyzed_at", snapshot.analyzedAt);
  if (error) return { target: "local", message: `DNA를 브라우저에 저장했습니다. 클라우드 저장 실패: ${cloudHint(error.message)}` };
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

function rowToSnapshot(row: CloudRow): LiveAnalysisSnapshot {
  const report = row.report as TrendAnalysis | undefined;
  return {
    id: String(row.id),
    trendId: String(row.trend_id),
    trendName: String(row.trend_name),
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    periodMonths: (row.period_months === 1 || row.period_months === 3 ? row.period_months : 12) as 1 | 3 | 12,
    summary: report?.origin?.summary ? String(report.origin.summary) : "저장된 LIVE WHY 분석",
    analyzedAt: String(row.analyzed_at),
    source: "NAVER DataLab + OpenAI",
    whyReport: report,
    naverSignal: row.naver_signal,
    whyPromptVersion: row.prompt_version ? String(row.prompt_version) : undefined,
    evidence: Array.isArray(row.evidence) ? row.evidence as LiveAnalysisSnapshot["evidence"] : undefined,
    signalStats: Array.isArray(row.signal_stats) ? row.signal_stats as LiveAnalysisSnapshot["signalStats"] : undefined,
    dna: (row.dna as LiveAnalysisSnapshot["dna"]) ?? undefined,
    dnaGeneratedAt: row.dna_generated_at ? String(row.dna_generated_at) : undefined,
    dnaModel: row.dna_model ? String(row.dna_model) : undefined,
  };
}

export async function loadCloudAnalyses() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { configured: false, authenticated: false, analyses: [] as LiveAnalysisSnapshot[] };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { configured: true, authenticated: false, analyses: [] as LiveAnalysisSnapshot[] };
  const base = "id,trend_id,trend_name,keywords,period_months,source,report,naver_signal,prompt_version,analyzed_at";
  const query = (columns: string) => supabase.from("trend_analyses").select(columns).order("created_at", { ascending: false }).limit(50).returns<CloudRow[]>();
  let { data, error } = await query(`${base},evidence,signal_stats,dna,dna_generated_at,dna_model`);
  if (error && /column/i.test(error.message)) ({ data, error } = await query(base));
  if (error) return { configured: true, authenticated: true, analyses: [] as LiveAnalysisSnapshot[], error: cloudHint(error.message) };
  return { configured: true, authenticated: true, analyses: (data || []).map(rowToSnapshot) };
}
