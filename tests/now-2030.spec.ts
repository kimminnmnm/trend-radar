import { expect, test } from "@playwright/test";
import report from "./fixtures/now-2030.json";

/* 2026-10-28 실제 스캔 결과(웹 검색 후보 + NAVER 19–39세 검증)를 저장소에 주입해 스코어보드를 검증한다. */
test.describe("Overview 2030 scoreboard", () => {
  test("empty state asks to start instead of showing demo ranks", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const board = page.getByTestId("now-2030");
    await expect(board.getByText("INSERT COIN")).toBeVisible();
    await expect(board.getByRole("button", { name: /PRESS START/ })).toBeVisible();
    await expect(board.locator(".board li")).toHaveCount(0);
  });

  test("saved scan renders ranked board with sources and WHY links without API calls", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/api/trends/now")) calls.push(request.url()); });
    await page.goto("/");
    await page.evaluate((value) => localStorage.setItem("trend-radar-now-2030", JSON.stringify([value])), report);
    await page.reload();
    const board = page.getByTestId("now-2030");
    await expect(board.getByText("SAVED ANALYSIS")).toBeVisible();
    await expect(board.locator(".champion h3")).toHaveText(report.items[0].keyword);
    await expect(board.locator(".board li")).toHaveCount(report.items.length);
    await expect(board.locator(".champion .src a").first()).toHaveAttribute("href", report.items[0].sources[0].url);
    await board.getByRole("button", { name: "관심도 수준 순" }).click();
    await expect(board.getByText(/배치 간 환산 추정치/)).toBeVisible();
    await board.getByRole("link", { name: /WHY 분석/ }).first().click();
    await expect(page).toHaveURL(/\/trends\/live-.+\/why$/);
    expect(calls).toEqual([]);
  });

  test("scan stores the result and shows LIVE badge", async ({ page }) => {
    await page.route("**/api/trends/now", (route) => route.fulfill({ json: { mode: "live", cached: false, report } }));
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: /PRESS START/ }).click();
    const board = page.getByTestId("now-2030");
    await expect(board.getByText("LIVE ANALYSIS")).toBeVisible();
    await page.reload();
    await expect(board.getByText("SAVED ANALYSIS")).toBeVisible();
  });

  test("scan API rejects invalid input", async ({ request }) => {
    expect((await request.post("/api/trends/now", { data: { force: "yes" } })).status()).toBe(400);
  });
});
