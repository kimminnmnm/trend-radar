import { expect, test, type Page } from "@playwright/test";
import base from "./fixtures/live-pipeline.json";
import production from "./fixtures/studio-production.json";
import pulse from "./fixtures/ig-pulse.json";
import { studioSavedItem } from "../lib/studio-cloud";
import { defaultSettings, type ProductionPlan, type StudioProject } from "../lib/content-production";
import type { LiveAnalysisSnapshot } from "../lib/types";

/*
 * TREND RADAR 3.0 — Editorial Web 디자인과 Classic Desktop 전환. 외부 API는 부르지 않는다(유료 API 요청이 생기면 실패).
 * 기존 기능 테스트(900여 개)는 기본 디자인(Classic)에서 그대로 돈다. 여기서는 새 디자인에서 같은 흐름이 이어지는지와 전환을 본다.
 */
const snaps = base.snapshots as unknown as LiveAnalysisSnapshot[];
const [run, marathon] = snaps;
const plan = (production as unknown as { response: { plan: ProductionPlan } }).response.plan;
const project: StudioProject = { id: "studio-single-v3", mode: "single", title: "러닝", source: { trendKeys: [run.trendId], trendNames: [run.trendName] }, settings: { ...defaultSettings("cardnews"), slideCount: 6 }, plan, assets: [], edited: false, createdAt: "2026-11-05T00:00:00.000Z", updatedAt: "2026-11-05T00:00:00.000Z" };
const PAID = /\/api\/(analyze|dna|collision|lab|studio\/(angles|production)|images|discover|creative-collision|visual-dna|trends\/(now|instagram))/;
const WHY = `/trends/${encodeURIComponent(run.trendId)}/why`;

async function seed(page: Page, ui: "classic" | "editorial" | null, extra: Record<string, unknown> = {}) {
  const paid: string[] = [];
  page.on("request", (request) => { if (PAID.test(new URL(request.url()).pathname)) paid.push(request.url()); });
  await page.goto("/settings");
  await page.evaluate(({ ui, values }) => {
    localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1");
    if (ui) localStorage.setItem("trend-radar-interface-style", ui);
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
  }, { ui, values: { "trend-radar-live-analyses": snaps, "trend-radar-studio-projects": [project], ...extra } });
  return paid;
}
const dataKeys = (page: Page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((key) => key !== "trend-radar-interface-style").sort().map((key) => [key, localStorage.getItem(key)])));

test.describe("design versions", () => {
  test("1. Classic Desktop is the default: sidebar shown, new top navigation hidden, legacy Overview", async ({ page }) => {
    await seed(page, null);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-ui", "classic");
    const mobile = (page.viewportSize()?.width ?? 1280) < 768;
    if (!mobile) await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.getByTestId("editorial-nav")).toBeHidden();
    await expect(page.getByTestId("editorial-overview")).toHaveCount(0);
    await expect(page.getByTestId("ig-pulse")).toBeVisible();
    await expect(page.getByText("Read the signal.")).toBeVisible();
  });

  test("2. Editorial Web: top navigation, breadcrumb on deep pages, no sidebar, all seven Overview sections", async ({ page }) => {
    const paid = await seed(page, "editorial");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-ui", "editorial");
    await expect(page.getByTestId("editorial-nav")).toBeVisible();
    await expect(page.locator(".sidebar")).toBeHidden();
    const overview = page.getByTestId("editorial-overview");
    await expect(overview.getByRole("heading", { level: 1 })).toContainText("READ THE SIGNAL.");
    await expect(overview.getByTestId("edo-signal-board")).toContainText(run.trendName);
    for (const id of ["edo-live-signals", "edo-happening", "edo-connections", "edo-how", "edo-outputs", "edo-continue"]) await expect(overview.getByTestId(id)).toBeVisible();
    await expect(overview.getByTestId("ig-pulse")).toBeVisible(); // 기존 데이터 모듈을 그대로 쓴다
    await expect(overview.getByTestId("edo-output")).toHaveCount(1);
    await expect(overview.getByTestId("edo-output")).toHaveAttribute("href", `/studio?project=${project.id}`);
    await page.goto(WHY);
    // 현재 위치: Discover / 러닝 / Trend WHY (앞 두 칸은 링크, 마지막은 현재 페이지)
    const crumbs = page.getByTestId("editorial-breadcrumb").locator("li");
    await expect(crumbs).toHaveText(["Discover", run.trendName, "Trend WHY"]);
    await expect(crumbs.nth(1).getByRole("link")).toHaveAttribute("href", WHY);
    await expect(crumbs.nth(2).locator("[aria-current=page]")).toHaveText("Trend WHY");
    expect(paid).toEqual([]);
  });

  test("3·4·5. switching in Settings changes only the design, survives a reload, and leaves every saved analysis, project and Pulse report untouched; Classic is one click away", async ({ page }) => {
    await seed(page, null, { "trend-radar-ig-pulse": [pulse.first] });
    await page.goto("/settings");
    const before = await dataKeys(page);
    await expect(page.getByTestId("style-classic")).toBeChecked();
    await page.getByTestId("style-editorial").check();
    await expect(page.locator("html")).toHaveAttribute("data-ui", "editorial");
    await expect(page.getByTestId("editorial-nav")).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-ui", "editorial");
    await expect(page.getByTestId("style-editorial")).toBeChecked();
    expect(await dataKeys(page)).toEqual(before);
    await page.goto("/");
    await expect(page.getByTestId("editorial-overview")).toBeVisible();
    await expect(page.getByTestId("ig-pulse").locator(".activity li")).toHaveCount(pulse.first.items.filter((item) => item.found).length);
    // 롤백(사용자): Settings → CLASSIC DESKTOP
    await page.goto("/settings");
    await page.getByTestId("style-classic").check();
    await expect(page.locator("html")).toHaveAttribute("data-ui", "classic");
    await page.goto("/");
    await expect(page.getByTestId("editorial-overview")).toHaveCount(0);
    await expect(page.getByText("Read the signal.")).toBeVisible();
    expect(await dataKeys(page)).toEqual(before);
  });
});

test.describe("Editorial Web flows", () => {
  test("6. mobile navigation: logo, search and menu; the menu lists every group and closes after navigating", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seed(page, "editorial");
    await page.goto("/");
    const nav = page.getByTestId("editorial-nav");
    await expect(nav.getByRole("link", { name: "TREND RADAR 홈" })).toBeVisible();
    await expect(nav.getByRole("searchbox", { name: /키워드 검색/ }).or(nav.getByLabel(/키워드 검색/))).toBeVisible();
    await expect(nav.getByRole("link", { name: "Content Studio" })).toBeHidden();
    await nav.getByRole("button", { name: "메뉴 열기" }).click();
    for (const group of ["DISCOVER", "ANALYZE", "CONNECT", "CREATE", "WORKSPACE"]) await expect(nav.getByRole("button", { name: group })).toBeVisible();
    await nav.getByRole("link", { name: /Content Studio/ }).click();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(nav.getByRole("link", { name: /Content Studio/ })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("7. Overview scroll: sections come in order, How It Works marks optional steps, and the Overview keeps only a Trend Web preview (full page at /trend-web)", async ({ page }) => {
    await seed(page, "editorial");
    await page.goto("/");
    const ids = await page.getByTestId("editorial-overview").locator(":scope > section[data-testid]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid")));
    expect(ids).toEqual(["edo-live-signals", "edo-happening", "edo-connections", "edo-how", "edo-outputs", "edo-continue"]);
    await expect(page.getByTestId("edo-how")).toContainText("선택 단계");
    await expect(page.getByTestId("trend-web")).toHaveCount(0); // 전체 TREND WEB은 Overview에 없다(정보 구조 개편)
    await page.getByTestId("edo-open-trend-web").click();
    await expect(page).toHaveURL(/\/trend-web/);
    await expect(page.getByTestId("trend-web")).toBeVisible();
    await page.goto("/settings");
    await page.goto("/#trend-web"); // 예전 주소는 새 페이지로
    await expect(page).toHaveURL(/\/trend-web$/);
    await expect(page.getByTestId("trend-web")).toBeVisible();
  });

  test("8. the top search fills Discover's keyword field without starting an analysis", async ({ page }) => {
    const paid = await seed(page, "editorial");
    await page.goto("/");
    const search = page.getByTestId("editorial-nav").getByLabel(/키워드 검색/);
    await search.fill("헤이세이 레트로");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/discover\?q=/);
    await expect(page.getByLabel("LIVE keyword")).toHaveValue("헤이세이 레트로");
    expect(paid).toEqual([]);
  });

  test("9·10. Trend WHY and DNA show the saved analysis; the ANALYZE group is marked active", async ({ page }) => {
    const paid = await seed(page, "editorial");
    await page.goto(WHY);
    await expect(page.getByTestId("why-to-studio")).toBeVisible(); // 저장된 LIVE WHY 결과의 다음 행동
    await expect(page.getByTestId("ed-group-analyze").locator("..")).toHaveClass(/active/);
    await page.goto(`/trends/${encodeURIComponent(run.trendId)}/dna`);
    await expect(page.getByTestId("visual-dna")).toBeVisible();
    await expect(page.getByTestId("editorial-breadcrumb")).toContainText("Trend DNA");
    expect(paid).toEqual([]);
  });

  test("11·12. Collision keeps the selected pair, and the CREATE menu reaches Trend Lab", async ({ page }) => {
    await seed(page, "editorial", { "trend-radar-live-analyses": [...snaps, { ...run, id: "s-walk", trendId: "live-걷기", trendName: "걷기", keywords: ["걷기"] }] });
    await page.goto(`/collision?mode=creative&trend=${encodeURIComponent(marathon.trendId)}&trend=${encodeURIComponent("live-걷기")}`);
    await expect(page.getByTestId("creative-a")).toHaveValue(marathon.trendId);
    await expect(page.getByTestId("creative-b")).toHaveValue("live-걷기");
    const viewport = page.viewportSize()?.width ?? 1280;
    if (viewport < 768) await page.getByRole("button", { name: "메뉴 열기" }).click();
    else await page.getByTestId("ed-group-create").click(); // 정보 구조 개편: Trend Lab은 CREATE
    await page.getByTestId("editorial-nav").getByRole("link", { name: /Trend Lab/ }).click();
    await expect(page).toHaveURL(/\/lab$/);
    await expect(page.getByTestId("editorial-breadcrumb")).toContainText("Trend Lab");
  });

  test("13·14. Content Studio edits are saved, and a Workspace copy restores the same project", async ({ page }) => {
    const paid = await seed(page, "editorial", { "trend-radar-studio-projects": [], "trend-radar-workspace": [studioSavedItem(project)] });
    await page.goto("/workspace");
    await page.getByRole("link", { name: /Studio에서 이어서 작업/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/studio\\?project=${project.id}`));
    await expect(page.getByTestId("production-slide")).toHaveCount(plan.slides.length);
    await page.getByTestId("custom-topic").fill("러닝 크루 네 컷");
    await page.reload();
    await expect(page.getByTestId("custom-topic")).toHaveValue("러닝 크루 네 컷");
    expect(await page.evaluate((id) => JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]").some((item: { id: string }) => item.id === id), project.id)).toBe(true);
    expect(paid).toEqual([]);
  });

  test("15. Figma send works the same way (signed out: explains login, sends nothing, JSON export stays)", async ({ page }) => {
    await seed(page, "editorial");
    let called = 0;
    await page.route("**/api/figma/handoffs", (route) => { called += 1; return route.fulfill({ status: 500, json: {} }); });
    await page.goto(`/studio?project=${project.id}`);
    await page.getByTestId("production-figma-send").click();
    await expect(page.getByTestId("figma-handoff-error")).toContainText("로그인이 필요합니다");
    expect(called).toBe(0);
    await expect(page.getByTestId("production-figma")).toBeEnabled();
  });

  test("16. Settings still shows API connection status alongside INTERFACE STYLE", async ({ page }) => {
    await seed(page, "editorial");
    await page.goto("/settings");
    await expect(page.getByTestId("interface-style")).toBeVisible();
    await expect(page.getByText("Data connections")).toBeVisible();
    await expect(page.getByText(/CONFIGURED|NOT CONFIGURED|TOKEN VALID|CHECKING/).first()).toBeVisible();
  });
});

test.describe("Editorial Web: layout and accessibility basics", () => {
  for (const path of ["/", "/discover", WHY, "/culture-map", "/collision", "/lab", "/studio", "/workspace", "/settings"]) {
    test(`${decodeURIComponent(path)}: one h1, no page-wide horizontal scroll, named buttons and links`, async ({ page }) => {
      await seed(page, "editorial");
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      const report = await page.evaluate(() => {
        const visible = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
        const name = (el: Element) => (el.getAttribute("aria-label") || el.getAttribute("title") || (el as HTMLElement).innerText || "").trim();
        return {
          h1: [...document.querySelectorAll("h1")].filter(visible).length,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          unnamed: [...document.querySelectorAll("button, a[href]")].filter(visible).filter((el) => !name(el)).map((el) => el.outerHTML.slice(0, 100)),
        };
      });
      expect(report.h1).toBe(1);
      expect(report.overflow).toBeLessThanOrEqual(0);
      expect(report.unnamed).toEqual([]);
    });
  }
});

test.describe("PHASE D·E: analysis and creation pages in Editorial Web", () => {
  test("WHY and DNA get a summary bar (type, status, last analysis, key summary, next actions) whose section links all point to real sections; Classic has none", async ({ page }) => {
    const paid = await seed(page, "editorial");
    for (const [path, bar, studio] of [[WHY, "why-bar", "why-bar-studio"], [`/trends/${encodeURIComponent(run.trendId)}/dna`, "dna-bar", "dna-bar-studio"]] as const) {
      await page.goto(path);
      const box = page.getByTestId(bar);
      await expect(box).toContainText("SAVED ANALYSIS");
      await expect(box).toContainText("마지막 분석");
      await expect(page.getByTestId(`${bar}-summary`)).not.toBeEmpty();
      await expect(page.getByTestId(studio)).toHaveAttribute("href", `/studio?trend=${encodeURIComponent(run.trendId)}`);
      const targets = await page.getByTestId(`${bar}-sections`).locator("a").evaluateAll((links) => links.map((link) => link.getAttribute("href")!.slice(1)));
      expect(targets.length).toBeGreaterThanOrEqual(4);
      for (const id of targets) expect(await page.locator(`[id="${id}"]`).count(), id).toBe(1);
    }
    await page.getByTestId("dna-bar-sections").getByRole("link", { name: /Visual DNA/ }).click();
    await expect(page).toHaveURL(/#visual-dna$/);
    await expect(page.getByTestId("visual-dna")).toBeInViewport();
    expect(paid).toEqual([]);

    await page.goto("/settings");
    await page.getByTestId("style-classic").check();
    await page.goto(WHY);
    await expect(page.getByTestId("why-to-studio")).toBeVisible();
    await expect(page.getByTestId("why-bar")).toHaveCount(0);
  });

  test("WHY without a saved analysis says so in the bar and offers no section links", async ({ page }) => {
    await seed(page, "editorial", { "trend-radar-live-analyses": [] });
    await page.goto("/trends/live-%EC%97%86%EB%8A%94%ED%82%A4%EC%9B%8C%EB%93%9C/why");
    await expect(page.getByTestId("why-bar")).toContainText("NOT ANALYZED");
    await expect(page.getByTestId("why-bar-summary")).toContainText("아직 저장된 WHY 분석이 없습니다");
    await expect(page.getByTestId("why-bar-sections")).toHaveCount(0);
  });

  test("Content Studio keeps the edit panel on screen while the slides scroll (wide screens, Editorial only)", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1100, "넓은 화면 전용 동작");
    await seed(page, "editorial");
    await page.goto(`/studio?project=${project.id}`);
    const left = page.locator(".prod-left");
    await expect(left).toHaveCSS("position", "sticky");
    await page.mouse.wheel(0, 1600);
    await expect.poll(() => left.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(120);
    await expect(page.getByTestId("production-generate")).toBeAttached();
    await page.goto("/settings");
    await page.getByTestId("style-classic").check();
    await page.goto(`/studio?project=${project.id}`);
    await expect(page.locator(".prod-left")).not.toHaveCSS("position", "sticky");
  });
});

test("the Journey Bar shows the same five steps in the same order in Editorial Web, and every step is a working link", async ({ page }) => {
  await seed(page, "editorial", { "trend-radar-studio-projects": [] });
  await page.goto(WHY);
  const bar = page.getByTestId("journey-bar");
  await expect(bar.locator("li")).toHaveText([/① 찾기/, /② 왜 뜨나/, /③ DNA 분해 · 선택/, /④ 섞어 보기 · 선택/, /⑤ 콘텐츠 만들기/]);
  await bar.getByRole("link", { name: /⑤ 콘텐츠 만들기/ }).click(); // DNA·Collision을 하지 않아도 제작으로 간다
  await expect(page).toHaveURL(/\/studio\?(trend|project)=/);
  await expect(page.getByTestId("production-mode")).toContainText(run.trendName);
  await page.goto(WHY);
  await page.getByTestId("journey-bar").getByRole("link", { name: /③ DNA 분해/ }).click();
  await expect(page).toHaveURL(/\/dna$/);
  await page.getByTestId("journey-bar").getByRole("link", { name: /④ 섞어 보기/ }).click();
  await expect(page).toHaveURL(/\/collision$/);
  if ((page.viewportSize()?.width ?? 1280) < 768) expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
