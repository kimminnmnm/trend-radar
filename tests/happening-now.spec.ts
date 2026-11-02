import { expect, test, type Page } from "@playwright/test";
import fixture from "./fixtures/discovery-t1-t3.json";
import { arrangeSignals, type DiscoverySignal } from "../lib/discovery";

/*
 * T4 Overview "WHAT'S HAPPENING NOW?". 응답은 2026-11-02 실측 픽스처(빼빼로데이·메이크업 30일)를 그대로 돌려준다.
 * 실제 외부 API는 부르지 않는다. 다시 열 때 API를 부르지 않는지, 서버 판정만 표시하는지, WHY·Studio로 현상이 이어지는지 확인한다.
 */
const pepero = fixture.pepero as unknown as { keyword: string; signals: DiscoverySignal[] };
const makeup = fixture.makeup as unknown as { keyword: string; signals: DiscoverySignal[] };

async function mockDiscover(page: Page, body: unknown = fixture.pepero, status = 200) {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/discover/phenomena", async (route) => { requests.push(route.request().postDataJSON()); await route.fulfill({ status, json: body }); });
  return requests;
}
async function fresh(page: Page) { await page.goto("/"); await page.evaluate(() => localStorage.clear()); await page.reload(); return page.getByTestId("happening-now"); }

test.describe("T4 WHAT'S HAPPENING NOW?", () => {
  test("empty state never calls the paid discovery API on load", async ({ page }) => {
    const requests = await mockDiscover(page);
    const panel = await fresh(page);
    await expect(panel.getByText(/아직 찾은 현상이 없습니다/)).toBeVisible();
    await expect(panel.getByTestId("hn-discover")).toBeDisabled();
    expect(requests).toEqual([]);
  });

  test("discovery shows server-verified phenomena with window, status counts and evidence links; reload reuses the saved result", async ({ page }) => {
    const requests = await mockDiscover(page);
    const panel = await fresh(page);
    await panel.getByLabel("Discovery keyword").fill("빼빼로데이");
    await panel.getByRole("button", { name: "7일" }).click();
    await panel.getByRole("button", { name: "30일" }).click();
    await panel.getByTestId("hn-discover").click();
    await expect(panel.getByText("LIVE ANALYSIS")).toBeVisible();
    expect(requests).toEqual([{ keyword: "빼빼로데이", days: 30, force: false }]);
    await expect(panel.getByTestId("hn-signal")).toHaveCount(pepero.signals.length);
    await expect(panel.getByText("관측 기간 2026-10-03 ~ 2026-11-02 (30일)")).toBeVisible();
    const observed = pepero.signals.filter((signal) => signal.verificationStatus === "Observed").length;
    await expect(panel.getByRole("button", { name: `관측됨 (${observed})` })).toBeVisible();
    // 원장에 있는 근거만 링크로 표시한다.
    const first = panel.getByTestId("hn-signal").first();
    await expect(first.locator("h3")).toHaveText(pepero.signals[0].title);
    await expect(first.locator(".hn-ex a").first()).toHaveAttribute("href", /^https?:\/\//);
    // 모멘텀은 NAVER 데이터가 있는 현상에만, 상대 지수로 표시한다.
    const withMomentum = pepero.signals.filter((signal) => signal.momentumIndicator).length;
    await expect(panel.locator(".momentum")).toHaveCount(withMomentum);
    await expect(panel.locator(".momentum").first()).toContainText("상대 지수");
    await expect(panel).not.toContainText(/급상승|바이럴|인기 1위/);

    await page.reload();
    await expect(panel.getByText("SAVED ANALYSIS")).toBeVisible();
    await expect(panel.getByTestId("hn-signal")).toHaveCount(pepero.signals.length);
    expect(requests).toHaveLength(1);
  });

  test("signal filter and sorting use the server's counts", async ({ page }) => {
    await mockDiscover(page);
    const panel = await fresh(page);
    await panel.getByLabel("Discovery keyword").fill("빼빼로데이");
    await panel.getByTestId("hn-discover").click();
    await panel.getByRole("button", { name: /^관측됨/ }).click();
    const observed = pepero.signals.filter((signal) => signal.verificationStatus === "Observed");
    await expect(panel.locator('[data-testid="hn-signal"][data-status="Observed"]')).toHaveCount(observed.length);
    await expect(panel.locator('[data-testid="hn-signal"][data-status="Emerging Signal"]')).toHaveCount(0);
    await panel.getByRole("button", { name: /^전체/ }).click();
    await panel.getByLabel("정렬").selectOption("recent");
    const expected = arrangeSignals(pepero.signals, "recent", "all").map((signal) => signal.title);
    await expect(panel.getByTestId("hn-signal").locator("h3")).toHaveText(expected);
    // 결정적 규칙: 근거 많은 순은 독립 출처 수 내림차순, 필터는 상태만 본다.
    expect(arrangeSignals(pepero.signals, "evidence", "all").slice(0, observed.length).every((signal) => signal.verificationStatus === "Observed")).toBe(true);
    expect(arrangeSignals(makeup.signals, "relevance", "Observed")).toHaveLength(0);
  });

  test("saving keeps a phenomenon across reloads; WHY and Studio receive the phenomenon", async ({ page }) => {
    await mockDiscover(page);
    const panel = await fresh(page);
    await panel.getByLabel("Discovery keyword").fill("빼빼로데이");
    await panel.getByTestId("hn-discover").click();
    const target = panel.getByTestId("hn-signal").first();
    await target.getByRole("button", { name: "저장" }).click();
    await expect(target.getByRole("button", { name: "저장됨" })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(panel.getByTestId("hn-saved")).toContainText(pepero.signals[0].title);
    await expect(target.getByRole("link", { name: "이 현상 WHY 분석" })).toHaveAttribute("href", /^\/trends\/live-[^/]+\/why\?phenomenon=disc-/);

    await target.getByRole("link", { name: "Content Studio로" }).click();
    await expect(page).toHaveURL(/\/studio\?project=/);
    await expect(page.getByTestId("studio-tab-production")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("custom-topic")).toHaveValue(pepero.signals[0].title);
    // 같은 현상으로 다시 들어오면 새 프로젝트를 만들지 않고 같은 프로젝트를 연다.
    const firstUrl = page.url();
    await page.goto("/");
    await panel.getByTestId("hn-signal").first().getByRole("link", { name: "Content Studio로" }).click();
    await expect(page).toHaveURL(/\/studio\?project=/);
    expect(page.url()).toBe(firstUrl);
  });

  test("a user-entered phenomenon goes to WHY; server errors are shown and nothing is saved", async ({ page }) => {
    await mockDiscover(page, { message: "로그인한 사용자만 이용할 수 있습니다." }, 401);
    const panel = await fresh(page);
    await panel.getByLabel("Custom phenomenon").fill("로블록스 메이크업 따라 하기");
    await expect(panel.getByTestId("hn-custom-why")).toHaveAttribute("href", /^\/trends\/live-.+\/why\?phenomenon=custom$/);
    await panel.getByLabel("Discovery keyword").fill("메이크업");
    await panel.getByTestId("hn-discover").click();
    await expect(panel.getByRole("alert")).toContainText("로그인한 사용자만");
    await expect(panel.getByTestId("hn-signal")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("trend-radar-discoveries"))).toBeNull();
  });

  test("an unknown phenomenon link in Studio explains what is missing instead of opening an empty project", async ({ page }) => {
    await page.goto("/studio?phenomenon=disc-none~sig-1");
    await expect(page.getByText(/선택한 현상을 이 브라우저에서 찾지 못했습니다/)).toBeVisible();
  });
});
