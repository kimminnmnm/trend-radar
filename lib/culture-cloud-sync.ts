"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCloudAnalyses, upsertCloudAnalysis } from "./cloud-storage";
import { CULTURE_ALIAS_RULES_VERSION } from "./culture-alias-rules";
import { culturalRelationshipResultSchema } from "./cultural-relationship-engine";
import { restoreCultureMetadata } from "./culture-database";
import { relationRecordKey, syncCultureLedger, type CultureLedger } from "./culture-pipeline";
import { readCultureLedger, syncCultureCloud, syncCultureLedgerLocal, type CloudSyncStatus } from "./culture-pipeline-client";
import { getLiveAnalyses, saveCultureLedger, saveLiveAnalysis, updateLiveAnalysis } from "./storage";
import { getSupabaseBrowserClient } from "./supabase-browser";
import type { CultureRelationRecord, CultureVersionRecord, LiveAnalysisSnapshot } from "./types";

/*
 * Culture Map ↔ Supabase 동기화.
 * - push: 이 브라우저의 분석(trend_analyses) → 메타데이터 버전 → 관계를 저장한다. 같은 분석·버전·관계는 중복 저장하지 않는다.
 * - pull: 계정의 분석·버전·관계를 읽어 이 브라우저에 합친다. 로컬 데이터는 지우지 않는다.
 * - count: 성공 여부는 localStorage가 아니라 Supabase의 실제 행 수로 확인한다(RLS 때문에 본인 행만 센다).
 * 외부 유료 API(OpenAI·NAVER·Meta)는 호출하지 않는다.
 */

export type CloudVersionRow = { id: string; trend_id: string; version_number: number; analyzed_at: string; metadata: unknown; model: string | null; prompt_version: string | null; embedding_model: string | null; created_at?: string };
export type CloudRelationRow = { source_analysis_version_id: string; target_analysis_version_id: string; relation_type: string; metadata: Record<string, unknown> | null };
export type CloudTrendRow = { id: string; trend_key: string; display_name: string };

const sameInstant = (a?: string, b?: string) => Boolean(a && b && new Date(a).getTime() === new Date(b).getTime());

/**
 * 클라우드 분석을 로컬 목록에 합친다.
 * - 로컬에 없는 트렌드: 추가
 * - 같은 분석 시각: 로컬에 비어 있는 DNA만 채운다(로컬 값은 덮어쓰지 않음)
 * - 클라우드가 더 최신: 교체(호출 전에 로컬 DNA를 버전 원장에 보존해야 한다)
 * - 로컬이 더 최신: 유지
 */
export function mergeCloudSnapshots(local: LiveAnalysisSnapshot[], cloud: LiveAnalysisSnapshot[]) {
  const newestCloud = new Map<string, LiveAnalysisSnapshot>();
  for (const item of cloud) {
    if (!item.whyReport) continue;
    const prev = newestCloud.get(item.trendId);
    if (!prev || new Date(item.analyzedAt) > new Date(prev.analyzedAt) || (sameInstant(item.analyzedAt, prev.analyzedAt) && item.dna && !prev.dna)) newestCloud.set(item.trendId, item);
  }
  const added: LiveAnalysisSnapshot[] = [], replaced: LiveAnalysisSnapshot[] = [], filled: Array<{ trendId: string; patch: Partial<LiveAnalysisSnapshot> }> = [];
  for (const item of newestCloud.values()) {
    const mine = local.find((snapshot) => snapshot.trendId === item.trendId);
    if (!mine) added.push(item);
    else if (sameInstant(mine.analyzedAt, item.analyzedAt)) {
      if (!mine.dna && item.dna) filled.push({ trendId: mine.trendId, patch: { dna: item.dna, dnaGeneratedAt: item.dnaGeneratedAt, dnaModel: item.dnaModel } });
      if (!mine.evidence?.length && item.evidence?.length) filled.push({ trendId: mine.trendId, patch: { evidence: item.evidence } });
    } else if (new Date(item.analyzedAt) > new Date(mine.analyzedAt)) replaced.push(item);
  }
  return { added, replaced, filled };
}

/** 클라우드 버전·관계를 로컬 원장에 합친다. 같은 (트렌드, DNA 시각)은 같은 버전으로 본다. */
export function importCloudLedger(ledger: CultureLedger, trends: CloudTrendRow[], versions: CloudVersionRow[], relations: CloudRelationRow[], now = new Date().toISOString()) {
  const nextVersions = [...ledger.versions];
  const nextRelations = [...ledger.relations];
  const trendKey = new Map(trends.map((row) => [row.id, row]));
  const byUuid = new Map<string, CultureVersionRecord>();
  let versionsAdded = 0, relationsAdded = 0, relationsSkipped = 0;
  for (const row of [...versions].sort((a, b) => a.version_number - b.version_number)) {
    const trend = trendKey.get(row.trend_id);
    if (!trend) continue;
    let metadata;
    try { metadata = restoreCultureMetadata(row.metadata); } catch { continue; }
    const cloud = { trendUuid: row.trend_id, versionUuid: row.id, versionNumber: row.version_number };
    const index = nextVersions.findIndex((item) => item.trendId === trend.trend_key && sameInstant(item.analyzedAt, row.analyzed_at));
    if (index >= 0) {
      nextVersions[index] = { ...nextVersions[index], cloud };
      byUuid.set(row.id, nextVersions[index]);
      continue;
    }
    const taken = new Set(nextVersions.filter((item) => item.trendId === trend.trend_key).map((item) => item.version));
    const version = taken.has(row.version_number) ? Math.max(0, ...taken) + 1 : row.version_number;
    const record: CultureVersionRecord = { trendId: trend.trend_key, trendName: trend.display_name, version, analyzedAt: metadata.sourceAnalyzedAt, recordedAt: now, whyAnalyzedAt: metadata.sourceAnalyzedAt, model: row.model ?? undefined, promptVersion: row.prompt_version ?? undefined, hasEmbedding: Boolean(row.embedding_model), metadata, cloud };
    nextVersions.push(record);
    byUuid.set(row.id, record);
    versionsAdded += 1;
  }
  const seenPairs = new Set<string>();
  for (const row of relations) {
    const pairId = `${row.source_analysis_version_id}|${row.target_analysis_version_id}`;
    if (seenPairs.has(pairId)) continue;
    const source = byUuid.get(row.source_analysis_version_id), target = byUuid.get(row.target_analysis_version_id);
    const meta = row.metadata ?? {};
    const parsed = culturalRelationshipResultSchema.safeParse(meta.result);
    // 계산 결과가 없거나(이전 저장분) 다른 동의어 규칙으로 계산된 관계는 가져오지 않고 로컬에서 다시 계산한다.
    if (!source || !target || !parsed.success || meta.aliasRulesVersion !== CULTURE_ALIAS_RULES_VERSION) { relationsSkipped += 1; continue; }
    seenPairs.add(pairId);
    const key = relationRecordKey({ trendId: source.trendId, version: source.version }, { trendId: target.trendId, version: target.version });
    if (nextRelations.some((item) => item.key === key)) continue;
    const [first, second] = source.trendId < target.trendId ? [source, target] : [target, source];
    const record: CultureRelationRecord = { key, sourceTrendId: first.trendId, targetTrendId: second.trendId, sourceVersion: first.version, targetVersion: second.version, computedAt: String(meta.computedAt ?? now), result: parsed.data, cloudSavedAt: now };
    nextRelations.push(record);
    relationsAdded += 1;
  }
  return { ledger: { versions: nextVersions, relations: nextRelations }, versionsAdded, relationsAdded, relationsSkipped };
}

async function session(client?: SupabaseClient) {
  const supabase = client ?? getSupabaseBrowserClient();
  if (!supabase) return { ok: false as const, reason: "Supabase가 설정되지 않았습니다." };
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false as const, reason: "로그인이 필요합니다." };
  return { ok: true as const, supabase, userId: data.user.id };
}

export type PullReport = { ok: boolean; message: string; analysesAdded: number; analysesReplaced: number; analysesFilled: number; versionsAdded: number; relationsAdded: number; relationsSkipped: number };

export async function pullCultureCloud(client?: SupabaseClient): Promise<PullReport> {
  const empty = { analysesAdded: 0, analysesReplaced: 0, analysesFilled: 0, versionsAdded: 0, relationsAdded: 0, relationsSkipped: 0 };
  const auth = await session(client);
  if (!auth.ok) return { ok: false, message: auth.reason, ...empty };
  const cloud = await loadCloudAnalyses(auth.supabase, 200);
  if (cloud.error) return { ok: false, message: `분석 불러오기 실패: ${cloud.error}`, ...empty };
  // 교체 전에 로컬 DNA를 버전 원장에 남긴다.
  syncCultureLedgerLocal(getLiveAnalyses());
  const merged = mergeCloudSnapshots(getLiveAnalyses(), cloud.analyses);
  for (const item of [...merged.added, ...merged.replaced]) saveLiveAnalysis(item);
  for (const { trendId, patch } of merged.filled) updateLiveAnalysis(trendId, patch);

  const [trends, versions, relations] = await Promise.all([
    auth.supabase.from("culture_trends").select("id,trend_key,display_name").eq("user_id", auth.userId),
    auth.supabase.from("culture_analysis_versions").select("id,trend_id,version_number,analyzed_at,metadata,model,prompt_version,embedding_model").eq("user_id", auth.userId),
    auth.supabase.from("culture_relations").select("source_analysis_version_id,target_analysis_version_id,relation_type,metadata").eq("user_id", auth.userId),
  ]);
  const failed = trends.error ?? versions.error ?? relations.error;
  if (failed) return { ok: false, message: `Culture Map 불러오기 실패: ${failed.message}`, ...empty, analysesAdded: merged.added.length, analysesReplaced: merged.replaced.length, analysesFilled: merged.filled.length };
  const imported = importCloudLedger(readCultureLedger(), (trends.data ?? []) as CloudTrendRow[], (versions.data ?? []) as CloudVersionRow[], (relations.data ?? []) as CloudRelationRow[]);
  // 클라우드 관계가 없는 쌍은 로컬에서 계산해 채운다(네트워크 없음).
  const completed = syncCultureLedger(imported.ledger, getLiveAnalyses());
  saveCultureLedger(completed.ledger.versions, completed.ledger.relations);
  const report = { analysesAdded: merged.added.length, analysesReplaced: merged.replaced.length, analysesFilled: merged.filled.length, versionsAdded: imported.versionsAdded, relationsAdded: imported.relationsAdded, relationsSkipped: imported.relationsSkipped };
  return { ok: true, message: `Supabase에서 분석 ${report.analysesAdded + report.analysesReplaced}개 · 메타데이터 버전 ${report.versionsAdded}개 · 관계 ${report.relationsAdded}쌍을 가져왔습니다.`, ...report };
}

export type PushReport = { ok: boolean; message: string; analysesCreated: number; analysesUpdated: number; cloud: CloudSyncStatus | null };

export async function pushCultureCloud(client?: SupabaseClient): Promise<PushReport> {
  const auth = await session(client);
  if (!auth.ok) return { ok: false, message: auth.reason, analysesCreated: 0, analysesUpdated: 0, cloud: null };
  const snapshots = getLiveAnalyses().filter((item) => item.whyReport);
  const ids = new Map<string, string>();
  let created = 0, updated = 0;
  for (const snapshot of snapshots) {
    const result = await upsertCloudAnalysis(auth.supabase, auth.userId, snapshot);
    if (!result.ok) return { ok: false, message: `분석 저장 실패(${snapshot.trendName}): ${result.error}`, analysesCreated: created, analysesUpdated: updated, cloud: null };
    ids.set(snapshot.trendId, result.id);
    if (result.created) created += 1; else updated += 1;
  }
  const local = syncCultureLedgerLocal(snapshots);
  const synced = await syncCultureCloud(local.ledger, snapshots, auth.supabase, ids);
  if (synced.status.versions || synced.status.relations) saveCultureLedger(synced.ledger.versions, synced.ledger.relations);
  const ok = synced.status.status !== "unavailable";
  return { ok, message: ok ? `분석 ${created}개 새로 저장 · ${updated}개 갱신. ${synced.status.message}` : synced.status.message, analysesCreated: created, analysesUpdated: updated, cloud: synced.status };
}

export type CloudRowCounts = { ok: boolean; message?: string; counts: Record<string, number>; duplicateAnalyses: number };
export const CULTURE_CLOUD_TABLES = ["trend_analyses", "culture_trends", "culture_analysis_versions", "culture_trend_attributes", "culture_evidence_items", "culture_relations"] as const;

/** 본인 계정의 실제 Supabase 행 수. 같은 (trend_id, analyzed_at) 분석 행이 2개 이상이면 중복으로 센다. */
export async function countCultureCloudRows(client?: SupabaseClient): Promise<CloudRowCounts> {
  const auth = await session(client);
  if (!auth.ok) return { ok: false, message: auth.reason, counts: {}, duplicateAnalyses: 0 };
  const counts: Record<string, number> = {};
  for (const table of CULTURE_CLOUD_TABLES) {
    const { count, error } = await auth.supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", auth.userId);
    if (error) return { ok: false, message: `${table}: ${error.message}`, counts, duplicateAnalyses: 0 };
    counts[table] = count ?? 0;
  }
  const { data, error } = await auth.supabase.from("trend_analyses").select("trend_id,analyzed_at").eq("user_id", auth.userId).limit(1000);
  if (error) return { ok: false, message: error.message, counts, duplicateAnalyses: 0 };
  const seen = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ trend_id: string; analyzed_at: string }>) { const key = `${row.trend_id}|${new Date(row.analyzed_at).toISOString()}`; seen.set(key, (seen.get(key) ?? 0) + 1); }
  return { ok: true, counts, duplicateAnalyses: [...seen.values()].filter((value) => value > 1).reduce((sum, value) => sum + value - 1, 0) };
}
