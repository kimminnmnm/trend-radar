"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInClient, type PersistenceResult } from "./cloud-storage";
import { addSavedTombstone, getSavedItems, getSavedTombstones, removeItem, removeSavedTombstone, saveItem } from "./storage";
import { getSupabaseBrowserClient } from "./supabase-browser";
import { isCreativePayload } from "./creative-collision";
import { isStudioProjectPayload } from "./content-production";
import { isPhenomenonPayload } from "./discovery";
import { isTrendWebPayload } from "./trend-web";
import { removeStoredAssets } from "./asset-storage";

/** 저장 항목이 참조하는 계정 저장소 이미지 경로. */
export function storagePathsOf(payload: unknown) {
  const paths = isCreativePayload(payload) ? payload.run.visuals.map((item) => item.storagePath) : isStudioProjectPayload(payload) ? payload.project.assets.filter((item) => item.status !== "AI CONCEPT VISUAL").map((item) => item.storagePath) : [];
  return [...new Set(paths.filter((path): path is string => Boolean(path)))];
}
import type { SavedInsightPayload, SavedItem, SavedItemTombstone, SavedPlanPayload } from "./types";

/*
 * Workspace Insights & Plans ↔ Supabase saved_items 동기화(기존 테이블 재사용, 마이그레이션 없음).
 *
 * saved_items에는 클라이언트 ID·수정 시각 컬럼이 없으므로 payload JSON에 함께 저장한다.
 *   payload = { v: 2, clientId, mode, createdAt, updatedAt, data, deletedAt? }
 * - 중복 방지: payload->>clientId로 기존 행을 찾아 갱신한다(새 행을 만들지 않음).
 * - 충돌: updatedAt이 더 최신인 쪽을 쓴다. 클라우드가 더 최신이면 덮어쓰지 않는다.
 * - 삭제: 클라우드 삭제는 내용을 지운 "삭제됨" 행(툼스톤)으로 바꾼다. 다른 브라우저의 사본이 다음 동기화에서
 *   다시 올라오지 않게 하기 위해서다. 클라우드 삭제가 실패하면 로컬도 지우지 않는다.
 * - 이전 형식(payload = {...plan, clientId, mode})도 읽는다.
 */

/** 열 수 있는 기획안 payload인지 검사한다. 이전 형식·손상된 클라우드 행이 화면을 멈추지 않게 한다. */
export function isPlanPayload(payload: unknown): payload is SavedPlanPayload {
  const p = payload as Partial<SavedPlanPayload> | null | undefined;
  return Boolean(p && p.kind === "content-plan" && p.plan && typeof p.plan.title === "string" && Array.isArray(p.trendKeys) && Array.isArray(p.trendNames) && Array.isArray(p.references) && p.brief);
}
export function isInsightPayload(payload: unknown): payload is SavedInsightPayload {
  const p = payload as Partial<SavedInsightPayload> | null | undefined;
  return Boolean(p && p.kind === "live-insight" && typeof p.trendId === "string" && typeof p.summary === "string");
}
const safePayload = (payload: unknown): SavedItem["payload"] => isPlanPayload(payload) || isInsightPayload(payload) || isCreativePayload(payload) || isStudioProjectPayload(payload) || isPhenomenonPayload(payload) || isTrendWebPayload(payload) ? payload : undefined;

export type CloudSavedItem = { rowId: string; item: SavedItem; updatedAt: string; deletedAt?: string; legacy: boolean };
type Row = { id: string; item_type: string; title: string; subtitle: string; payload: Record<string, unknown> | null; created_at: string };

const stamp = (item: SavedItem) => item.updatedAt ?? item.createdAt;
const newer = (a?: string, b?: string) => Boolean(a && (!b || new Date(a).getTime() > new Date(b).getTime()));

export function toSavedRow(userId: string, item: SavedItem) {
  return { user_id: userId, item_type: item.type, title: item.title, subtitle: item.subtitle, payload: { v: 2, clientId: item.id, mode: item.mode ?? null, createdAt: item.createdAt, updatedAt: stamp(item), data: item.payload ?? null } };
}

export function fromSavedRow(row: Row): CloudSavedItem | null {
  if (row.item_type !== "insight" && row.item_type !== "plan") return null;
  const payload = row.payload ?? {};
  if (payload.v === 2) {
    const item: SavedItem = { id: String(payload.clientId), type: row.item_type, title: row.title, subtitle: row.subtitle, createdAt: String(payload.createdAt ?? row.created_at), updatedAt: String(payload.updatedAt ?? row.created_at), mode: (payload.mode as SavedItem["mode"]) ?? undefined, payload: safePayload(payload.data) };
    return { rowId: row.id, item, updatedAt: item.updatedAt!, deletedAt: payload.deletedAt ? String(payload.deletedAt) : undefined, legacy: false };
  }
  // 이전 형식: payload에 기획안 본문과 clientId·mode가 섞여 있다.
  const { clientId, mode, ...rest } = payload as { clientId?: string; mode?: SavedItem["mode"] } & Record<string, unknown>;
  const data = safePayload(rest);
  const item: SavedItem = { id: clientId ? String(clientId) : `cloud-${row.id}`, type: row.item_type, title: row.title, subtitle: row.subtitle, createdAt: row.created_at, updatedAt: row.created_at, mode, payload: data };
  return { rowId: row.id, item, updatedAt: row.created_at, legacy: true };
}

/** 같은 clientId 중 가장 최신 행 하나. 이전 버전 앱이 만든 중복 행이 있어도 하나로 본다. */
export function latestByClientId(entries: CloudSavedItem[]) {
  const map = new Map<string, CloudSavedItem>();
  for (const entry of entries) { const prev = map.get(entry.item.id); if (!prev || newer(entry.deletedAt ?? entry.updatedAt, prev.deletedAt ?? prev.updatedAt)) map.set(entry.item.id, entry); }
  return map;
}

/**
 * 클라우드 항목을 로컬에 합칠 계획(순수 함수). 로컬 항목은 클라우드에 없다는 이유로 지우지 않는다.
 * - 클라우드 툼스톤이 로컬보다 최신 → 로컬에서 제거
 * - 이 브라우저에서만 숨긴 항목(local 툼스톤) → 클라우드 쪽이 그 뒤에 수정되지 않았다면 다시 가져오지 않음
 */
export function planSavedMerge(local: SavedItem[], cloud: CloudSavedItem[], tombstones: SavedItemTombstone[]) {
  const add: SavedItem[] = [], replace: SavedItem[] = [], remove: string[] = [];
  let hidden = 0;
  for (const entry of latestByClientId(cloud).values()) {
    const mine = local.find((item) => item.id === entry.item.id);
    const tomb = tombstones.find((item) => item.id === entry.item.id);
    if (entry.deletedAt) { if (mine && !newer(stamp(mine), entry.deletedAt)) remove.push(mine.id); continue; }
    if (tomb && !newer(entry.updatedAt, tomb.deletedAt)) { hidden += 1; continue; }
    if (!mine) add.push(entry.item);
    else if (newer(entry.updatedAt, stamp(mine))) replace.push(entry.item);
  }
  return { add, replace, remove, hidden };
}

/** 클라우드에 없거나 로컬이 더 최신인 로컬 항목. */
export function pendingSavedUploads(local: SavedItem[], cloud: CloudSavedItem[], tombstones: SavedItemTombstone[]) {
  const latest = latestByClientId(cloud);
  return local.filter((item) => {
    if (tombstones.some((tomb) => tomb.id === item.id)) return false;
    const entry = latest.get(item.id);
    if (!entry) return true;
    return newer(stamp(item), entry.deletedAt ?? entry.updatedAt);
  });
}

async function findRows(supabase: SupabaseClient, userId: string, clientId: string) {
  return supabase.from("saved_items").select("id,item_type,title,subtitle,payload,created_at").eq("user_id", userId).eq("payload->>clientId", clientId).order("created_at", { ascending: true }).limit(20);
}

export type SavedPush = { ok: true; rowId: string; action: "created" | "updated" | "kept-cloud-newer"; duplicates: number } | { ok: false; error: string; action?: "deleted-in-cloud" };

/** 한 항목을 저장한다. 같은 clientId 행이 있으면 갱신하고, 클라우드가 더 최신이거나 이후에 삭제됐으면 덮어쓰지 않는다. */
export async function pushSavedItem(supabase: SupabaseClient, userId: string, item: SavedItem): Promise<SavedPush> {
  const found = await findRows(supabase, userId, item.id);
  if (found.error) return { ok: false, error: found.error.message };
  const rows = (found.data ?? []) as Row[];
  const parsed = rows.map(fromSavedRow).filter((entry): entry is CloudSavedItem => Boolean(entry));
  const latest = latestByClientId(parsed).get(item.id);
  if (latest?.deletedAt && !newer(stamp(item), latest.deletedAt)) return { ok: false, error: "다른 브라우저에서 이미 삭제한 항목이라 다시 올리지 않았습니다.", action: "deleted-in-cloud" };
  if (latest && !latest.deletedAt && newer(latest.updatedAt, stamp(item))) return { ok: true, rowId: latest.rowId, action: "kept-cloud-newer", duplicates: rows.length - 1 };
  const row = toSavedRow(userId, item);
  const result = rows[0]
    ? await supabase.from("saved_items").update(row).eq("id", rows[0].id).eq("user_id", userId).select("id")
    : await supabase.from("saved_items").insert(row).select("id");
  if (result.error) return { ok: false, error: result.error.message };
  const id = (result.data as Array<{ id: string }> | null)?.[0]?.id;
  if (!id) return { ok: false, error: "Supabase에 반영된 행이 없습니다(권한 또는 RLS 확인 필요)." };
  return { ok: true, rowId: id, action: rows[0] ? "updated" : "created", duplicates: Math.max(0, rows.length - 1) };
}

/** Content Studio·WHY 저장: 브라우저 저장 후 클라우드 저장 결과를 실제 DB 응답으로 판단한다. */
export type CloudPrep = (session: { supabase: SupabaseClient; userId: string }, item: SavedItem) => Promise<{ cloud: SavedItem; local?: SavedItem; note?: string }>;
export async function saveItemEverywhere(input: SavedItem, prepareCloud?: CloudPrep): Promise<PersistenceResult> {
  const item = { ...input, updatedAt: new Date().toISOString() };
  const local = saveItem(item);
  removeSavedTombstone(item.id);
  const localText = local ? "Workspace(이 브라우저)에 저장했습니다" : "브라우저 저장 공간이 부족해 저장하지 못했습니다";
  if (!getSupabaseBrowserClient()) return { target: "local", local, cloud: "not-configured", message: `${localText}. 클라우드: Supabase 미설정` };
  const session = await signedInClient();
  if (!session) return { target: "local", local, cloud: "signed-out", message: `${localText}. 클라우드: 로그인하지 않아 저장하지 않았습니다.` };
  // 이미지가 있는 항목은 먼저 Storage에 올리고, DB에는 경로만 담은 사본을 저장한다.
  const prepared = prepareCloud ? await prepareCloud({ supabase: session.supabase, userId: session.user.id }, item) : { cloud: item };
  if (prepared.local) saveItem({ ...prepared.local, updatedAt: item.updatedAt });
  const result = await pushSavedItem(session.supabase, session.user.id, { ...prepared.cloud, updatedAt: item.updatedAt });
  const note = prepared.note ? ` ${prepared.note}` : "";
  if (!result.ok) return { target: "local", local, cloud: "failed", error: result.error, message: `${localText}. 클라우드 저장 실패: ${result.error}${note}` };
  return { target: "cloud", local, cloud: "saved", message: `${localText}. Supabase 계정에도 ${result.action === "created" ? "새로 저장" : "갱신"}했습니다(행 확인됨).${note}` };
}

export async function loadCloudSavedItems(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("saved_items").select("id,item_type,title,subtitle,payload,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, items: ((data ?? []) as Row[]).map(fromSavedRow).filter((entry): entry is CloudSavedItem => Boolean(entry)), rows: (data ?? []).length };
}

export type SavedSyncReport = { ok: boolean; message: string; added: number; replaced: number; removed: number; hidden: number; created: number; updated: number; kept: number; skippedDeleted: number; failed: number };
const emptyReport = (ok: boolean, message: string): SavedSyncReport => ({ ok, message, added: 0, replaced: 0, removed: 0, hidden: 0, created: 0, updated: 0, kept: 0, skippedDeleted: 0, failed: 0 });

export async function pullSavedItems(client?: SupabaseClient): Promise<SavedSyncReport> {
  const session = client ? { supabase: client, user: (await client.auth.getUser()).data.user } : await signedInClient();
  if (!session?.user) return emptyReport(false, "로그인이 필요합니다.");
  const cloud = await loadCloudSavedItems(session.supabase, session.user.id);
  if (!cloud.ok) return emptyReport(false, `불러오기 실패: ${cloud.error}`);
  const plan = planSavedMerge(getSavedItems(), cloud.items, getSavedTombstones());
  for (const item of [...plan.add, ...plan.replace]) saveItem(item);
  for (const id of plan.remove) { removeItem(id); addSavedTombstone({ id, scope: "all", deletedAt: new Date().toISOString() }); }
  return { ...emptyReport(true, `클라우드에서 ${plan.add.length + plan.replace.length}개를 가져왔습니다${plan.remove.length ? ` · 다른 곳에서 삭제된 ${plan.remove.length}개 정리` : ""}${plan.hidden ? ` · 이 브라우저에서 숨긴 ${plan.hidden}개 제외` : ""}.`), added: plan.add.length, replaced: plan.replace.length, removed: plan.remove.length, hidden: plan.hidden };
}

export async function pushAllSavedItems(client?: SupabaseClient, items?: SavedItem[]): Promise<SavedSyncReport> {
  const session = client ? { supabase: client, user: (await client.auth.getUser()).data.user } : await signedInClient();
  if (!session?.user) return emptyReport(false, "로그인이 필요합니다.");
  const report = emptyReport(true, "");
  const tombstones = getSavedTombstones();
  const errors: string[] = [];
  for (const item of (items ?? getSavedItems()).filter((entry) => !tombstones.some((tomb) => tomb.id === entry.id))) {
    const result = await pushSavedItem(session.supabase, session.user.id, item);
    if (result.ok) { if (result.action === "created") report.created += 1; else if (result.action === "updated") report.updated += 1; else report.kept += 1; }
    else if (result.action === "deleted-in-cloud") report.skippedDeleted += 1;
    else { report.failed += 1; errors.push(`${item.title}: ${result.error}`); }
  }
  report.ok = report.failed === 0;
  report.message = report.ok
    ? `Supabase에 ${report.created}개 새로 저장 · ${report.updated}개 갱신${report.kept ? ` · 클라우드가 더 최신인 ${report.kept}개 유지` : ""}${report.skippedDeleted ? ` · 다른 곳에서 삭제된 ${report.skippedDeleted}개 제외` : ""}.`
    : `${report.failed}개 저장 실패: ${errors.slice(0, 2).join(" / ")}`;
  return report;
}

/**
 * 삭제. scope "local"은 이 브라우저에서만 지우고(클라우드에는 남음), "all"은 클라우드 행을 삭제 표시로 바꾼 뒤 로컬에서 지운다.
 * 클라우드 처리가 실패하면 로컬도 그대로 둔다.
 */
export async function deleteSavedItem(item: SavedItem, scope: "local" | "all", client?: SupabaseClient): Promise<{ ok: boolean; message: string }> {
  const deletedAt = new Date().toISOString();
  if (scope === "local") {
    removeItem(item.id);
    addSavedTombstone({ id: item.id, scope: "local", deletedAt });
    return { ok: true, message: "이 브라우저에서만 지웠습니다. 클라우드 항목은 남아 있고, 이 브라우저로는 다시 가져오지 않습니다." };
  }
  const session = client ? { supabase: client, user: (await client.auth.getUser()).data.user } : await signedInClient();
  if (!session?.user) return { ok: false, message: "클라우드에서 지우려면 로그인이 필요합니다. 아무것도 지우지 않았습니다." };
  const found = await findRows(session.supabase, session.user.id, item.id);
  if (found.error) return { ok: false, message: `클라우드 삭제 실패: ${found.error.message}. 이 브라우저의 항목도 그대로 두었습니다.` };
  for (const row of (found.data ?? []) as Row[]) {
    const tombstone = { title: "(삭제됨)", subtitle: "", payload: { v: 2, clientId: item.id, mode: item.mode ?? null, createdAt: item.createdAt, updatedAt: deletedAt, deletedAt, data: null } };
    const result = await session.supabase.from("saved_items").update(tombstone).eq("id", row.id).eq("user_id", session.user.id).select("id");
    if (result.error || !(result.data as unknown[] | null)?.length) return { ok: false, message: `클라우드 삭제 실패: ${result.error?.message ?? "반영된 행 없음"}. 이 브라우저의 항목도 그대로 두었습니다.` };
  }
  removeItem(item.id);
  addSavedTombstone({ id: item.id, scope: "all", deletedAt });
  // 이 항목이 쓰던 계정 저장소 이미지도 지운다(다른 항목이 참조하지 않는 경로만: 경로에 항목 범위가 들어 있다).
  const paths = storagePathsOf(item.payload);
  const storage = paths.length ? await removeStoredAssets(session.supabase, paths) : null;
  const storageNote = storage ? (storage.ok ? ` 저장소 이미지 ${storage.removed}개 삭제.` : ` 저장소 이미지 삭제 실패: ${storage.error}`) : "";
  return { ok: true, message: ((found.data ?? []).length ? "브라우저와 클라우드에서 지웠습니다. 다른 브라우저에서도 다음 동기화 때 정리됩니다." : "이 브라우저에서 지웠습니다(클라우드에는 저장되지 않았던 항목).") + storageNote };
}

/** 이 브라우저에서만 숨긴 항목을 다시 가져올 수 있게 한다. */
export function restoreHiddenSavedItems() {
  for (const tomb of getSavedTombstones().filter((item) => item.scope === "local")) removeSavedTombstone(tomb.id);
}
