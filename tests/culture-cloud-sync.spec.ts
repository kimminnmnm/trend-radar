import { expect, test } from "@playwright/test";
import base from "./fixtures/live-pipeline.json";
import extra from "./fixtures/culture-validation.json";
import { loadCloudAnalyses, upsertCloudAnalysis } from "../lib/cloud-storage";
import { importCloudLedger, mergeCloudSnapshots, type CloudRelationRow, type CloudTrendRow, type CloudVersionRow } from "../lib/culture-cloud-sync";
import { buildCultureGraph } from "../lib/culture-graph";
import { currentRelationRecords, syncCultureLedger, versionsOf, type CultureLedger } from "../lib/culture-pipeline";
import { syncCultureCloud } from "../lib/culture-pipeline-client";
import type { LiveAnalysisSnapshot } from "../lib/types";
import { createStore, fakeSupabase, rowCount, type FakeStore } from "./helpers/fake-supabase";

/*
 * Culture Map 클라우드 저장·불러오기 검증(메모리 Supabase, 외부 호출 없음).
 * 실측 8개 트렌드(러닝·마라톤 + PHASE 6 6개)를 쓴다. 실제 Supabase 검증은 tests/cloud-sync.live.spec.ts(로그인 정보 필요).
 */
const all = [...base.snapshots, ...extra.snapshots] as unknown as LiveAnalysisSnapshot[];
const EMPTY: CultureLedger = { versions: [], relations: [] };
const USER = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "a@example.com" };
const OTHER = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "b@example.com" };

async function pushFromBrowserA(store: FakeStore) {
  const client = fakeSupabase(store, USER);
  const ids = new Map<string, string>();
  for (const snapshot of all) {
    const result = await upsertCloudAnalysis(client, USER.id, snapshot);
    expect(result.ok, snapshot.trendName).toBe(true);
    if (result.ok) ids.set(snapshot.trendId, result.id);
  }
  const ledger = syncCultureLedger(EMPTY, all, "2026-10-29T08:00:00.000Z").ledger;
  const synced = await syncCultureCloud(ledger, all, client, ids);
  return { client, ledger: synced.ledger, status: synced.status };
}

async function pullIntoBrowserB(store: FakeStore, local: LiveAnalysisSnapshot[] = []) {
  const client = fakeSupabase(store, USER);
  const cloud = await loadCloudAnalyses(client, 200);
  expect(cloud.error).toBeUndefined();
  const merged = mergeCloudSnapshots(local, cloud.analyses);
  const snapshots = [...local.filter((item) => !merged.replaced.some((r) => r.trendId === item.trendId)), ...merged.added, ...merged.replaced];
  const read = async (table: string, columns: string): Promise<unknown> => (await client.from(table).select(columns).eq("user_id", USER.id)).data;
  const imported = importCloudLedger(EMPTY, await read("culture_trends", "id,trend_key,display_name") as CloudTrendRow[], await read("culture_analysis_versions", "id,trend_id,version_number,analyzed_at,metadata,model,prompt_version,embedding_model") as CloudVersionRow[], await read("culture_relations", "source_analysis_version_id,target_analysis_version_id,relation_type,metadata") as CloudRelationRow[]);
  return { snapshots, imported, cloud: cloud.analyses };
}

test.describe("culture map cloud save and load (in-memory Supabase)", () => {
  test("a YouTube analysis is saved despite the source check constraint, and YouTube is restored on load", async () => {
    const store = createStore();
    const client = fakeSupabase(store, USER);
    const youtube = all.find((item) => item.source === "NAVER DataLab + YouTube + OpenAI")!;
    expect(youtube).toBeTruthy();
    const result = await upsertCloudAnalysis(client, USER.id, youtube);
    expect(result).toMatchObject({ ok: true, created: true });
    expect(store.tables.trend_analyses[0].source).toBe("NAVER DataLab + OpenAI");
    const loaded = await loadCloudAnalyses(client, 200);
    expect(loaded.analyses[0].source).toBe("NAVER DataLab + YouTube + OpenAI");
    expect(loaded.analyses[0].analyzedAt).toBe(new Date(youtube.analyzedAt).toISOString());
  });

  test("saving the same analysis again updates the row instead of duplicating it", async () => {
    const store = createStore();
    const client = fakeSupabase(store, USER);
    const first = await upsertCloudAnalysis(client, USER.id, all[2]);
    const second = await upsertCloudAnalysis(client, USER.id, all[2]);
    expect(first.ok && second.ok && first.id === second.id).toBe(true);
    expect(second).toMatchObject({ created: false });
    expect(rowCount(store, "trend_analyses")).toBe(1);
  });

  test("an update that changes zero rows is reported as a failure, not success", async () => {
    const store = createStore();
    await upsertCloudAnalysis(fakeSupabase(store, USER), USER.id, all[0]);
    const result = await upsertCloudAnalysis(fakeSupabase(store, USER, { failUpdate: true }), USER.id, all[0]);
    expect(result.ok).toBe(false);
  });

  test("browser A saves analyses, metadata versions, and relations; rows exist in the database", async () => {
    const store = createStore();
    const { status } = await pushFromBrowserA(store);
    const displayed = buildCultureGraph(all, []).relations.filter((relation) => !relation.aiHypothesisOnly);
    expect(status).toMatchObject({ status: "saved", versions: 8, relations: displayed.length });
    expect(rowCount(store, "trend_analyses", USER.id)).toBe(8);
    expect(rowCount(store, "culture_trends", USER.id)).toBe(8);
    expect(rowCount(store, "culture_analysis_versions", USER.id)).toBe(8);
    expect(rowCount(store, "culture_relations", USER.id)).toBe(displayed.reduce((sum, relation) => sum + relation.edges.length, 0));
    expect(rowCount(store, "culture_evidence_items", USER.id)).toBeGreaterThan(0);
    // 분석 버전은 원본 분석 행과 연결된다.
    expect(store.tables.culture_analysis_versions.every((row) => row.source_analysis_id)).toBe(true);
    // 관계 행에는 다른 기기에서 복원할 계산 결과가 들어 있다.
    expect(store.tables.culture_relations.every((row) => (row.metadata as { result?: unknown }).result)).toBe(true);
  });

  test("browser B (empty storage, same account) loads the same map from the database", async () => {
    const store = createStore();
    await pushFromBrowserA(store);
    const { snapshots, imported } = await pullIntoBrowserB(store);
    expect(snapshots).toHaveLength(8);
    expect(imported.versionsAdded).toBe(8);
    const a = buildCultureGraph(all, []);
    const b = buildCultureGraph(snapshots, [], currentRelationRecords(imported.ledger, snapshots));
    // B에는 임베딩이 없지만, 저장된 관계 결과를 재사용하므로 의미 유사 신호까지 A와 같다.
    expect(snapshots.every((item) => !item.embedding)).toBe(true);
    const summary = (graph: typeof a) => graph.relations.map((relation) => `${[relation.source, relation.target].sort().join("|")}:${relation.edges.map((edge) => edge.relationType).sort().join("+")}:${relation.score}`).sort();
    expect(summary(b)).toEqual(summary(a));
    expect(b.relations.every((relation) => relation.stored)).toBe(true);
  });

  test("pushing again from either browser creates no duplicate rows", async () => {
    const store = createStore();
    const first = await pushFromBrowserA(store);
    const before = Object.fromEntries(Object.keys(store.tables).map((table) => [table, rowCount(store, table)]));
    const again = await syncCultureCloud(first.ledger, all, first.client);
    expect(again.status.status).toBe("skipped");
    for (const snapshot of all) await upsertCloudAnalysis(first.client, USER.id, snapshot);
    const { snapshots, imported } = await pullIntoBrowserB(store);
    const fromB = await syncCultureCloud(syncCultureLedger(imported.ledger, snapshots).ledger, snapshots, fakeSupabase(store, USER));
    expect(fromB.status.status).not.toBe("unavailable");
    const after = Object.fromEntries(Object.keys(store.tables).map((table) => [table, rowCount(store, table)]));
    expect(after).toEqual(before);
  });

  test("loading never overwrites newer or richer local data", async () => {
    const store = createStore();
    await pushFromBrowserA(store);
    const cloud = (await loadCloudAnalyses(fakeSupabase(store, USER), 200)).analyses;
    const run = all[0];
    // 로컬이 더 최신이면 유지
    const newerLocal = { ...run, analyzedAt: "2030-01-01T00:00:00.000Z" };
    expect(mergeCloudSnapshots([newerLocal], cloud).replaced.some((item) => item.trendId === run.trendId)).toBe(false);
    // 같은 분석이면 로컬 값(임베딩 포함)을 덮어쓰지 않고 비어 있는 DNA만 채운다
    const same = mergeCloudSnapshots([{ ...run, analyzedAt: new Date(run.analyzedAt).toISOString() }], cloud);
    expect(same.added.some((item) => item.trendId === run.trendId) || same.replaced.some((item) => item.trendId === run.trendId)).toBe(false);
    const missingDna = mergeCloudSnapshots([{ ...run, analyzedAt: new Date(run.analyzedAt).toISOString(), dna: undefined }], cloud);
    expect(missingDna.filled.find((item) => item.trendId === run.trendId)?.patch.dna).toBeTruthy();
    // 클라우드가 더 최신이면 교체하되, 로컬 DNA 버전은 원장에 남는다
    const olderLocal = { ...run, analyzedAt: "2020-01-01T00:00:00.000Z", dnaGeneratedAt: "2020-01-01T00:01:00.000Z", cultureMetadata: undefined };
    const ledger = syncCultureLedger(EMPTY, [olderLocal]).ledger;
    expect(mergeCloudSnapshots([olderLocal], cloud).replaced.some((item) => item.trendId === run.trendId)).toBe(true);
    const after = syncCultureLedger(ledger, [cloud.find((item) => item.trendId === run.trendId)!]).ledger;
    expect(versionsOf(after, run.trendId).map((item) => item.version)).toEqual([2, 1]);
  });

  test("another account sees none of these rows and cannot write into them", async () => {
    const store = createStore();
    const { ledger } = await pushFromBrowserA(store);
    const other = fakeSupabase(store, OTHER);
    expect((await loadCloudAnalyses(other, 200)).analyses).toHaveLength(0);
    const { count } = await other.from("culture_relations").select("id", { count: "exact", head: true }).eq("user_id", OTHER.id);
    expect(count).toBe(0);
    // A의 트렌드 ID로 관계를 만들려 하면 소유권 검사에서 거부된다.
    const victim = store.tables.culture_trends.slice(0, 2).map((row) => String(row.id)).sort();
    const { error } = await other.from("culture_relations").upsert({ user_id: OTHER.id, source_trend_id: victim[0], target_trend_id: victim[1], source_analysis_version_id: "x", target_analysis_version_id: "y", relation_type: "shared_attribute", score: 0.1, reason: "r", evidence_ids: [], verification_status: "Supported Hypothesis", analyzed_at: "2026-10-29T00:00:00Z" });
    expect(error?.message).toMatch(/foreign key/);
    expect(ledger.versions).toHaveLength(8);
  });

  test("relations saved with older alias rules or without results are recomputed locally, not imported", async () => {
    const store = createStore();
    await pushFromBrowserA(store);
    for (const row of store.tables.culture_relations) row.metadata = { ...(row.metadata as object), aliasRulesVersion: "old-rules" };
    const { imported } = await pullIntoBrowserB(store);
    expect(imported.relationsAdded).toBe(0);
    expect(imported.relationsSkipped).toBeGreaterThan(0);
  });
});
