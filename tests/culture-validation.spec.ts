import { expect, test, type Page } from "@playwright/test";
import base from "./fixtures/live-pipeline.json";
import extra from "./fixtures/culture-validation.json";
import { buildCultureGraph } from "../lib/culture-graph";
import { analyzeCulturalRelationship } from "../lib/cultural-relationship-engine";
import { resolveRelationEvidence } from "../lib/culture-map-view";
import { snapshotMetadata } from "../lib/culture-pipeline";
import { CULTURE_ALIAS_RULES } from "../lib/culture-alias-rules";
import { standardizeCultureMetadata } from "../lib/culture-metadata";
import type { LiveAnalysisSnapshot } from "../lib/types";

/*
 * PHASE 6 관계 검증. 8개 트렌드 모두 실제 분석 결과다.
 *  - 러닝·마라톤: 2026-10-28 실측(NAVER·Instagram·OpenAI)
 *  - 보컬로이드·헤이세이 레트로·캐릭터 커스터마이징·발레코어·디지털카메라·레트로 게임:
 *    2026-10-29 실측(NAVER·YouTube·웹 출처·OpenAI, Instagram 미사용)
 * 아래 기대값은 동의어 규칙과 보정 기준을 적용하기 전에 정했다. 외부 API는 호출하지 않는다.
 */
const all = [...base.snapshots, ...extra.snapshots] as unknown as LiveAnalysisSnapshot[];
const id = (name: string) => all.find((item) => item.trendName === name)!.trendId;
const pair = (a: string, b: string) => [id(a), id(b)].sort().join("|");
const EXPECTED_RELATED = [["러닝", "마라톤"], ["헤이세이 레트로", "디지털카메라"], ["헤이세이 레트로", "레트로 게임"], ["디지털카메라", "레트로 게임"], ["보컬로이드", "캐릭터 커스터마이징"]] as const;
const EXPECTED_UNRELATED = [["러닝", "보컬로이드"], ["마라톤", "레트로 게임"], ["마라톤", "보컬로이드"], ["러닝", "헤이세이 레트로"], ["발레코어", "레트로 게임"], ["보컬로이드", "디지털카메라"]] as const;

test.describe("relationship validation on 8 real trends (no browser)", () => {
  const graph = buildCultureGraph(all, []);
  const byPair = new Map(graph.relations.map((relation) => [[relation.source, relation.target].sort().join("|"), relation]));

  test("before calibration: the fixed 0.45 cosine rule connected 27 of 28 pairs", () => {
    // 보정 전 상태 기록: 동의어 규칙 없이, 엔진의 고정 기준만 쓴 결과.
    const raw = (s: LiveAnalysisSnapshot) => ({ trendId: s.trendId, trendName: s.trendName, keywords: s.keywords, evidence: s.evidence!, embedding: s.embedding, metadata: standardizeCultureMetadata({ trendId: s.trendId, trendName: s.trendName, sourceAnalyzedAt: s.dnaGeneratedAt!, updatedAt: s.dnaGeneratedAt!, dna: s.dna!, evidence: s.evidence! }) });
    let connected = 0, shared = 0;
    for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) {
      const result = analyzeCulturalRelationship(raw(all[i]), raw(all[j]));
      if (result.exists) connected += 1;
      if (result.sharedAttributes.length) shared += 1;
    }
    expect(connected).toBe(27);
    expect(shared).toBe(0);
  });

  test("calibrated semantic threshold comes from the corpus distribution", () => {
    expect(graph.semantic).toMatchObject({ calibrated: true, pairs: 28 });
    expect(graph.semantic.threshold).toBeGreaterThanOrEqual(0.65);
    expect(graph.semantic.threshold).toBeCloseTo(graph.semantic.mean! + graph.semantic.std!, 2);
  });

  test("similar cultures are connected", () => {
    for (const [a, b] of EXPECTED_RELATED) expect(byPair.has(pair(a, b)), `${a} ↔ ${b}`).toBe(true);
  });

  test("weakly related cultures are not forced together", () => {
    for (const [a, b] of EXPECTED_UNRELATED) expect(byPair.has(pair(a, b)), `${a} ↔ ${b}`).toBe(false);
    expect(graph.relations.length).toBeLessThanOrEqual(14);
  });

  test("every connection has an explainable reason and evidence IDs that exist", () => {
    for (const relation of graph.relations) {
      expect(relation.edges.length).toBeGreaterThan(0);
      for (const edge of relation.edges) expect(edge.basis.length).toBeGreaterThan(20);
      expect(resolveRelationEvidence(relation, all).every((item) => item.item !== null), relation.id).toBe(true);
    }
  });

  test("relation types are appropriate", () => {
    for (const relation of graph.relations) for (const edge of relation.edges) {
      if (edge.relationType !== "observed_connection") expect(edge.verificationStatus).not.toBe("Verified Signal");
      if (edge.relationType === "semantic_similarity") expect(edge.score!).toBeGreaterThanOrEqual(graph.semantic.threshold);
    }
    // 보정 전에는 러닝↔마라톤이 "관찰된 연결(Verified Signal)"이었지만 오탐이었다(다음 테스트). 수정 후 이 코퍼스에는 관찰된 연결이 없다.
    expect(graph.relations.filter((relation) => relation.edges.some((edge) => edge.relationType === "observed_connection"))).toEqual([]);
  });

  test("a trend's own collection keyword is not counted as mentioning the other trend", () => {
    // 러닝 분석의 비교 키워드에 '마라톤'이 있어, 마라톤 자료의 '#마라톤'이 러닝을 언급한 것으로 잡히던 오탐을 막는다.
    const run = all.find((item) => item.trendName === "러닝")!, marathon = all.find((item) => item.trendName === "마라톤")!;
    expect(run.keywords).toContain("마라톤");
    const input = (s: LiveAnalysisSnapshot) => ({ trendId: s.trendId, trendName: s.trendName, keywords: s.keywords, metadata: snapshotMetadata(s)!, evidence: s.evidence!, embedding: s.embedding });
    const result = analyzeCulturalRelationship(input(run), input(marathon));
    expect(result.signals.some((signal) => signal.type === "observed_connection")).toBe(false);
    // 상대 이름이 실제로 등장하면 여전히 관찰된 연결로 잡는다.
    const mention = { ...marathon.evidence!.find((item) => item.kind === "instagram_media")!, id: "IG-99", excerpt: "오늘 러닝 크루와 마라톤 연습" };
    const withMention = analyzeCulturalRelationship(input(run), { ...input(marathon), evidence: [...marathon.evidence!, mention] });
    expect(withMention.signals.find((signal) => signal.type === "observed_connection")?.evidenceIds).toEqual([`${marathon.trendId}:IG-99`]);
  });

  test("shared attributes come only from reviewed rules, are grounded on both sides, and are not duplicated", () => {
    const reviewed = new Set(CULTURE_ALIAS_RULES.map((rule) => rule.canonicalLabel));
    for (const relation of graph.relations) {
      const ids = relation.sharedAttributes.map((item) => item.attributeId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const shared of relation.sharedAttributes) {
        expect(reviewed.has(shared.canonicalLabel), shared.canonicalLabel).toBe(true);
        for (const trendId of [relation.source, relation.target]) {
          const attributes = snapshotMetadata(all.find((item) => item.trendId === trendId)!)!.dimensions.flatMap((dimension) => dimension.attributes).filter((item) => item.attributeId === shared.attributeId);
          expect(attributes.some((item) => item.evidenceIds.length > 0)).toBe(true);
        }
      }
    }
  });
});

async function seed(page: Page) {
  await page.goto("/");
  await page.evaluate((items) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-live-analyses", JSON.stringify(items)); }, all);
}

test.describe("validation data on the map", () => {
  test("8 real trends render with calibrated edges, and a wrong relation can be hidden and rated", async ({ page, isMobile }) => {
    await seed(page);
    await page.goto("/culture-map");
    await expect(page.locator(".react-flow__node")).toHaveCount(8);
    const total = buildCultureGraph(all, []).relations.length;
    await expect(page.getByTestId("map-counts")).toHaveText(`노드 8/8 · 관계 ${total}/${total}`);
    await expect(page.getByTestId("map-legend")).toContainText("보정");
    await page.locator(".react-flow__node").filter({ hasText: "발레코어" }).click();
    await page.getByTestId("node-connections").getByRole("button", { name: /러닝/ }).click();
    const detail = page.getByTestId("map-detail");
    await expect(detail.getByTestId("relation-title")).toHaveText(/러닝 ↔ 발레코어|발레코어 ↔ 러닝/);
    await expect(detail.getByTestId("relation-type")).toContainText("의미 유사");
    await detail.getByRole("radio", { name: "관계의 설득력 2점" }).click();
    await expect(detail.getByRole("radio", { name: "관계의 설득력 2점" })).toHaveAttribute("aria-checked", "true");
    await detail.getByTestId("hide-relation").click();
    await expect(page.getByTestId("map-counts")).toHaveText(`노드 8/8 · 관계 ${total - 1}/${total - 1}`);
    if (isMobile) await page.keyboard.press("Escape");
    await expect(page.getByTestId("hidden-relations")).toContainText("숨긴 관계 1개");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-culture-relation-feedback") ?? "[]"));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ hidden: true, ratings: { persuasiveness: 2 } });
    // 숨긴 관계는 다시 볼 수 있다(데이터는 지우지 않았다).
    await page.getByTestId("hidden-relations").click();
    await expect(page.getByTestId("map-counts")).toHaveText(`노드 8/8 · 관계 ${total}/${total}`);
    const download = page.waitForEvent("download");
    await page.getByTestId("export-feedback").click();
    expect((await download).suggestedFilename()).toBe("culture-relation-feedback.json");
  });

  test("a shared-attribute pair is handed to Collision with its relation summary", async ({ page }) => {
    await seed(page);
    await page.goto(`/collision?trend=${encodeURIComponent(id("헤이세이 레트로"))}&trend=${encodeURIComponent(id("디지털카메라"))}`);
    const summary = page.getByTestId("collision-map-relation");
    await expect(summary).toContainText("공통 속성");
    await expect(summary).toContainText("과거에 대한 향수");
  });
});
