import { expect, test, type Page } from "@playwright/test";
import base from "./fixtures/live-pipeline.json";
import pulse from "./fixtures/ig-pulse.json";
import now from "./fixtures/now-2030.json";
import type { IgPulseReport, LiveAnalysisSnapshot, NowTrendReport } from "../lib/types";

/*
 * EDITORIAL WEB V3.1 — 인터랙티브 시각화. 저장된 데이터만 쓰는지(없는 관계선·시계열·상승률을 만들지 않는지)와 반응을 확인한다. 외부 API 호출 없음.
 */
const snaps = base.snapshots as unknown as LiveAnalysisSnapshot[];
const collision = (base as unknown as { collision: unknown }).collision;
const H = 36e5;
const shift = (report: IgPulseReport, hours: number, id: string): IgPulseReport => ({ ...report, id, generatedAt: new Date(Date.parse(report.generatedAt) + hours * H).toISOString(), items: report.items.map((item) => ({ ...item, collectedAt: new Date(Date.parse(item.collectedAt) + hours * H).toISOString() })) });
const PULSES = [shift(pulse.second as unknown as IgPulseReport, 26, "p-new"), pulse.first as unknown as IgPulseReport];
const NOW = { ...(now as unknown as NowTrendReport), generatedAt: new Date().toISOString() };
const PAID = /\/api\/(analyze|dna|collision|lab|studio\/(angles|production)|images|discover|creative-collision|visual-dna|trends\/(now|instagram)|media\/instagram-images)/;

async function seed(page: Page, ui: "classic" | "editorial", values: Record<string, unknown>) {
  const paid: string[] = [];
  page.on("request", (request) => { if (PAID.test(new URL(request.url()).pathname)) paid.push(request.url()); });
  await page.goto("/settings");
  await page.evaluate(({ ui, values }) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-interface-style", ui); for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value)); }, { ui, values });
  await page.goto("/");
  return paid;
}

test.describe("Hero · Signal Visualizer", () => {
  test("nodes are the saved analyses; the only edge is the evidence-backed relation; selecting shows the trend's own NAVER series with its real point count", async ({ page }) => {
    const paid = await seed(page, "editorial", { "trend-radar-live-analyses": snaps, "trend-radar-collisions": [collision] });
    const viz = page.getByTestId("signal-visualizer");
    await expect(viz.getByTestId("sv-node")).toHaveCount(snaps.length);
    await expect(viz.locator(".sv-edge")).toHaveCount(1);
    await expect(viz).toContainText("근거 있는 관계 1개");
    await viz.getByTestId("sv-chip").filter({ hasText: snaps[1].trendName }).click();
    const snap = page.getByTestId("sv-snapshot");
    await expect(snap).toContainText(snaps[1].trendName);
    await expect(snap).toContainText(`근거 ${snaps[1].evidence!.length}개`);
    const series = (snaps[1].naverSignal as { series: Array<{ title: string; data: unknown[] }> }).series.find((item) => item.title === snaps[1].trendName)!;
    await expect(snap.getByTestId("sv-wave").locator("svg")).toHaveAttribute("aria-label", new RegExp(`${series.data.length}개 측정점`));
    await expect(snap.getByTestId("sv-wave")).toContainText("실제 검색량 아님");
    await expect(snap.getByRole("link", { name: "WHY" })).toHaveAttribute("href", `/trends/${encodeURIComponent(snaps[1].trendId)}/why`);
    await viz.getByTestId("sv-reset").click();
    await expect(snap.getByTestId("sv-wave")).toHaveCount(0);
    // 키보드: 노드에 포커스하고 Enter로 선택
    await viz.getByTestId("sv-node").first().focus();
    await page.keyboard.press("Enter");
    await expect(viz.getByTestId("sv-node").first()).toHaveAttribute("aria-pressed", "true");
    expect(paid).toEqual([]);
  });

  test("without a relation no line is drawn, and without a stored series no wave is drawn", async ({ page }) => {
    // DNA·임베딩이 없으면 관계 엔진이 근거 있는 관계를 찾지 못한다(공통 속성·의미 유사 모두 없음).
    const bare = (snapshot: LiveAnalysisSnapshot) => ({ ...snapshot, dna: undefined, embedding: null, cultureMetadata: undefined });
    const noSeries = { ...bare(snaps[0]), naverSignal: undefined };
    await seed(page, "editorial", { "trend-radar-live-analyses": [noSeries, bare(snaps[1])] });
    const viz = page.getByTestId("signal-visualizer");
    await expect(viz.locator(".sv-edge")).toHaveCount(0);
    await expect(viz).toContainText("근거 있는 관계 없음 — 선을 그리지 않음");
    await viz.getByTestId("sv-chip").filter({ hasText: noSeries.trendName }).click();
    await expect(page.getByTestId("sv-wave-missing")).toBeVisible();
    await expect(page.getByTestId("sv-wave")).toHaveCount(0);
  });

  test("with no analyses there is an empty state, not an invented network", async ({ page }) => {
    await seed(page, "editorial", {});
    await expect(page.getByTestId("signal-visualizer-empty")).toContainText("그릴 신호가 없습니다");
    await expect(page.getByTestId("sv-node")).toHaveCount(0);
  });
});

test.describe("Live Signals", () => {
  test("Pulse rows get value bars and a tooltip with stored values; first measurements say NEW and get no growth bar; Classic is unchanged", async ({ page }) => {
    const paid = await seed(page, "editorial", { "trend-radar-ig-pulse": PULSES });
    const board = page.getByTestId("ig-pulse");
    const top = board.locator(".activity li").first();
    await expect(top.locator(".ed-bar")).toHaveAttribute("style", /--share:\s*100%/);
    await top.focus();
    const tip = top.getByTestId("pulse-tip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("#치이카와");
    await expect(tip).toContainText("이전 측정");
    await expect(tip).toContainText("저장된 측정(SAVED)");
    const fresh = board.locator(".rising li", { has: page.locator(".kw b", { hasText: "#아이브" }) });
    await expect(fresh.locator(".chg")).toHaveText("NEW");
    await expect(fresh.locator(".ed-bar")).toHaveCount(0);
    await fresh.hover();
    await expect(fresh.getByTestId("pulse-tip")).toContainText("NEW · 계산하지 않음");
    expect(paid).toEqual([]);

    await seed(page, "classic", { "trend-radar-ig-pulse": PULSES });
    await expect(page.getByTestId("ig-pulse").locator(".activity li")).toHaveCount(4);
    await expect(page.locator(".ed-bar, [data-testid=pulse-tip]")).toHaveCount(0);
  });

  test("2030 HIGH SCORE gets a stored-series line chart (relative index, not volume); mixing request batches says the comparison is an estimate; Classic has no chart", async ({ page }) => {
    const paid = await seed(page, "editorial", { "trend-radar-now-2030": [NOW] });
    await page.getByTestId("high-score-chart-slot").scrollIntoViewIfNeeded(); // Motion V4: 화면에 들어올 때 그린다
    const chart = page.getByTestId("high-score-chart");
    await expect(chart).toContainText("실제 검색량 아님");
    await expect(chart.locator(".recharts-line")).toHaveCount(1);
    const first = NOW.items[0];
    const other = NOW.items.find((item) => item.batch !== first.batch)!;
    await chart.getByTestId("hs-pick").filter({ hasText: other.keyword }).click();
    await expect(chart.locator(".recharts-line")).toHaveCount(2);
    await expect(chart.getByTestId("hs-note")).toContainText("추정치");
    expect(paid).toEqual([]);
    await seed(page, "classic", { "trend-radar-now-2030": [NOW] });
    await expect(page.getByTestId("now-2030")).toBeVisible();
    await expect(page.getByTestId("high-score-chart")).toHaveCount(0);
  });
});

test("reduced motion: entrance and draw animations are off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page, "editorial", { "trend-radar-live-analyses": snaps });
  await expect(page.locator(".edo-display .l2")).toHaveCSS("animation-name", "none");
  await page.getByTestId("sv-chip").first().click();
  await expect(page.locator(".sv-wave .line")).toHaveCSS("animation-name", "none");
});
