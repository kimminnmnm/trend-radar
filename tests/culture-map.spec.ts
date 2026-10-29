import { expect, test, type Page } from "@playwright/test";
import fixture from "./fixtures/live-pipeline.json";
import { buildCultureGraph } from "../lib/culture-graph";
import { collisionHref, demoNodeInfo, liveNodeInfo, parseCollisionTrendParam, resolveRelationEvidence, searchMapNodes, visibleRelations } from "../lib/culture-map-view";
import { trends } from "../lib/demo-data";
import type { LiveAnalysisSnapshot, SavedCollision } from "../lib/types";

/*
 * PHASE 4 Culture Map 검증.
 * 노드·관계는 2026-10-28 실제 NAVER·Instagram·OpenAI로 기록한 러닝·마라톤 분석(픽스처)에서 계산한다.
 * "테스트 전용 트렌드"는 필터와 미분석 상태를 확인하려고 테스트 안에서만 만드는 WHY-only 항목이며 실제 분석이 아니다.
 * 외부 API는 호출하지 않는다.
 */
const snapshots = fixture.snapshots as unknown as LiveAnalysisSnapshot[];
const collision = fixture.collision as unknown as SavedCollision;
const RUN = "live-러닝", MARATHON = "live-마라톤";
const whyOnly: LiveAnalysisSnapshot = { ...snapshots[1], id: "test-only", trendId: "live-테스트전용", trendName: "테스트 전용 트렌드", keywords: ["테스트 전용"], dna: undefined, dnaGeneratedAt: undefined, embedding: null, evidence: [] };

test.describe("culture map view logic (no browser)", () => {
  test("one relation per pair with explainable signals and evidence IDs that resolve to the saved ledger", () => {
    const graph = buildCultureGraph(snapshots, [collision]);
    expect(graph.errors.size).toBe(0);
    expect(graph.relations).toHaveLength(1);
    const relation = graph.relations[0];
    expect([relation.source, relation.target].sort()).toEqual([RUN, MARATHON].sort());
    // PHASE 6: 검토된 동의어 규칙으로 공통 속성이 생기고, '#마라톤' 자기 키워드 오탐이던 관찰된 연결은 사라졌다.
    expect(relation.primary.type).toBe("Shared Cultural Attribute");
    expect(relation.edges.map((edge) => edge.relationType).sort()).toEqual(["creative_hypothesis", "semantic_similarity", "shared_attribute"]);
    expect(relation.sharedAttributes.map((item) => item.canonicalLabel)).toEqual(["대회 전 훈련", "함께 달리기", "대회 메달"]);
    expect(relation.score).toBeGreaterThan(0);
    expect(relation.score).toBeLessThanOrEqual(1);
    for (const edge of relation.edges) expect(edge.basis.length).toBeGreaterThan(10);
    // 의미 유사·AI 가설은 Verified로 표시하지 않는다.
    expect(relation.edges.filter((edge) => edge.relationType !== "observed_connection").every((edge) => edge.verificationStatus !== "Verified Signal")).toBe(true);
    const evidence = resolveRelationEvidence(relation, snapshots);
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.every((item) => item.item !== null)).toBe(true);
  });

  test("a trend without DNA is a node but never gets a relation", () => {
    const graph = buildCultureGraph([...snapshots, whyOnly], []);
    expect(graph.relations.every((relation) => relation.source !== whyOnly.trendId && relation.target !== whyOnly.trendId)).toBe(true);
    expect(liveNodeInfo(whyOnly, graph.errors)).toMatchObject({ status: "NOT ANALYZED", canCollide: false, category: "미분류" });
  });

  test("weakly related trends are not forced into a connection", () => {
    // 같은 DNA 구조라도 임베딩이 직교하고 교차 언급·공통 근거 속성이 없으면 선을 만들지 않는다.
    const unrelated: LiveAnalysisSnapshot = { ...snapshots[1], id: "u", trendId: "live-무관", trendName: "무관한 주제", keywords: ["무관한 주제"], evidence: snapshots[1].evidence?.filter((item) => item.kind === "naver_series"), embedding: snapshots[0].embedding!.map((value, index) => (index % 2 ? -value : value) * 0), dna: { ...snapshots[1].dna!, dimensions: snapshots[1].dna!.dimensions.map((dimension) => ({ ...dimension, attributes: dimension.attributes.map((attribute, index) => ({ ...attribute, label: `무관-${dimension.dimension}-${index}` })) })) } };
    const graph = buildCultureGraph([snapshots[0], unrelated], []);
    expect(graph.relations).toHaveLength(0);
  });

  test("filters hide relations on screen without changing the data", () => {
    const { relations } = buildCultureGraph(snapshots, [collision]);
    const all = new Set([RUN, MARATHON]);
    const score = relations[0].score!;
    expect(visibleRelations(relations, all, 0)).toHaveLength(1);
    expect(visibleRelations(relations, new Set([RUN]), 0)).toHaveLength(0);
    expect(visibleRelations(relations, all, score)).toHaveLength(1);
    expect(visibleRelations(relations, all, score + 0.01)).toHaveLength(0);
    expect(relations).toHaveLength(1);
    // 점수가 없는 Collision 가설 관계는 기준이 0일 때만 보인다.
    const hypothesisOnly = buildCultureGraph([{ ...snapshots[0], dna: undefined }, snapshots[1]], [collision]).relations;
    expect(hypothesisOnly[0].score).toBeNull();
    expect(visibleRelations(hypothesisOnly, all, 0)).toHaveLength(1);
    expect(visibleRelations(hypothesisOnly, all, 0.05)).toHaveLength(0);
  });

  test("search supports Korean, English, and spacing differences", () => {
    const demo = trends.map(demoNodeInfo);
    expect(searchMapNodes(demo, "헤이세이")[0].name).toBe("헤이세이 레트로");
    expect(searchMapNodes(demo, "heisei")[0].name).toBe("헤이세이 레트로");
    expect(searchMapNodes(demo, "헤이세이레트로")[0].name).toBe("헤이세이 레트로");
    expect(searchMapNodes(demo, "zzzz")).toEqual([]);
    const live = snapshots.map((item) => liveNodeInfo(item, new Set()));
    expect(searchMapNodes(live, "마라")[0].id).toBe(MARATHON);
  });

  test("collision handoff passes trend IDs, not names", () => {
    const href = collisionHref([RUN, MARATHON]);
    expect(href).toBe(`/collision?trend=${encodeURIComponent(RUN)}&trend=${encodeURIComponent(MARATHON)}`);
    const params = new URL(href, "http://x").searchParams.getAll("trend");
    expect(parseCollisionTrendParam(params)).toEqual([RUN, MARATHON]);
    expect(parseCollisionTrendParam([RUN, RUN, " "])).toEqual([RUN]);
  });
});

async function seed(page: Page, options: { extra?: boolean; collision?: boolean } = {}) {
  await page.goto("/");
  await page.evaluate(({ items, collision }) => {
    localStorage.clear();
    localStorage.setItem("trend-radar-onboarded", "1");
    localStorage.setItem("trend-radar-live-analyses", JSON.stringify(items));
    if (collision) localStorage.setItem("trend-radar-collisions", JSON.stringify([collision]));
  }, { items: options.extra ? [...fixture.snapshots, whyOnly] : fixture.snapshots, collision: options.collision ? fixture.collision : null });
}

function forbidPaidCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => { if (/\/api\/(analyze|dna|collision|lab|studio)$/.test(new URL(request.url()).pathname)) calls.push(request.url()); });
  return calls;
}

async function openFilters(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: /^필터( · \d+)?$/ }).click();
}

const node = (page: Page, name: string) => page.locator(".react-flow__node").filter({ hasText: name });

test.describe("interactive culture map", () => {
  test("search highlights a node, centers it, and opens its details", async ({ page }) => {
    await seed(page, { extra: true });
    const calls = forbidPaidCalls(page);
    await page.goto("/culture-map");
    await expect(page.locator(".react-flow__node")).toHaveCount(3);
    const search = page.getByLabel("트렌드 노드 검색");
    await search.fill("마라");
    const results = page.getByTestId("map-search-results");
    // 이름이 일치하는 마라톤이 먼저, 키워드에 '마라톤'을 가진 러닝이 그다음이다.
    await expect(results.getByRole("button")).toHaveCount(2);
    await expect(results.getByRole("button").first()).toContainText("마라톤");
    await expect(node(page, "마라톤")).toHaveClass(/cm-match/);
    await expect(node(page, "테스트 전용 트렌드")).toHaveClass(/cm-dim/);
    await results.getByRole("button", { name: /마라톤/ }).click();
    await expect(page.getByTestId("selected-culture-node")).toHaveText("마라톤");
    await expect(page.getByTestId("map-detail")).toBeVisible();
    // 선택한 노드로 그래프 화면을 옮긴다: 노드 중심이 캔버스의 가운데 영역에 들어와야 한다.
    await expect.poll(async () => {
      const [canvas, target] = await Promise.all([page.locator(".react-flow").boundingBox(), node(page, "마라톤").boundingBox()]);
      if (!canvas || !target) return false;
      const cx = target.x + target.width / 2, cy = target.y + target.height / 2;
      return Math.abs(cx - (canvas.x + canvas.width / 2)) < canvas.width * 0.25 && Math.abs(cy - (canvas.y + canvas.height / 2)) < canvas.height * 0.25;
    }).toBe(true);
    await search.fill("없는검색어");
    await expect(page.getByTestId("map-search-empty")).toContainText("일치하는 트렌드가 없습니다");
    expect(calls).toEqual([]);
  });

  test("category and relationship-score filters update nodes and edges", async ({ page, isMobile }) => {
    await seed(page, { extra: true, collision: true });
    await page.goto("/culture-map");
    const counts = page.getByTestId("map-counts");
    await expect(counts).toHaveText("노드 3/3 · 관계 1/1");
    // 사용자가 직접 분류를 지정한다. AI·데이터가 정한 분류가 아니므로 '사용자 지정'으로 표시한다.
    await node(page, "러닝").click();
    await page.getByLabel("러닝 카테고리").selectOption("Lifestyle");
    await expect(page.getByTestId("map-detail")).toContainText("사용자 지정");
    if (isMobile) await page.getByRole("button", { name: "상세 닫기" }).click();
    await node(page, "마라톤").click();
    await page.getByLabel("마라톤 카테고리").selectOption("Lifestyle");
    if (isMobile) await page.getByRole("button", { name: "상세 닫기" }).click();
    await openFilters(page, isMobile);
    const filters = page.getByRole("group", { name: "카테고리 필터" });
    await filters.getByRole("button", { name: /^Lifestyle/ }).click();
    await expect(counts).toHaveText("노드 2/3 · 관계 1/1");
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
    await filters.getByRole("button", { name: /^미분류/ }).click();
    await expect(counts).toHaveText("노드 3/3 · 관계 1/1");
    await filters.getByRole("button", { name: /^미분류/ }).click();

    const slider = page.getByLabel("최소 관계 점수");
    await slider.fill("25");
    await expect(page.getByTestId("score-threshold")).toHaveText("25 이상");
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await slider.fill("30");
    await expect(counts).toHaveText("노드 2/3 · 관계 0/1");
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);
    await page.getByRole("button", { name: "필터 초기화" }).click();
    await expect(counts).toHaveText("노드 3/3 · 관계 1/1");
  });

  test("clicking an edge explains why two trends are connected, with type, score, and real evidence", async ({ page }) => {
    await seed(page, { collision: true });
    const calls = forbidPaidCalls(page);
    await page.goto("/culture-map");
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await page.locator(".react-flow__edge-textwrapper").first().click({ force: true });
    const detail = page.getByTestId("map-detail");
    await expect(detail.getByTestId("relation-title")).toHaveText("러닝 ↔ 마라톤");
    await expect(detail.getByTestId("relation-type")).toContainText("공통 속성");
    await expect(detail.getByTestId("relation-score")).toContainText("27");
    await expect(detail.getByTestId("relation-shared")).toContainText("대회 전 훈련");
    await expect(detail).toContainText("확률이 아닙니다");
    const explanation = detail.getByTestId("relation-explanation");
    await expect(explanation.locator("article")).toHaveCount(3);
    await expect(explanation).toContainText("의미 유사");
    await expect(explanation).toContainText("AI 가설");
    await expect(detail.getByTestId("relation-ai-flag")).toContainText("아니오");
    const links = detail.getByTestId("relation-evidence").locator("a[data-evidence-id]");
    await expect(links).toHaveCount(6);
    const firstId = await links.first().getAttribute("data-evidence-id");
    const [trendId, localId] = [firstId!.slice(0, firstId!.indexOf(":")), firstId!.slice(firstId!.indexOf(":") + 1)];
    const saved = fixture.snapshots.find((item) => item.trendId === trendId)!.evidence.find((item) => item.id === localId)!;
    await expect(links.first()).toHaveAttribute("href", saved.url);
    expect(calls).toEqual([]);
  });

  test("an AI-only relation is labelled as a hypothesis with no evidence", async ({ page }) => {
    // 러닝의 DNA를 빼면 엔진 신호가 사라지고 저장된 Collision 가설만 남는다.
    await page.goto("/");
    await page.evaluate(({ items, collision }) => { localStorage.clear(); localStorage.setItem("trend-radar-live-analyses", JSON.stringify(items)); localStorage.setItem("trend-radar-collisions", JSON.stringify([collision])); }, { items: [{ ...fixture.snapshots[0], dna: undefined }, fixture.snapshots[1]], collision: fixture.collision });
    await page.goto("/culture-map");
    await page.locator(".react-flow__edge-textwrapper").first().click({ force: true });
    const detail = page.getByTestId("map-detail");
    await expect(detail.getByTestId("relation-type")).toContainText("AI 가설");
    await expect(detail.getByTestId("relation-score")).toContainText("점수 없음");
    await expect(detail.getByTestId("relation-ai-flag")).toContainText("예");
    await expect(detail.getByTestId("relation-no-evidence")).toHaveText("이 관계는 AI가 제안한 문화적 연결 가설이며, 실제 확산 관계가 확인된 것은 아닙니다.");
  });

  test("node details show DNA summary, six dimensions, sources, and related trends", async ({ page }) => {
    await seed(page, { extra: true });
    await page.goto("/culture-map");
    await node(page, "러닝").click();
    const detail = page.getByTestId("map-detail");
    await expect(detail.getByTestId("selected-culture-node")).toHaveText("러닝");
    await expect(detail.getByTestId("node-dna-summary")).toContainText(fixture.snapshots[0].dna.dominantPattern.title);
    await expect(detail.getByTestId("node-dimensions").locator(".dimension-row")).toHaveCount(6);
    await expect(detail).toContainText("NAVER");
    await expect(detail.getByTestId("node-connections")).toContainText("마라톤");
    await expect(detail.getByRole("link", { name: "TREND WHY 보기" })).toHaveAttribute("href", /\/trends\/live-.+\/why$/);
    await page.keyboard.press("Escape"); // 모바일 바텀시트를 닫는다(데스크톱에는 영향 없음).
    await node(page, "테스트 전용 트렌드").click();
    await expect(detail).toContainText("DNA 미분석");
    await expect(detail.getByRole("link", { name: /DNA 분해하기/ })).toBeVisible();
    await expect(detail.getByTestId("pick-collision")).toBeDisabled();
  });

  test("selected pair goes to Culture Collision by trend ID and loads the saved DNA result", async ({ page }) => {
    await seed(page, { collision: true });
    const calls = forbidPaidCalls(page);
    await page.goto("/culture-map");
    await page.locator(".react-flow__edge-textwrapper").first().click({ force: true });
    await page.getByTestId("pick-relation").click();
    await page.keyboard.press("Escape");
    const tray = page.getByTestId("collision-tray");
    await expect(tray).toContainText("2/2");
    await tray.getByTestId("explore-collision").click();
    await expect(page).toHaveURL(new RegExp(`/collision\\?trend=${encodeURIComponent(RUN)}&trend=${encodeURIComponent(MARATHON)}$`));
    await expect(page.getByTestId("collision-from-map")).toContainText("러닝 × 마라톤");
    const chips = page.getByRole("group", { name: "Collision trends" });
    await expect(chips.getByRole("button", { name: "러닝" })).toHaveAttribute("aria-pressed", "true");
    await expect(chips.getByRole("button", { name: "마라톤" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("collision-results")).toContainText(fixture.collision.result.title);
    expect(calls).toEqual([]);
  });

  test("demo graph is labelled DEMO and its relations carry no score or evidence", async ({ page }) => {
    await seed(page);
    await page.goto("/culture-map");
    await page.getByRole("button", { name: "DEMO GRAPH" }).click();
    await expect(page.locator(".react-flow__node.cm-demo")).toHaveCount(8);
    await expect(page.getByLabel("최소 관계 점수")).toBeDisabled();
    await page.locator(".react-flow__edge-textwrapper").first().click({ force: true });
    const detail = page.getByTestId("map-detail");
    await expect(detail.getByTestId("data-badge").first()).toContainText("DEMO");
    await expect(detail.getByTestId("relation-score")).toContainText("점수 없음");
    await expect(detail.getByTestId("relation-no-evidence")).toBeVisible();
    await expect(page.getByTestId("collision-tray")).toHaveCount(0);
  });

  test("the map renders again after reload and keeps the user-set category", async ({ page }) => {
    await seed(page);
    await page.goto("/culture-map");
    await node(page, "마라톤").click();
    await page.getByLabel("마라톤 카테고리").selectOption("Lifestyle");
    await page.reload();
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
    await expect(node(page, "마라톤")).toContainText("Lifestyle");
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  });
});

test.describe("culture map at 360px", () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  test("bottom sheet opens on tap, closes, and nothing overflows horizontally", async ({ page }) => {
    await seed(page, { collision: true });
    await page.goto("/culture-map");
    const detail = page.getByTestId("map-detail");
    await expect(detail).toBeHidden();
    await node(page, "마라톤").tap();
    await expect(detail).toBeVisible();
    await expect(detail.getByTestId("selected-culture-node")).toHaveText("마라톤");
    const box = await detail.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.width).toBeLessThanOrEqual(360);
    await page.getByRole("button", { name: "상세 닫기" }).tap();
    await expect(detail).toBeHidden();
    await page.getByRole("button", { name: /^필터( · \d+)?$/ }).tap();
    await expect(page.getByRole("group", { name: "카테고리 필터" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
