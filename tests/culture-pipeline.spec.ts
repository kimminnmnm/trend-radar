import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import fixture from "./fixtures/live-pipeline.json";
import { buildCultureGraph } from "../lib/culture-graph";
import { currentRelationRecords, currentVersion, syncCultureLedger, versionsOf, type CultureLedger } from "../lib/culture-pipeline";
import { syncCultureCloud } from "../lib/culture-pipeline-client";
import type { LiveAnalysisSnapshot } from "../lib/types";

/*
 * PHASE 5 LIVE 데이터 파이프라인 검증.
 * 2026-10-28 실측 러닝·마라톤 분석 픽스처를 쓰고, 외부 API는 호출하지 않는다.
 * DNA 재분석 시각을 바꾼 복제본과 Supabase 가짜 클라이언트는 버전 관리·클라우드 경로 확인용 테스트 데이터다.
 */
const [run, marathon] = fixture.snapshots as unknown as LiveAnalysisSnapshot[];
const EMPTY: CultureLedger = { versions: [], relations: [] };
const T0 = "2026-10-29T01:00:00.000Z", T1 = "2026-10-29T02:00:00.000Z";
const reanalyzed = (snapshot: LiveAnalysisSnapshot, at: string): LiveAnalysisSnapshot => ({ ...snapshot, dnaGeneratedAt: at, cultureMetadata: undefined });

test.describe("culture ledger (no browser)", () => {
  test("records one version per trend and computes each pair once", () => {
    const first = syncCultureLedger(EMPTY, [run, marathon], T0);
    expect(first.newVersions.map((item) => [item.trendName, item.version])).toEqual([["러닝", 1], ["마라톤", 1]]);
    expect(first.newRelations).toHaveLength(1);
    expect(first.newRelations[0].result.exists).toBe(true);
    expect(first.ledger.versions.every((item) => item.metadata.schemaVersion === "culture-metadata-v1" && item.hasEmbedding)).toBe(true);
    const second = syncCultureLedger(first.ledger, [run, marathon], T1);
    expect(second.changed).toBe(false);
    expect(second.newRelations).toHaveLength(0);
  });

  test("DNA re-analysis adds v2, keeps v1, and recomputes only the affected pair", () => {
    const first = syncCultureLedger(EMPTY, [run, marathon], T0).ledger;
    const again = syncCultureLedger(first, [run, reanalyzed(marathon, "2026-10-29T03:00:00.000Z")], T1);
    expect(again.newVersions.map((item) => [item.trendName, item.version])).toEqual([["마라톤", 2]]);
    expect(versionsOf(again.ledger, marathon.trendId).map((item) => item.version)).toEqual([2, 1]);
    expect(again.newRelations).toHaveLength(1);
    expect(again.ledger.relations).toHaveLength(2);
    const current = [...currentRelationRecords(again.ledger, [run, reanalyzed(marathon, "2026-10-29T03:00:00.000Z")]).values()];
    expect(current).toHaveLength(1);
    expect([current[0].sourceVersion, current[0].targetVersion].sort()).toEqual([1, 2]);
  });

  test("WHY re-analysis that drops DNA keeps the old version and draws no relation from it", () => {
    const first = syncCultureLedger(EMPTY, [run, marathon], T0).ledger;
    const whyOnly = { ...marathon, dna: undefined, dnaGeneratedAt: undefined, cultureMetadata: undefined };
    const after = syncCultureLedger(first, [run, whyOnly], T1);
    expect(after.newVersions).toHaveLength(0);
    expect(versionsOf(after.ledger, marathon.trendId)).toHaveLength(1);
    expect(currentVersion(after.ledger, whyOnly)).toBeNull();
    expect(currentRelationRecords(after.ledger, [run, whyOnly]).size).toBe(0);
  });

  test("a new trend only computes its own pairs", () => {
    const first = syncCultureLedger(EMPTY, [run, marathon], T0).ledger;
    const third: LiveAnalysisSnapshot = { ...run, id: "t3", trendId: "live-테스트러닝", trendName: "테스트 러닝", cultureMetadata: undefined };
    const after = syncCultureLedger(first, [run, marathon, third], T1);
    expect(after.newVersions).toHaveLength(1);
    expect(after.newRelations.map((item) => item.key).every((key) => key.includes("live-테스트러닝"))).toBe(true);
    expect(after.newRelations).toHaveLength(2);
  });

  test("the map reuses stored results and gets the same score as a fresh computation", () => {
    const ledger = syncCultureLedger(EMPTY, [run, marathon], T0).ledger;
    const stored = buildCultureGraph([run, marathon], [], currentRelationRecords(ledger, [run, marathon])).relations[0];
    const fresh = buildCultureGraph([run, marathon], []).relations[0];
    expect(stored.stored).toMatchObject({ computedAt: T0, sourceVersion: 1, targetVersion: 1 });
    expect(stored.score).toBe(fresh.score);
    expect(stored.edges.map((edge) => edge.id)).toEqual(fresh.edges.map((edge) => edge.id));
  });
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fakeSupabase(options: { user?: boolean; rpcError?: string } = {}) {
  const calls = { rpc: [] as Array<{ name: string; args: Record<string, unknown> }>, upsert: [] as Array<{ table: string; row: Record<string, unknown> }> };
  let next = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: uuid(999) } }, error: null }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.rpc.push({ name, args });
      if (options.rpcError) return { data: null, error: { message: options.rpcError } };
      next += 1;
      return { data: [{ saved_trend_id: uuid(next), saved_analysis_version_id: uuid(100 + next), saved_version_number: 1 }], error: null };
    },
    from: (table: string) => ({ upsert: async (row: Record<string, unknown>) => { calls.upsert.push({ table, row }); return { error: null }; } }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

test.describe("culture ledger → Supabase (fake client)", () => {
  test("saves current versions and each relation signal once, in canonical order", async () => {
    const ledger = syncCultureLedger(EMPTY, [run, marathon], T0).ledger;
    const { client, calls } = fakeSupabase();
    const synced = await syncCultureCloud(ledger, [run, marathon], client);
    expect(synced.status).toMatchObject({ status: "saved", versions: 2, relations: 1 });
    expect(calls.rpc.map((item) => item.name)).toEqual(["save_culture_knowledge", "save_culture_knowledge"]);
    expect((calls.rpc[0].args.p_analysis as { metadata: { trendId: string } }).metadata.trendId).toBe(run.trendId);
    const relationTypes = ledger.relations[0].result.signals.map((signal) => signal.type);
    expect(calls.upsert.map((item) => item.row.relation_type)).toEqual(relationTypes);
    for (const { table, row } of calls.upsert) {
      expect(table).toBe("culture_relations");
      expect(String(row.source_trend_id) < String(row.target_trend_id)).toBe(true);
      expect(Array.isArray(row.evidence_ids)).toBe(true);
    }
    expect(synced.ledger.versions.every((item) => item.cloud?.versionUuid)).toBe(true);
    // 다시 실행해도 이미 저장한 항목은 보내지 않는다.
    const again = await syncCultureCloud(synced.ledger, [run, marathon], client);
    expect(again.status.status).toBe("skipped");
    expect(calls.rpc).toHaveLength(2);
  });

  test("without login nothing is sent and the browser ledger is kept", async () => {
    const ledger = syncCultureLedger(EMPTY, [run, marathon], T0).ledger;
    const { client, calls } = fakeSupabase({ user: false });
    const synced = await syncCultureCloud(ledger, [run, marathon], client);
    expect(synced.status.status).toBe("skipped");
    expect(synced.status.message).toContain("브라우저에만 저장");
    expect(calls.rpc).toHaveLength(0);
    expect(synced.ledger).toEqual(ledger);
  });

  test("a missing migration is reported, not hidden", async () => {
    const ledger = syncCultureLedger(EMPTY, [run, marathon], T0).ledger;
    const { client } = fakeSupabase({ rpcError: "Could not find the function public.save_culture_knowledge in the schema cache" });
    const synced = await syncCultureCloud(ledger, [run, marathon], client);
    expect(synced.status.status).toBe("unavailable");
    expect(synced.status.message).toContain("202610290005");
  });
});

/* ---------- E2E: 새 트렌드 DNA 분석 → 수동 입력 없이 지도에 노드·관계 추가 ---------- */
const MARATHON_DNA = "/trends/live-%EB%A7%88%EB%9D%BC%ED%86%A4/dna";
const dnaResponse = (generatedAt: string) => ({ cached: false, dna: fixture.snapshots[1].dna, model: fixture.snapshots[1].dnaModel, generatedAt, promptVersion: fixture.snapshots[1].dnaPromptVersion, validation: fixture.snapshots[1].dnaValidation, embedding: fixture.snapshots[1].embedding });

async function seedWithoutMarathonDna(page: Page) {
  await page.goto("/");
  const whyOnly = { ...fixture.snapshots[1], dna: undefined, dnaGeneratedAt: undefined, dnaModel: undefined, dnaPromptVersion: undefined, dnaValidation: undefined, embedding: undefined };
  await page.evaluate((items) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-live-analyses", JSON.stringify(items)); }, [fixture.snapshots[0], whyOnly]);
}

async function mockDna(page: Page, generatedAt: string[]) {
  const calls: string[] = [];
  await page.route("**/api/dna", async (route) => { calls.push(route.request().url()); await route.fulfill({ json: dnaResponse(generatedAt[Math.min(calls.length - 1, generatedAt.length - 1)]) }); });
  page.on("request", (request) => { if (/\/api\/(analyze|collision|lab|studio|embeddings?)$/.test(new URL(request.url()).pathname)) calls.push(`UNEXPECTED ${request.url()}`); });
  return calls;
}

test.describe("live pipeline into the culture map", () => {
  test("analyzing a new trend's DNA adds its node and relation to the map automatically", async ({ page }) => {
    await seedWithoutMarathonDna(page);
    const calls = await mockDna(page, ["2026-10-29T05:00:00.000Z"]);
    await page.goto("/culture-map");
    await expect(page.getByTestId("map-counts")).toHaveText("노드 2/2 · 관계 0/0");
    await page.goto(MARATHON_DNA);
    await page.getByRole("button", { name: /Run LIVE DNA analysis/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Culture Map 반영" })).toContainText("Culture Map 반영: 새 버전 1개 · 관계 계산 1쌍(연결 1)");
    await expect(page.getByRole("status").filter({ hasText: "Culture Map 반영" })).toContainText("브라우저에만 저장");
    await page.goto("/culture-map");
    await expect(page.getByTestId("map-counts")).toHaveText("노드 2/2 · 관계 1/1");
    await page.locator(".react-flow__edge-textwrapper").first().click({ force: true });
    await expect(page.getByTestId("map-detail").getByTestId("data-badge").first()).toContainText("관계 원장 · 러닝 v1 ↔ 마라톤 v1");
    const ledger = await page.evaluate(() => ({ versions: JSON.parse(localStorage.getItem("trend-radar-culture-versions") ?? "[]").length, relations: JSON.parse(localStorage.getItem("trend-radar-culture-relations") ?? "[]").length }));
    expect(ledger).toEqual({ versions: 2, relations: 1 });
    expect(calls).toHaveLength(1);
  });

  test("re-analysis keeps the previous version and marks the latest", async ({ page }) => {
    await seedWithoutMarathonDna(page);
    const calls = await mockDna(page, ["2026-10-29T05:00:00.000Z", "2026-10-29T06:00:00.000Z"]);
    await page.goto(MARATHON_DNA);
    await page.getByRole("button", { name: /Run LIVE DNA analysis/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Culture Map 반영" })).toContainText("새 버전 1개");
    await page.getByRole("button", { name: /Re-analyze DNA/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Culture Map 반영" })).toContainText("새 버전 1개 · 관계 계산 1쌍");
    await page.goto("/culture-map");
    await page.locator(".react-flow__node").filter({ hasText: "마라톤" }).click();
    const detail = page.getByTestId("map-detail");
    await expect(detail.getByTestId("node-version")).toContainText("v2 · 최신");
    await expect(detail.getByTestId("node-versions")).toContainText("v1");
    expect(calls).toHaveLength(2);
  });

  test("Collision shows the map relation for the pair it received", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((items) => { localStorage.clear(); localStorage.setItem("trend-radar-live-analyses", JSON.stringify(items)); }, fixture.snapshots);
    await page.goto(`/collision?trend=${encodeURIComponent(run.trendId)}&trend=${encodeURIComponent(marathon.trendId)}`);
    await expect(page.getByTestId("collision-map-relation")).toContainText("공통 속성 · 관계 점수 27");
    await expect(page.getByTestId("collision-map-relation")).toContainText("근거 6건");
  });
});
