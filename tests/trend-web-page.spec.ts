import { expect, test, type Page } from "@playwright/test";
import fixture from "./fixtures/discovery-t1-t3.json";
import base from "./fixtures/live-pipeline.json";
import { buildTrendWebGraph, trendWebSessionId, type TrendWebSession } from "../lib/trend-web";
import type { DiscoveryReport } from "../lib/discovery";
import type { LiveAnalysisSnapshot } from "../lib/types";

/*
 * 정보 구조 개편: TREND WEB 독립 페이지(/trend-web) · Overview 미리보기 · 메뉴(CONNECT/CREATE) · 예전 주소 호환 · Figma Export 안내.
 * 연결 분석 API는 저장된 실측 응답으로 가로챈다(유료 호출 없음).
 */
type Fixture = { makeup: Omit<DiscoveryReport, "id" | "generatedAt" | "model" | "sources" | "limitations" | "excluded"> & Partial<DiscoveryReport>; connections: Record<string, unknown> };
const recorded = fixture as unknown as Fixture;
const report = (id: string, generatedAt: string, keyword = recorded.makeup.keyword): DiscoveryReport => ({
  id, keyword, window: recorded.makeup.window, signals: recorded.makeup.signals, excluded: recorded.makeup.excluded ?? [], limitations: recorded.makeup.limitations ?? [],
  sources: recorded.makeup.sources ?? { youtube: 10, web: 6, webDropped: 0 }, ledger: recorded.makeup.ledger, model: "recorded-real-response", generatedAt,
});
const NEW = report("disc-makeup-new", "2026-11-03T10:00:00.000Z");
const OLD = report("disc-makeup-old", "2026-11-01T10:00:00.000Z", "메이크업 지난주");
const snaps = base.snapshots as unknown as LiveAnalysisSnapshot[];

async function seed(page: Page, ui: "classic" | "editorial", values: Record<string, unknown> = { "trend-radar-discoveries": [NEW, OLD] }) {
  const paid: string[] = [];
  page.on("request", (request) => { if (/\/api\/(analyze|dna|collision|lab|studio\/|images|discover\/phenomena|creative-collision|trends\/)/.test(new URL(request.url()).pathname)) paid.push(request.url()); });
  await page.goto("/settings");
  await page.evaluate(({ ui, values }) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-interface-style", ui); for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value)); }, { ui, values });
  return paid;
}

test.describe("TREND WEB page", () => {
  test("keeps every feature: two-node selection, connection analysis, Creative Collision and Content Studio links, Workspace save; state comes back after a reload", async ({ page }) => {
    const paid = await seed(page, "editorial");
    let calls = 0;
    // 실제 서버처럼 요청한 두 키워드·기간을 돌려준다(기록 응답은 다른 요청의 것이라 키워드·기간만 맞춘다).
    await page.route("**/api/discover/connections", async (route) => { calls += 1; const body = route.request().postDataJSON() as { a: string; b: string; days: number }; const window = (recorded.connections as { window: Record<string, unknown> }).window; await route.fulfill({ json: { cached: true, ...recorded.connections, a: body.a, b: body.b, window: { ...window, days: body.days } } }); });
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto("/trend-web");
    await expect(page.getByTestId("editorial-breadcrumb")).toContainText("Trend Web");
    const web = page.getByTestId("trend-web");
    await expect(web.getByLabel("Trend Web report")).toHaveValue(NEW.id);
    await web.getByRole("radio", { name: "SELECT TWO MODE" }).click();
    const nodes = web.getByTestId("trend-web-node-picker").getByRole("button");
    await nodes.nth(0).click(); await nodes.nth(1).click();
    await web.getByRole("button", { name: /ANALYZE CONNECTION/ }).click();
    await expect(web.getByTestId("hn-connections")).toBeVisible();
    expect(calls).toBe(1);
    await web.getByTestId("hn-connection").first().getByRole("button", { name: "SELECT RELATION" }).click();
    await expect(web.getByTestId("trend-web-create")).toHaveAttribute("href", /^\/studio\?/);
    await expect(web.getByTestId("trend-web-next")).toContainText(/CREATIVE COLLISION|Creative Collision/);
    await web.getByRole("button", { name: /SAVE TREND WEB/ }).click();
    const stored = await page.evaluate(() => ({ workspace: JSON.parse(localStorage.getItem("trend-radar-workspace") ?? "[]"), sessions: JSON.parse(localStorage.getItem("trend-radar-trend-web-sessions") ?? "[]") as TrendWebSession[] }));
    expect(stored.workspace[0].payload.kind).toBe("trend-web");
    const picked = stored.sessions[0].selectedNodeIds;
    expect(picked).toHaveLength(2);
    // 새로고침: 같은 분석, 같은 두 노드, 같은 관계
    await page.reload();
    await expect(web.getByTestId("trend-web-selection")).toContainText("A:");
    const graph = buildTrendWebGraph(NEW);
    for (const id of picked) await expect(web.getByTestId("trend-web-selection")).toContainText(graph.nodes.find((node) => node.id === id)!.keyword);
    await expect(web.getByTestId("hn-connections")).toBeVisible(); // 저장된 연결 분석 결과가 다시 붙는다
    await expect(web.getByTestId("hn-connection").first()).toHaveAttribute("data-selected", "true");
    expect(calls).toBe(1); // 복원은 다시 호출하지 않는다
    expect(paid).toEqual([]);
  });

  test("choosing another analysis is kept in the address, so a reload reopens it; ?trendWeb= from saved items opens the right one", async ({ page }) => {
    await seed(page, "editorial");
    await page.goto("/trend-web");
    const select = page.getByTestId("trend-web").getByLabel("Trend Web report");
    await select.selectOption(OLD.id);
    await expect(page).toHaveURL(new RegExp(`trendWeb=${trendWebSessionId(OLD.id)}`));
    await page.reload();
    await expect(page.getByTestId("trend-web").getByLabel("Trend Web report")).toHaveValue(OLD.id);
    await page.goto(`/trend-web?trendWeb=${trendWebSessionId(NEW.id)}`);
    await expect(page.getByTestId("trend-web").getByLabel("Trend Web report")).toHaveValue(NEW.id);
  });

  test("on a phone the page has no page-wide horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seed(page, "editorial");
    await page.goto("/trend-web");
    await expect(page.getByTestId("trend-web")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe("Overview preview and compatibility", () => {
  test("Editorial Overview shows a small preview from the same stored analysis (no full Trend Web) and links to it", async ({ page }) => {
    const paid = await seed(page, "editorial");
    await page.goto("/");
    const preview = page.getByTestId("trend-web-preview");
    await expect(preview).toContainText(NEW.keyword);
    const graph = buildTrendWebGraph(NEW);
    await expect(preview.getByTestId("trend-web-preview-node")).toHaveCount(Math.min(10, graph.nodes.length));
    await expect(page.getByTestId("trend-web")).toHaveCount(0);
    await expect(page.getByTestId("edo-open-trend-web")).toHaveAttribute("href", `/trend-web?trendWeb=${trendWebSessionId(NEW.id)}`);
    expect(paid).toEqual([]);
  });

  test("with no Discovery analysis the preview says so instead of drawing anything", async ({ page }) => {
    await seed(page, "editorial", {});
    await page.goto("/");
    await expect(page.getByTestId("trend-web-preview-empty")).toContainText("아직 TREND WEB을 만들 분석이 없습니다");
    await expect(page.getByTestId("trend-web-preview-node")).toHaveCount(0);
  });

  test("old addresses still work: Editorial forwards /?trendWeb= and /#trend-web to the page; Classic keeps its Overview Trend Web", async ({ page }) => {
    await seed(page, "editorial");
    await page.goto(`/?trendWeb=${trendWebSessionId(OLD.id)}`);
    await expect(page).toHaveURL(new RegExp(`/trend-web\\?trendWeb=${trendWebSessionId(OLD.id)}`));
    await expect(page.getByTestId("trend-web").getByLabel("Trend Web report")).toHaveValue(OLD.id);
    await seed(page, "classic");
    await page.goto(`/?trendWeb=${trendWebSessionId(OLD.id)}`);
    await expect(page).toHaveURL(/\/\?trendWeb=/);
    await expect(page.getByTestId("trend-web").getByLabel("Trend Web report")).toHaveValue(OLD.id);
    await page.goto("/trend-web"); // Classic에서도 새 페이지로 접근 가능
    await expect(page.getByTestId("trend-web")).toBeVisible();
    await expect(page.getByTestId("editorial-nav")).toBeHidden();
  });
});

test.describe("navigation and pages around it", () => {
  test("CONNECT = Trend Web · Culture Map · Creative Collision; CREATE = Trend Lab · Content Studio · Figma Export; WORKSPACE = saved work", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 768, "데스크톱 드롭다운");
    await seed(page, "editorial");
    await page.goto("/");
    const items = async (group: string) => { await page.getByTestId(`ed-group-${group}`).click(); const list = await page.locator(`#ed-${group} a b`).allTextContents(); await page.keyboard.press("Escape"); return list; };
    expect(await items("connect")).toEqual(["Trend Web", "Culture Map", "Creative Collision"]);
    expect(await items("create")).toEqual(["Trend Lab", "Content Studio", "Figma Export"]);
    expect(await items("workspace")).toEqual(["Workspace"]);
    expect(await items("analyze")).toEqual(["Trend WHY", "Trend DNA", "Visual DNA"]);
  });

  test("Figma Export opens a guide (not the plugin pairing page's 'no key' error); the pairing page explains itself when opened directly", async ({ page }) => {
    await seed(page, "editorial", { "trend-radar-studio-projects": [] });
    await page.goto("/figma");
    await expect(page.getByTestId("figma-guide")).toContainText("Figma로 보내기");
    await expect(page.getByTestId("figma-guide-empty")).toBeVisible();
    await expect(page.getByTestId("figma-connect-error")).toHaveCount(0);
    await page.goto("/figma/connect");
    await expect(page.getByTestId("figma-connect-error")).toContainText("연결 키가 없습니다");
    await expect(page.getByRole("link", { name: "Figma로 보내기 안내" })).toHaveAttribute("href", "/figma");
  });

  test("Creative Collision's Trend A/B selects stay inside their panel (user report: cut off)", async ({ page }) => {
    await seed(page, "editorial", { "trend-radar-live-analyses": snaps });
    await page.goto(`/collision?mode=creative&trend=${encodeURIComponent(snaps[0].trendId)}&trend=${encodeURIComponent(snaps[1].trendId)}`);
    const over = await page.locator(".cc-left").evaluate((panel) => { const right = panel.getBoundingClientRect().right; return [...panel.querySelectorAll("label, select")].map((el) => el.getBoundingClientRect().right - right); });
    expect(Math.max(...over)).toBeLessThanOrEqual(0);
  });
});
