import { expect, test, type Page } from "@playwright/test";
import fixture from "./fixtures/ig-pulse.json";

/*
 * 2026-10-29 실제 측정 2회(Instagram recent_media + 웹 검색 후보)를 저장소에 주입한다. 게시물 링크만 익명화했다.
 * first: 웹 검색 + #치이카와 직접 추가, second: 같은 태그 재측정(한도 미사용, 아이브 포함).
 */
const HOUR = 36e5;
const shiftHours = <T extends { generatedAt: string; items: Array<{ collectedAt: string }> }>(report: T, hours: number): T => ({
  ...report,
  generatedAt: new Date(new Date(report.generatedAt).getTime() + hours * HOUR).toISOString(),
  items: report.items.map((item) => ({ ...item, collectedAt: new Date(new Date(item.collectedAt).getTime() + hours * HOUR).toISOString() })),
});

async function seed(page: Page, reports: unknown[], tracked: string[] = []) {
  await page.goto("/");
  await page.evaluate(({ reports, tracked }) => {
    localStorage.clear();
    localStorage.setItem("trend-radar-ig-pulse", JSON.stringify(reports));
    localStorage.setItem("trend-radar-ig-track", JSON.stringify(tracked));
  }, { reports, tracked });
  await page.reload();
}

test.describe("Overview Instagram hashtag pulse", () => {
  test("empty state asks to start and never shows invented counts", async ({ page }) => {
    await seed(page, []);
    const board = page.getByTestId("ig-pulse");
    await expect(board.getByText("NO SIGNAL")).toBeVisible();
    await expect(board.getByTestId("ig-pulse-cloud-status")).toHaveText("LOCAL ONLY");
    await expect(board.getByText("로그인하지 않아 이 브라우저에만 저장됩니다.")).toBeVisible();
    await expect(board.getByRole("button", { name: /START/ })).toBeVisible();
    await expect(board.locator(".board li")).toHaveCount(0);
  });

  test("saved scan shows measured rates as baseline without API calls", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/api/trends/instagram")) calls.push(request.url()); });
    await seed(page, [fixture.first]);
    const board = page.getByTestId("ig-pulse");
    await expect(board.getByText("SAVED ANALYSIS")).toBeVisible();
    const found = fixture.first.items.filter((item) => item.found);
    await expect(board.locator(".activity li")).toHaveCount(found.length);
    const top = board.locator(".activity li").first();
    await expect(top.locator(".kw b")).toHaveText("#치이카와");
    // 일부만 받은 태그는 24시간 수를 '이상'으로 표시한다.
    await expect(top.locator(".vol")).toHaveText("24h 300+개");
    // 첫 측정뿐이라 비교할 이전 값이 없다: 오르는 순에는 상승률 없이 NEW로만 표시한다(2026-11 RESCAN 재설계).
    await expect(board.locator(".rising li")).toHaveCount(found.length);
    await expect(board.locator(".rising li .chg")).toHaveText(found.map(() => "NEW"));
    await expect(board.getByText(/보류\(다음 스캔\)/)).toBeVisible();
    await expect(board.getByText(/측정 실패/)).toBeVisible();
    expect(calls).toEqual([]);
  });

  test("day-over-day change appears only after a 20h+ gap", async ({ page }) => {
    // 첫 측정을 하루 전으로 옮겨 비교 대상으로 만든다(시각만 이동, 수치는 실제 측정값).
    await seed(page, [fixture.second, shiftHours(fixture.first, -24)]);
    const board = page.getByTestId("ig-pulse");
    const row = (list: string, tag: string) => board.locator(`.${list} li`, { has: page.locator(".kw b", { hasText: `#${tag}` }) });
    await expect(row("rising", "치이카와").locator(".chg")).toHaveText("■ 0%");
    // 아이브는 첫 측정에서 실패해 이전 값이 없다: 상승률을 만들지 않고 NEW로 표시한다.
    await expect(row("rising", "아이브").locator(".chg")).toHaveText("NEW");
    await expect(row("activity", "아이브")).toHaveCount(1);

    // 2분 간격 재측정: 이전 측정이 있는 태그는 비교 대기(오르는 순에 없음), 처음 확인된 아이브만 NEW.
    await seed(page, [fixture.second, fixture.first]);
    await expect(board.locator(".rising li")).toHaveCount(1);
    await expect(row("rising", "아이브").locator(".chg")).toHaveText("NEW");
    await expect(board.getByTestId("rising-waiting")).toContainText("3개");
  });

  test("scan re-measures tracked tags, adds new ones, and keeps only active tags in tracking", async ({ page }) => {
    let sent: { track: string[]; add: string[]; discover: boolean; allowNew: boolean } | null = null;
    await page.route("**/api/trends/instagram", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { mode: "live", cached: false, report: fixture.second } });
    });
    await seed(page, [fixture.first], ["치이카와"]);
    const board = page.getByTestId("ig-pulse");
    await board.getByLabel("추적할 해시태그").fill("#새 태그");
    await board.getByRole("button", { name: "추가" }).click();
    await expect(board.locator(".chip.pending")).toHaveText(/#새태그/);
    await expect(board.getByLabel("신규 해시태그 검색 승인")).not.toBeChecked();
    await board.getByLabel("신규 해시태그 검색 승인").check();
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByText("LIVE ANALYSIS")).toBeVisible();
    expect(sent!.track).toEqual(["치이카와"]);
    expect(sent!.add).toEqual(["새태그"]);
    // 승인을 켜면 RESCAN 한 번에 웹 후보 탐색까지 한다(별도 체크 없음).
    expect(sent!.discover).toBe(true);
    expect(sent!.allowNew).toBe(true);
    const tracked = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-ig-track") ?? "[]"));
    expect(tracked).toEqual(["새태그", "치이카와", "아이브"]);
  });

  test("the chart shows only the latest scan (earlier web candidates stay in history); removing a tracked tag hides it from the board", async ({ page }) => {
    // second는 추적 태그만 다시 잰 스캔, first는 웹 검색 후보가 포함된 스캔. 2026-11 재설계: 과거 측정을 최신 차트에 섞지 않는다.
    await seed(page, [fixture.second, fixture.first], ["치이카와", "아이브"]);
    const board = page.getByTestId("ig-pulse");
    const tags = () => board.locator(".activity li .kw b");
    await expect(tags()).toHaveCount(4);
    await expect(board.locator(".activity li .kw b", { hasText: "#조조타운인무신사" })).toHaveCount(0);
    await board.getByTestId("ig-pulse-history").locator("summary").click();
    await expect(board.getByTestId("ig-pulse-history")).toContainText("#조조타운인무신사");

    await board.getByRole("button", { name: "치이카와 추적 해제" }).click();
    await expect(tags()).toHaveCount(3);
    await expect(board.locator(".activity li .kw b", { hasText: "#치이카와" })).toHaveCount(0);

    await board.getByLabel("추적할 해시태그").fill("치이카와");
    await board.getByRole("button", { name: "추가" }).click();
    await expect(board.locator(".activity li .kw b", { hasText: "#치이카와" })).toBeVisible();
  });

  test("scan API rejects invalid input", async ({ request }) => {
    expect((await request.post("/api/trends/instagram", { data: { force: "yes" } })).status()).toBe(400);
    expect((await request.post("/api/trends/instagram", { data: { track: Array.from({ length: 11 }, (_, i) => `t${i}`) } })).status()).toBe(400);
  });
});
