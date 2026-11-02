"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IgPulseReport, InstagramManualSearchRecord } from "./types";
import {
  getIgDismissed,
  getIgPulseReports,
  getIgTrackedTags,
  getInstagramManualSearches,
  igPulseReportId,
  IG_PULSE_RETENTION,
  saveIgDismissed,
  saveIgPulseReports,
  saveIgTrackedTags,
  saveInstagramManualSearch,
} from "./storage";
import { getSupabaseBrowserClient } from "./supabase-browser";

type PulseRow = {
  report_id: string;
  generated_at: string;
  measurement_results: unknown;
  updated_at?: string;
};

export type PulseCloudResult = {
  ok: boolean;
  message: string;
  reportCount: number;
  lastSyncedAt?: string;
  missingTable?: boolean;
  localOnlyCount?: number;
};

const missingTable = (message: string) => /instagram_pulse|schema cache|does not exist/i.test(message);
const failure = (message: string): PulseCloudResult => ({
  ok: false,
  message: missingTable(message) ? "Instagram Pulse cloud table is not ready. Apply migration 202610300007." : message,
  reportCount: getIgPulseReports().length,
  missingTable: missingTable(message),
});

async function authenticated(client?: SupabaseClient) {
  const supabase = client ?? getSupabaseBrowserClient();
  if (!supabase) return { ok: false as const, message: "Supabase is not configured." };
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false as const, message: error?.message ?? "Sign in to use cloud sync." };
  return { ok: true as const, supabase, userId: data.user.id };
}

function validReport(value: unknown): value is IgPulseReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<IgPulseReport>;
  return typeof report.generatedAt === "string" && Array.isArray(report.items) && Array.isArray(report.deferred) && Array.isArray(report.failed);
}

/** Merge is non-destructive. A matching ID or generated timestamp represents one measurement. */
export function mergeIgPulseReports(local: IgPulseReport[], cloud: IgPulseReport[]) {
  const merged: IgPulseReport[] = [];
  const ids = new Set<string>();
  const times = new Set<string>();
  for (const candidate of [...cloud, ...local].sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())) {
    const id = candidate.id ?? igPulseReportId(candidate);
    if (ids.has(id) || times.has(candidate.generatedAt)) continue;
    ids.add(id);
    times.add(candidate.generatedAt);
    merged.push({ ...candidate, id });
  }
  return merged.slice(0, IG_PULSE_RETENTION);
}

type CloudPreferences = { tracked: string[]; dismissed: Array<{ tag: string; at: string }> };
const tagKey = (tag: string) => tag.toLocaleLowerCase();
const isDismissed = (item: unknown): item is { tag: string; at: string } => Boolean(item) && typeof item === "object" && typeof (item as { tag?: unknown }).tag === "string" && typeof (item as { at?: unknown }).at === "string";

/**
 * 추적 목록 병합(로컬 ∪ 클라우드). 사용자가 명시적으로 추적 해제한 태그(dismissed)만 뺀다.
 * 빈 로컬 목록이 클라우드 목록을 지우지 못한다. 해제 기록은 태그별 최신 시각을 남긴다.
 */
export function mergePulsePreferences(local: CloudPreferences, cloud: CloudPreferences): CloudPreferences {
  const byTag = new Map<string, { tag: string; at: string }>();
  for (const item of [...cloud.dismissed, ...local.dismissed]) {
    const prev = byTag.get(tagKey(item.tag));
    if (!prev || Date.parse(item.at) > Date.parse(prev.at)) byTag.set(tagKey(item.tag), item);
  }
  // 이 브라우저 추적 목록에 있는 태그는 사용자가 다시 추가한 것이므로 예전 해제 기록보다 우선한다(해제 기록에서 뺀다).
  const localKeys = new Set(local.tracked.map(tagKey));
  const dismissed = [...byTag.values()].filter((item) => !localKeys.has(tagKey(item.tag))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 50);
  const removed = new Set(dismissed.map((item) => tagKey(item.tag)));
  const seen = new Set<string>();
  const tracked = [...local.tracked, ...cloud.tracked].filter((tag) => { const k = tagKey(tag); if (seen.has(k) || removed.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
  return { tracked, dismissed };
}

async function readCloudPreferences(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("instagram_pulse_preferences").select("tracked_tags,dismissed_tags,updated_at").eq("user_id", userId).limit(1);
  if (error) return { error: error.message };
  const row = ((data ?? []) as Array<{ tracked_tags?: unknown; dismissed_tags?: unknown }>)[0];
  return { value: row ? { tracked: Array.isArray(row.tracked_tags) ? row.tracked_tags.filter((tag): tag is string => typeof tag === "string") : [], dismissed: Array.isArray(row.dismissed_tags) ? row.dismissed_tags.filter(isDismissed) : [] } : null };
}

/** 클라우드 추적 설정을 읽어 병합한 뒤 저장한다(덮어쓰기 아님). 병합 결과는 로컬에도 반영한다. */
async function upsertPreferences(supabase: SupabaseClient, userId: string) {
  const cloud = await readCloudPreferences(supabase, userId);
  if ("error" in cloud) return { data: null, error: { message: cloud.error! } };
  const merged = mergePulsePreferences({ tracked: getIgTrackedTags(), dismissed: getIgDismissed() }, cloud.value ?? { tracked: [], dismissed: [] });
  saveIgTrackedTags(merged.tracked);
  saveIgDismissed(merged.dismissed);
  return supabase.from("instagram_pulse_preferences").upsert({ user_id: userId, tracked_tags: merged.tracked, dismissed_tags: merged.dismissed }, { onConflict: "user_id" }).select("user_id,updated_at");
}

export async function pushIgPulsePreferences(client?: SupabaseClient): Promise<PulseCloudResult> {
  const auth = await authenticated(client);
  if (!auth.ok) return failure(auth.message);
  const { data, error } = await upsertPreferences(auth.supabase, auth.userId);
  if (error) return failure(error.message);
  if (!Array.isArray(data) || data.length === 0) return failure("Supabase did not confirm the Pulse preferences row.");
  const savedAt = new Date().toISOString();
  return { ok: true, message: "Tracked and dismissed hashtags were confirmed by Supabase.", reportCount: getIgPulseReports().length, lastSyncedAt: savedAt };
}

export async function pushIgPulseReport(report: IgPulseReport, client?: SupabaseClient): Promise<PulseCloudResult> {
  const auth = await authenticated(client);
  if (!auth.ok) return failure(auth.message);
  const id = report.id ?? igPulseReportId(report);
  const { data, error } = await auth.supabase.from("instagram_pulse_reports").upsert({
    user_id: auth.userId,
    report_id: id,
    generated_at: report.generatedAt,
    measured_hashtags: report.items.map((item) => item.tag),
    measurement_results: { ...report, id, ownerId: undefined, cloudSavedAt: undefined },
    data_source: "meta_instagram_graph_api",
  }, { onConflict: "user_id,report_id" }).select("report_id,updated_at");
  if (error) return failure(error.message);
  if (!Array.isArray(data) || !data.some((row) => (row as { report_id?: string }).report_id === id)) return failure("Supabase did not confirm the saved Pulse report.");
  // 보고서 저장은 추적 목록을 건드리지 않는다(빈 로컬 목록이 클라우드 추적 목록을 덮어쓰던 문제).
  const savedAt = new Date().toISOString();
  saveIgPulseReports(mergeIgPulseReports(getIgPulseReports(), [{ ...report, id, ownerId: auth.userId, cloudSavedAt: savedAt }]));
  const countQuery = await auth.supabase.from("instagram_pulse_reports").select("report_id", { count: "exact", head: true }).eq("user_id", auth.userId);
  if (countQuery.error) return failure(countQuery.error.message);
  return { ok: true, message: "Pulse report was confirmed by Supabase.", reportCount: countQuery.count ?? 1, lastSyncedAt: savedAt, localOnlyCount: getIgPulseReports().filter((item) => !item.cloudSavedAt).length };
}

export async function pushAllIgPulseCloud(client?: SupabaseClient): Promise<PulseCloudResult> {
  const auth = await authenticated(client);
  if (!auth.ok) return failure(auth.message);
  const reports = getIgPulseReports();
  for (const report of reports) {
    const result = await pushIgPulseReport(report, auth.supabase);
    if (!result.ok) return result;
  }
  const preferences = await upsertPreferences(auth.supabase, auth.userId);
  if (preferences.error) return failure(preferences.error.message);
  const { count, error } = await auth.supabase.from("instagram_pulse_reports").select("report_id", { count: "exact", head: true }).eq("user_id", auth.userId);
  if (error) return failure(error.message);
  const savedAt = new Date().toISOString();
  return { ok: true, message: `${reports.length} local report(s) uploaded; database count confirmed.`, reportCount: count ?? reports.length, lastSyncedAt: savedAt, localOnlyCount: 0 };
}

export async function pullIgPulseCloud(client?: SupabaseClient): Promise<PulseCloudResult> {
  const auth = await authenticated(client);
  if (!auth.ok) return failure(auth.message);
  const reportsQuery = await auth.supabase.from("instagram_pulse_reports").select("report_id,generated_at,measurement_results,updated_at").eq("user_id", auth.userId).order("generated_at", { ascending: false }).limit(IG_PULSE_RETENTION);
  if (reportsQuery.error) return failure(reportsQuery.error.message);
  const preferencesQuery = await auth.supabase.from("instagram_pulse_preferences").select("tracked_tags,dismissed_tags,updated_at").eq("user_id", auth.userId).limit(1);
  if (preferencesQuery.error) return failure(preferencesQuery.error.message);

  const cloud = ((reportsQuery.data ?? []) as PulseRow[]).flatMap((row) => validReport(row.measurement_results) ? [{
    ...row.measurement_results,
    id: row.report_id,
    generatedAt: row.generated_at,
    ownerId: auth.userId,
    cloudSavedAt: row.updated_at,
  }] : []);
  saveIgPulseReports(mergeIgPulseReports(getIgPulseReports(), cloud));

  const row = ((preferencesQuery.data ?? []) as Array<{ tracked_tags?: unknown; dismissed_tags?: unknown }>)[0];
  if (row) {
    const merged = mergePulsePreferences(
      { tracked: getIgTrackedTags(), dismissed: getIgDismissed() },
      { tracked: Array.isArray(row.tracked_tags) ? row.tracked_tags.filter((tag): tag is string => typeof tag === "string") : [], dismissed: Array.isArray(row.dismissed_tags) ? row.dismissed_tags.filter(isDismissed) : [] },
    );
    saveIgTrackedTags(merged.tracked);
    saveIgDismissed(merged.dismissed);
  }
  const syncedAt = new Date().toISOString();
  const localOnlyCount = getIgPulseReports().filter((item) => !item.cloudSavedAt).length;
  return { ok: true, message: localOnlyCount ? `${cloud.length} cloud report(s) loaded; ${localOnlyCount} local report(s) still need upload.` : `${cloud.length} cloud report(s) loaded and safely merged.`, reportCount: cloud.length, lastSyncedAt: syncedAt, localOnlyCount };
}

export const instagramManualSearchId = (record: Pick<InstagramManualSearchRecord, "query" | "collectedAt">) => `manual-${record.collectedAt}-${record.query.toLocaleLowerCase()}`;

export async function pushInstagramManualSearch(record: InstagramManualSearchRecord, client?: SupabaseClient) {
  const auth = await authenticated(client);
  if (!auth.ok) return { ok: false as const, message: auth.message };
  const { data, error } = await auth.supabase.from("instagram_manual_search_history").upsert({
    user_id: auth.userId,
    search_id: record.id,
    query: record.query,
    hashtag_id: record.hashtagId,
    collected_at: record.collectedAt,
    cache_hit: record.cacheHit,
    used_new_slot: record.usedNewSlot,
    result: record.result,
  }, { onConflict: "user_id,search_id" }).select("search_id,updated_at");
  if (error) return { ok: false as const, message: error.message };
  if (!Array.isArray(data) || data.length === 0) return { ok: false as const, message: "Supabase did not confirm the manual search history row." };
  saveInstagramManualSearch({ ...record, ownerId: auth.userId, cloudSavedAt: new Date().toISOString() });
  return { ok: true as const };
}

export async function pullInstagramManualSearches(client?: SupabaseClient) {
  const auth = await authenticated(client);
  if (!auth.ok) return { ok: false as const, message: auth.message };
  const { data, error } = await auth.supabase.from("instagram_manual_search_history").select("search_id,query,hashtag_id,collected_at,cache_hit,used_new_slot,result,updated_at").eq("user_id", auth.userId).order("collected_at", { ascending: false }).limit(200);
  if (error) return { ok: false as const, message: error.message };
  for (const row of (data ?? []) as Array<Record<string, unknown>>) saveInstagramManualSearch({
    id: String(row.search_id), ownerId: auth.userId, cloudSavedAt: String(row.updated_at ?? ""), query: String(row.query),
    hashtagId: row.hashtag_id ? String(row.hashtag_id) : null, collectedAt: String(row.collected_at), cacheHit: Boolean(row.cache_hit), usedNewSlot: Boolean(row.used_new_slot), result: row.result,
  });
  return { ok: true as const, count: getInstagramManualSearches().length };
}
