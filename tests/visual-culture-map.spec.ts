import { expect, test, type Page } from "@playwright/test";
import base from "./fixtures/live-pipeline.json";
import extra from "./fixtures/culture-validation.json";
import vdna from "./fixtures/visual-dna.json";
import { buildCultureGraph } from "../lib/culture-graph";
import { buildVisualRelations, compareVisualDna, deltaE, observedFeatures, trendImages, VISUAL_EDGE_MIN } from "../lib/visual-map";
import type { VisualDna, VisualDnaRecord } from "../lib/visual-dna";
import type { LiveAnalysisSnapshot } from "../lib/types";

/*
 * PHASE V4 Visual Culture Map.
 * 실측 Visual DNA는 헤이세이 레트로 1건(2026-10-30, tests/fixtures/visual-dna.json)뿐이다.
 * 두 번째 Visual DNA가 필요한 경우 "테스트 전용 시각 사본"을 테스트 안에서만 만든다(실제 분석 아님).
 * 외부 API는 호출하지 않고, 썸네일 요청은 1px 이미지로 대신한다.
 */
const all = [...base.snapshots, ...extra.snapshots] as unknown as LiveAnalysisSnapshot[];
const record = (vdna as unknown as { record: VisualDnaRecord }).record;
const heisei = { ...all.find((item) => item.trendName === "헤이세이 레트로")!, visualDna: record };
const ballet = all.find((item) => item.trendName === "발레코어")!;
const others = all.filter((item) => item.trendId !== heisei.trendId && item.trendId !== ballet.trendId);

/** 색을 조금 옮기고 관찰 특징 일부만 남긴 사본. 이름과 ID에 테스트 전용임을 남긴다. */
const shift = (hex: string) => `#${[1, 3, 5].map((i) => Math.min(255, parseInt(hex.slice(i, i + 2), 16) + 6).toString(16).padStart(2, "0")).join("")}`;
const similarDna: VisualDna = { ...record.result, palette: record.result.palette.slice(0, 3).map((color) => ({ ...color, hex: shift(color.hex) })), dimensions: record.result.dimensions.map((dimension) => ({ ...dimension, features: dimension.features.slice(0, 1) })) };
const twin: LiveAnalysisSnapshot = { ...ballet, id: "test-visual-twin", trendId: "live-테스트전용시각사본", trendName: "테스트 전용 시각 사본", keywords: ["테스트 전용 시각 사본"], visualDna: { ...record, result: similarDna } };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

test.describe("visual similarity layer (no browser)", () => {
  test("identical Visual DNA scores 1, CIELAB distance behaves, and only observed cited features count", () => {
    expect(compareVisualDna(record.result, record.result)!.score).toBe(1);
    expect(Math.round(deltaE("#ffffff", "#000000"))).toBe(100);
    expect(deltaE("#f5a8cf", "#f5a8cf")).toBe(0);
    const features = observedFeatures(record.result);
    expect(features.length).toBeGreaterThan(0);
    expect(features.every((item) => item.dimension !== "Visual Mood" && item.mediaIds.length > 0)).toBe(true);
  });

  test("a trend without Visual DNA never gets a visual edge and is reported as missing", () => {
    const { relations, analyzed, missing } = buildVisualRelations([heisei, ballet]);
    expect(relations).toEqual([]);
    expect(analyzed).toEqual([heisei.trendId]);
    expect(missing).toEqual([ballet.trendId]);
  });

  test("a visually close pair is linked with close colors and shared features; an unrelated one is not", () => {
    const close = buildVisualRelations([heisei, twin]).relations;
    expect(close).toHaveLength(1);
    expect(close[0].score).toBeGreaterThanOrEqual(VISUAL_EDGE_MIN);
    expect(close[0].closeColors.length).toBe(3);
    expect(close[0].closeColors.every((pair) => pair.deltaE <= 20)).toBe(true);
    expect(close[0].sharedFeatures.length).toBeGreaterThan(0);
    expect(close[0].id).toMatch(/^visual:/);

    const far: LiveAnalysisSnapshot = { ...twin, trendId: "live-테스트전용무관", visualDna: { ...record, result: { ...record.result, palette: [{ hex: "#0b3d0b", name: "짙은 초록", mediaIds: ["x"] }], dimensions: record.result.dimensions.map((dimension) => ({ ...dimension, features: dimension.features.map((feature) => ({ ...feature, label: `무관 ${dimension.dimension} ${feature.label.length}` })) })) } } };
    const result = compareVisualDna(record.result, far.visualDna!.result)!;
    expect(result.score).toBeLessThan(VISUAL_EDGE_MIN);
    expect(buildVisualRelations([heisei, far]).relations).toEqual([]);
  });

  test("the cultural relation engine output is unchanged by Visual DNA", () => {
    const withVisual = [heisei, ballet, twin, ...others];
    const without = withVisual.map((item) => ({ ...item, visualDna: undefined }));
    expect(JSON.stringify(buildCultureGraph(withVisual, []).relations)).toBe(JSON.stringify(buildCultureGraph(without, []).relations));
  });

  test("node images are real collected media, analyzed images first", () => {
    const images = trendImages(heisei, 4);
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((item) => item.thumbnailUrl && ["youtube", "instagram", "web"].includes(item.platform))).toBe(true);
    const analyzed = new Set(record.media.map((item) => item.mediaId));
    expect(analyzed.has(images[0].mediaId)).toBe(true);
  });
});

async function seed(page: Page, items: LiveAnalysisSnapshot[]) {
  await page.route(/^https:\/\/(i\.ytimg\.com|.*cdninstagram\.com|.*fbcdn\.net)\//, (route) => route.fulfill({ body: PNG, contentType: "image/png" }));
  await page.goto("/");
  await page.evaluate((list) => {
    localStorage.clear();
    localStorage.setItem("trend-radar-onboarded", "1");
    localStorage.setItem("trend-radar-live-analyses", JSON.stringify(list));
  }, items);
}
function forbidPaidCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => { if (/\/api\/(analyze|dna|collision|lab|studio|visual-dna|images|creative-collision)/.test(new URL(request.url()).pathname)) calls.push(request.url()); });
  return calls;
}

test.describe("visual mode on the culture map", () => {
  test("visual mode adds thumbnails and a separate visual-similarity layer with image comparison", async ({ page, isMobile }) => {
    await seed(page, [heisei, ballet, twin]);
    const calls = forbidPaidCalls(page);
    await page.goto("/culture-map");
    await expect(page.locator(".react-flow__node")).toHaveCount(3);
    await expect(page.getByTestId("node-thumb")).toHaveCount(0);
    const cultureCount = await page.locator(".react-flow__edge").count();

    await page.getByTestId("lens-visual").click();
    await expect(page.getByTestId("visual-status")).toContainText("Visual DNA 2/3");
    await expect(page.locator(".react-flow__node.cm-no-vdna")).toHaveCount(1);
    await expect(page.getByTestId("node-thumb").first()).toBeVisible();
    await expect(page.locator(".react-flow__edge.cm-edge-visual")).toHaveCount(1);
    await expect(page.getByTestId("map-legend")).toContainText("문화적 관계·확산·인과를 뜻하지 않습니다");

    await page.locator(".react-flow__edge-textwrapper").first().click({ force: true });
    await expect(page.getByTestId("visual-title")).toContainText("헤이세이 레트로");
    await expect(page.getByTestId("visual-title")).toContainText("테스트 전용 시각 사본");
    await expect(page.getByTestId("visual-score")).toContainText("/ 100");
    await expect(page.getByTestId("image-compare").locator("img").first()).toHaveAttribute("src", /^https:\/\/i\.ytimg\.com\//);
    await expect(page.getByTestId("palette-compare")).toContainText("ΔE");
    await expect(page.getByTestId("visual-shared")).not.toContainText("이름이 비슷한 관찰 특징이 없습니다");
    await expect(page.getByTestId("visual-culture-link")).toBeVisible();
    if (isMobile) await page.getByRole("button", { name: "상세 닫기" }).click();

    await page.getByTestId("visual-overlay").check();
    await expect(page.locator(".react-flow__edge")).toHaveCount(cultureCount + 1);

    await page.getByTestId("lens-culture").click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(cultureCount);
    await expect(page.getByTestId("node-thumb")).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  test("the node panel shows real images and palette, and says when Visual DNA is missing", async ({ page, isMobile }) => {
    await seed(page, [heisei, ballet]);
    const calls = forbidPaidCalls(page);
    await page.goto("/culture-map");
    await page.getByTestId("lens-visual").click();
    await expect(page.getByTestId("visual-status")).toContainText("2개 이상 트렌드에 Visual DNA가 있어야");
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);
    await page.locator(".react-flow__node").filter({ hasText: "헤이세이 레트로" }).click();
    await expect(page.getByTestId("node-visual")).toBeVisible();
    await expect(page.getByTestId("node-visual-palette")).toContainText("#f5a8cf");
    if (isMobile) await page.getByRole("button", { name: "상세 닫기" }).click();
    await page.locator(".react-flow__node").filter({ hasText: "발레코어" }).click();
    await expect(page.getByTestId("node-visual-missing")).toBeVisible();
    expect(calls).toEqual([]);
  });

  test("the culture relation panel compares both trends' real images side by side", async ({ page }) => {
    await seed(page, [heisei, ballet, ...others]);
    await page.goto("/culture-map");
    const edges = page.locator(".react-flow__edge");
    test.skip(await edges.count() === 0, "이 픽스처 조합에 문화 관계가 없음");
    await page.locator(".react-flow__edge").first().click({ force: true });
    await expect(page.getByTestId("relation-title")).toBeVisible();
    await expect(page.getByTestId("image-compare").locator(".ic-col")).toHaveCount(2);
  });

  test("visual mode does not overflow on narrow screens", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await seed(page, [heisei, ballet, twin]);
    await page.goto("/culture-map");
    await page.getByTestId("lens-visual").click();
    await expect(page.getByTestId("node-thumb").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
