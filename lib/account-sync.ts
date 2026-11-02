"use client";

import { useSyncExternalStore } from "react";
import { listCloudAnalysisKeys, pendingAnalysisUploads, signedInClient } from "./cloud-storage";
import { pullCultureCloud, pushCultureCloud } from "./culture-cloud-sync";
import { pullVisualDna, pushAllVisualDna } from "./visual-dna-cloud";
import { loadCloudSavedItems, pendingSavedUploads, pullSavedItems, pushAllSavedItems } from "./saved-items-cloud";
import { claimLegacyInstagramData, getLiveAnalyses, getSavedItems, getSavedTombstones, setSessionOwner } from "./storage";
import { getSupabaseBrowserClient } from "./supabase-browser";

/*
 * 계정 동기화 상태(앱 전체 공용). Overview·Workspace·Culture Map이 같은 로그인 상태와 동기화 결과를 본다.
 * 로그인하면: 현재 계정을 저장소 소유자로 설정 → 클라우드에서 분석·Culture Map·Insights & Plans를 불러옴
 *            → 이 브라우저에만 있는 항목 수를 실제 DB 조회로 계산(업로드는 사용자가 승인할 때만).
 * 로그아웃하면: 소유자를 비운다(그 계정 항목은 지우지 않고 숨김).
 */
export type SyncPhase = "checking" | "not-configured" | "signed-out" | "syncing" | "ready" | "error";
export type AccountSyncState = {
  phase: SyncPhase;
  userId: string | null;
  email: string | null;
  message: string;
  error?: string;
  pendingAnalyses: number;
  pendingSaved: number;
  cloudAnalyses: number | null;
  cloudSaved: number | null;
  lastSyncedAt?: string;
  uploading: boolean;
};

let state: AccountSyncState = { phase: "checking", userId: null, email: null, message: "", pendingAnalyses: 0, pendingSaved: 0, cloudAnalyses: null, cloudSaved: null, uploading: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<AccountSyncState>) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
export const subscribeAccountSync = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getAccountSync = () => state;
const SERVER_STATE: AccountSyncState = { ...state };
export const getServerAccountSync = () => SERVER_STATE;

/** 업로드가 필요한 항목 수를 실제 DB 행과 비교해 다시 센다. */
export async function refreshPending() {
  const session = await signedInClient();
  if (!session) return;
  const [analyses, saved] = await Promise.all([listCloudAnalysisKeys(session.supabase, session.user.id), loadCloudSavedItems(session.supabase, session.user.id)]);
  if (!analyses.ok || !saved.ok) { set({ phase: "error", error: analyses.ok ? (saved.ok ? undefined : saved.error) : analyses.error, message: "클라우드 상태를 확인하지 못했습니다." }); return; }
  set({
    pendingAnalyses: pendingAnalysisUploads(getLiveAnalyses(), analyses.rows).length,
    pendingSaved: pendingSavedUploads(getSavedItems(), saved.items, getSavedTombstones()).length,
    cloudAnalyses: new Set(analyses.rows.map((row) => row.trend_id)).size,
    cloudSaved: saved.items.filter((item) => !item.deletedAt).length,
  });
}

let syncing: Promise<void> | null = null;
/** 로그인 계정의 클라우드 데이터를 불러와 이 브라우저와 병합한다(삭제·무조건 덮어쓰기 없음). */
export function syncAccount(force = false) {
  if (syncing && !force) return syncing;
  syncing = (async () => {
    set({ phase: "syncing", message: "계정의 클라우드 데이터를 불러오는 중…", error: undefined });
    const culture = await pullCultureCloud();
    const saved = await pullSavedItems();
    // Visual DNA(0006): 테이블이 없어도 다른 동기화는 계속한다.
    const visual = await pullVisualDna();
    if (!culture.ok || !saved.ok) {
      set({ phase: "error", message: "클라우드에서 불러오지 못했습니다. 이 브라우저 데이터는 그대로입니다.", error: [culture.ok ? "" : culture.message, saved.ok ? "" : saved.message].filter(Boolean).join(" / ") });
      return;
    }
    await refreshPending();
    if (state.phase === "error") return;
    set({ phase: "ready", lastSyncedAt: new Date().toISOString(), message: `클라우드 동기화 완료 · 분석 ${culture.analysesAdded + culture.analysesReplaced}개 · 인사이트·기획안 ${saved.added + saved.replaced}개 · Visual DNA ${visual.restored}개 가져옴${"missingTable" in visual && visual.missingTable ? " (Visual DNA 테이블 미적용: 0006)" : ""}` });
  })().finally(() => { syncing = null; });
  return syncing;
}

/** 사용자가 승인한 경우에만 호출: 이 브라우저의 분석·Culture Map·Insights & Plans를 계정에 업로드(중복 없이). */
export async function uploadLocalToAccount() {
  set({ uploading: true, message: "이 브라우저의 데이터를 계정에 올리는 중…", error: undefined });
  const culture = await pushCultureCloud();
  const saved = await pushAllSavedItems();
  const visual = await pushAllVisualDna();
  await refreshPending();
  const ok = culture.ok && saved.ok;
  set({ uploading: false, phase: ok ? "ready" : "error", message: ok ? `업로드 완료(DB 응답 확인) · ${culture.message} · ${saved.message}${visual.ok ? ` · ${visual.message}` : ` · Visual DNA: ${visual.message}`}` : "일부 업로드에 실패했습니다.", error: ok ? undefined : [culture.ok ? "" : culture.message, saved.ok ? "" : saved.message].filter(Boolean).join(" / ") });
  return ok;
}

let started = false;
/** 앱에서 한 번 호출. 로그인 상태 변화를 구독하고 소유자 설정·동기화를 실행한다. */
export function startAccountSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) { set({ phase: "not-configured", message: "" }); return; }
  const apply = (user: { id: string; email?: string } | null) => {
    if (!user) {
      setSessionOwner(null);
      set({ phase: "signed-out", userId: null, email: null, message: "", pendingAnalyses: 0, pendingSaved: 0, cloudAnalyses: null, cloudSaved: null });
      return;
    }
    const changed = state.userId !== user.id;
    // Legacy Pulse data predates account ownership. Claim it locally once before
    // switching the visible account; upload remains an explicit user action.
    claimLegacyInstagramData(user.id);
    setSessionOwner(user.id);
    set({ userId: user.id, email: user.email ?? null });
    if (changed) void syncAccount(true);
  };
  void supabase.auth.getUser().then(({ data }) => apply(data.user ? { id: data.user.id, email: data.user.email ?? undefined } : null));
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    apply(session?.user ? { id: session.user.id, email: session.user.email ?? undefined } : null);
  });
}

/** 앱 어디서든 같은 계정 동기화 상태를 읽는다. */
export function useAccountSync() { return useSyncExternalStore(subscribeAccountSync, getAccountSync, getServerAccountSync); }
