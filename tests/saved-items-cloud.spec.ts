import { expect, test } from "@playwright/test";
import base from "./fixtures/live-pipeline.json";
import extra from "./fixtures/culture-validation.json";
import { pendingAnalysisUploads, upsertCloudAnalysis, loadCloudAnalyses } from "../lib/cloud-storage";
import { deleteSavedItem, fromSavedRow, loadCloudSavedItems, pendingSavedUploads, planSavedMerge, pushSavedItem } from "../lib/saved-items-cloud";
import type { LiveAnalysisSnapshot, SavedItem } from "../lib/types";
import { createStore, fakeSupabase, rowCount } from "./helpers/fake-supabase";

/*
 * Workspace Insights & Plans ↔ saved_items, 그리고 원격 스키마(0004 미적용: trend_analyses.youtube 없음)에서의 분석 저장.
 * 메모리 Supabase로 검증한다(RLS·제약·JSON 필터 재현). 실제 DB 검증은 tests/cloud-sync.live.spec.ts(로그인 정보 필요).
 */
const A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "a@example.com" };
const B = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "b@example.com" };
const plan = (overrides: Partial<SavedItem> = {}): SavedItem => ({
  id: "plan-1730000000000", type: "plan", mode: "live", title: "러닝 크루 기록 카드뉴스", subtitle: "Instagram · Card News · 러닝",
  createdAt: "2026-10-30T01:00:00.000Z", updatedAt: "2026-10-30T01:00:00.000Z",
  payload: { kind: "content-plan", plan: { title: "러닝 크루 기록 카드뉴스" } as never, references: [], brief: { platform: "Instagram", format: "Card News", target: "", tone: "" }, trendNames: ["러닝"], trendKeys: ["live-러닝"], model: "m", analyzedAt: "2026-10-30T00:59:00.000Z" },
  ...overrides,
});
const insight: SavedItem = { id: "insight-live-러닝-1", type: "insight", mode: "live", title: "러닝 — TREND WHY (LIVE)", subtitle: "LIVE 분석", createdAt: "2026-10-30T02:00:00.000Z", updatedAt: "2026-10-30T02:00:00.000Z", payload: { kind: "live-insight", trendId: "live-러닝", trendName: "러닝", keywords: ["러닝"], analyzedAt: "2026-10-28T08:32:53.000Z", summary: "요약", highlights: ["대회 전 훈련"], evidenceCount: 12 } };

test.describe("saved items cloud sync (in-memory Supabase)", () => {
  test("saving creates one row; saving the same item again updates it instead of adding rows", async () => {
    const store = createStore();
    const client = fakeSupabase(store, A);
    const first = await pushSavedItem(client, A.id, plan());
    expect(first).toMatchObject({ ok: true, action: "created" });
    const again = await pushSavedItem(client, A.id, plan({ title: "수정한 제목", updatedAt: "2026-10-30T03:00:00.000Z" }));
    expect(again).toMatchObject({ ok: true, action: "updated" });
    expect(rowCount(store, "saved_items")).toBe(1);
    expect(store.tables.saved_items[0].title).toBe("수정한 제목");
    expect((store.tables.saved_items[0].payload as { clientId: string }).clientId).toBe("plan-1730000000000");
  });

  test("an older copy never overwrites a newer cloud version", async () => {
    const store = createStore();
    const client = fakeSupabase(store, A);
    await pushSavedItem(client, A.id, plan({ title: "최신", updatedAt: "2026-10-30T05:00:00.000Z" }));
    const stale = await pushSavedItem(client, A.id, plan({ title: "예전", updatedAt: "2026-10-30T04:00:00.000Z" }));
    expect(stale).toMatchObject({ ok: true, action: "kept-cloud-newer" });
    expect(store.tables.saved_items[0].title).toBe("최신");
  });

  test("another browser restores plans and insights with their content", async () => {
    const store = createStore();
    const client = fakeSupabase(store, A);
    await pushSavedItem(client, A.id, plan());
    await pushSavedItem(client, A.id, insight);
    const loaded = await loadCloudSavedItems(fakeSupabase(store, A), A.id);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const merge = planSavedMerge([], loaded.items, []);
    expect(merge.add.map((item) => item.id).sort()).toEqual([insight.id, plan().id].sort());
    const restored = merge.add.find((item) => item.type === "plan")!;
    expect(restored.payload?.kind).toBe("content-plan");
    expect(restored.payload && "trendKeys" in restored.payload ? restored.payload.trendKeys : []).toEqual(["live-러닝"]);
    expect(merge.add.find((item) => item.type === "insight")?.payload).toMatchObject({ kind: "live-insight", trendId: "live-러닝" });
  });

  test("merging keeps local items that are not in the cloud and prefers the newer copy", async () => {
    const localOnly = plan({ id: "plan-local-only" });
    const cloudNewer = { rowId: "r1", item: plan({ title: "클라우드 최신", updatedAt: "2026-10-30T09:00:00.000Z" }), updatedAt: "2026-10-30T09:00:00.000Z", legacy: false };
    const merge = planSavedMerge([localOnly, plan()], [cloudNewer], []);
    expect(merge.replace.map((item) => item.title)).toEqual(["클라우드 최신"]);
    expect(merge.remove).toEqual([]);
    expect(pendingSavedUploads([localOnly, plan()], [cloudNewer], []).map((item) => item.id)).toEqual(["plan-local-only"]);
  });

  test("rows saved by the previous app version are still readable", () => {
    const legacy = fromSavedRow({ id: "r", item_type: "plan", title: "t", subtitle: "s", created_at: "2026-10-29T00:00:00+00:00", payload: { ...plan().payload, clientId: "plan-old", mode: "live" } as Record<string, unknown> });
    expect(legacy).toMatchObject({ legacy: true, item: { id: "plan-old", type: "plan", payload: { kind: "content-plan" } } });
  });

  test("deleting everywhere leaves a tombstone so other browsers drop their copy and do not re-upload it", async () => {
    const store = createStore();
    const client = fakeSupabase(store, A);
    await pushSavedItem(client, A.id, plan());
    // deleteSavedItem은 로컬 정리에 브라우저 저장소를 쓰므로, 여기서는 클라우드 툼스톤 단계만 같은 방식으로 재현한다.
    await client.from("saved_items").update({ title: "(삭제됨)", subtitle: "", payload: { v: 2, clientId: plan().id, createdAt: plan().createdAt, updatedAt: "2026-10-30T06:00:00.000Z", deletedAt: "2026-10-30T06:00:00.000Z", data: null } }).eq("user_id", A.id).eq("payload->>clientId", plan().id).select("id");
    expect(rowCount(store, "saved_items")).toBe(1);
    expect((store.tables.saved_items[0].payload as { data: unknown }).data).toBeNull();
    const loaded = await loadCloudSavedItems(client, A.id);
    if (!loaded.ok) throw new Error("load failed");
    // 다른 브라우저에 남아 있던 이전 사본은 정리 대상이 되고, 다시 올리려 해도 거부된다.
    expect(planSavedMerge([plan()], loaded.items, []).remove).toEqual([plan().id]);
    expect(await pushSavedItem(client, A.id, plan())).toMatchObject({ ok: false, action: "deleted-in-cloud" });
    // 삭제 이후에 새로 수정한 항목이면 다시 저장할 수 있다.
    expect(await pushSavedItem(client, A.id, plan({ updatedAt: "2026-10-30T07:00:00.000Z" }))).toMatchObject({ ok: true, action: "updated" });
  });

  test("items hidden only in this browser are not pulled back unless they change in the cloud", () => {
    const cloud = [{ rowId: "r", item: plan(), updatedAt: plan().updatedAt!, legacy: false }];
    const tomb = [{ id: plan().id, scope: "local" as const, deletedAt: "2026-10-30T02:00:00.000Z" }];
    expect(planSavedMerge([], cloud, tomb)).toMatchObject({ add: [], hidden: 1 });
    const changed = [{ ...cloud[0], updatedAt: "2026-10-30T03:00:00.000Z", item: plan({ updatedAt: "2026-10-30T03:00:00.000Z" }) }];
    expect(planSavedMerge([], changed, tomb).add).toHaveLength(1);
  });

  test("a failed cloud delete leaves the local item untouched", async () => {
    const store = createStore();
    await pushSavedItem(fakeSupabase(store, A), A.id, plan());
    const result = await deleteSavedItem(plan(), "all", fakeSupabase(store, A, { failUpdate: true }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("그대로");
    expect(store.tables.saved_items[0].title).toBe(plan().title);
  });

  test("another account cannot see or change these items", async () => {
    const store = createStore();
    await pushSavedItem(fakeSupabase(store, A), A.id, plan());
    const other = await loadCloudSavedItems(fakeSupabase(store, B), B.id);
    expect(other.ok && other.items.length).toBe(0);
    // B가 같은 clientId로 저장해도 A의 행은 바뀌지 않고 B 소유 행이 따로 생긴다.
    await pushSavedItem(fakeSupabase(store, B), B.id, plan({ title: "B의 항목" }));
    expect(rowCount(store, "saved_items", A.id)).toBe(1);
    expect(store.tables.saved_items.find((row) => row.user_id === A.id)?.title).toBe(plan().title);
    // A의 user_id로 위조해 넣으면 RLS로 거부된다.
    const { error } = await fakeSupabase(store, B).from("saved_items").insert({ user_id: A.id, item_type: "plan", title: "x", subtitle: "", payload: {} }).select("id");
    expect(error?.message).toMatch(/row-level security/);
  });
});

test.describe("analyses on the real remote schema (no youtube column)", () => {
  const all = [...base.snapshots, ...extra.snapshots] as unknown as LiveAnalysisSnapshot[];
  const remote = { missingColumns: { trend_analyses: ["youtube"] } };

  test("YouTube analyses still save (without the missing column) and load back", async () => {
    const store = createStore();
    const client = fakeSupabase(store, A, remote);
    const youtube = all.find((item) => item.youtube)!;
    const saved = await upsertCloudAnalysis(client, A.id, youtube);
    expect(saved).toMatchObject({ ok: true, created: true });
    expect(store.tables.trend_analyses[0].youtube).toBeUndefined();
    const loaded = await loadCloudAnalyses(client, 200);
    expect(loaded.error).toBeUndefined();
    expect(loaded.analyses[0].trendId).toBe(youtube.trendId);
    expect(loaded.analyses[0].dna).toBeTruthy();
  });

  test("uploading does not erase cloud DNA that is newer than the local copy", async () => {
    const store = createStore();
    const client = fakeSupabase(store, A, remote);
    const run = all[0];
    await upsertCloudAnalysis(client, A.id, { ...run, dnaGeneratedAt: "2030-01-01T00:00:00.000Z" });
    await upsertCloudAnalysis(client, A.id, { ...run, dna: undefined, evidence: [] });
    expect(rowCount(store, "trend_analyses")).toBe(1);
    expect(store.tables.trend_analyses[0].dna).toBeTruthy();
    expect((store.tables.trend_analyses[0].evidence as unknown[]).length).toBe(run.evidence!.length);
  });

  test("pending uploads count analyses missing from the account and newer local DNA", () => {
    const rows = [{ trend_id: all[0].trendId, analyzed_at: all[0].analyzedAt.replace("Z", "+00:00"), dna_generated_at: all[0].dnaGeneratedAt! }];
    const pending = pendingAnalysisUploads(all.slice(0, 3), rows).map((item) => item.trendId);
    expect(pending).not.toContain(all[0].trendId);
    expect(pending).toEqual(all.slice(1, 3).filter((item) => item.whyReport).map((item) => item.trendId));
    const newerDna = pendingAnalysisUploads([{ ...all[0], dnaGeneratedAt: "2030-01-01T00:00:00.000Z" }], rows);
    expect(newerDna).toHaveLength(1);
  });
});
