import { expect, test, type Page } from "@playwright/test";
import fixture from "./fixtures/ig-pulse.json";
import { mergePulsePreferences, pullIgPulseCloud, pushIgPulseReport } from "../lib/ig-pulse-cloud";
import type { IgPulseReport } from "../lib/types";
import { createStore, fakeSupabase, rowCount } from "./helpers/fake-supabase";

/*
 * 회귀 테스트: 2026-10-30 RESCAN 직후 전날 측정이 보드에서 사라진 문제.
 * 원인은 삭제가 아니라 "가장 최근 스캔 기준 24시간" 표시 범위였다. 결과 0개 스캔이 기준을 앞당겨 전날 측정을 모두 밀어냈다.
 * Meta API는 호출하지 않는다(/api/trends/instagram을 가로채 모의 응답).
 */
const HOUR = 36e5;
const shift = (report: IgPulseReport, hours: number, id: string): IgPulseReport => ({
  ...report, id,
  generatedAt: new Date(new Date(report.generatedAt).getTime() + hours * HOUR).toISOString(),
  items: report.items.map((item) => ({ ...item, collectedAt: new Date(new Date(item.collectedAt).getTime() + hours * HOUR).toISOString() })),
});
const first = fixture.first as unknown as IgPulseReport;
const second = fixture.second as unknown as IgPulseReport;
/** 기존 보고서 6개: 전날~사흘 전, 서로 다른 시각 */
const SIX = [0, 1, 2, 3, 4, 5].map((i) => shift(i % 2 ? first : second, i * 6, `pulse-old-${i}`)).reverse();
const FIVE = ["치이카와", "떡지순례", "런메이트캠프", "조조타운인무신사", "아이브"];
const lastAt = Math.max(...SIX.map((report) => new Date(report.generatedAt).getTime()));
const nextDay = (hours = 26) => new Date(lastAt + hours * HOUR).toISOString();
const emptyReport = (): IgPulseReport => ({ ...second, id: undefined, generatedAt: nextDay(), items: [], deferred: [], failed: [] });
const newReport = (): IgPulseReport => { const r = shift(second, 0, ""); return { ...r, id: undefined, generatedAt: nextDay(), items: r.items.map((item) => ({ ...item, collectedAt: nextDay() })) }; };

async function seed(page: Page, reports: IgPulseReport[], tracked: string[]) {
  await page.goto("/");
  await page.evaluate(({ reports, tracked }) => {
    localStorage.clear();
    localStorage.setItem("trend-radar-onboarded", "1");
    localStorage.setItem("trend-radar-ig-pulse", JSON.stringify(reports));
    localStorage.setItem("trend-radar-ig-track", JSON.stringify(tracked));
  }, { reports, tracked });
  await page.reload();
}
const stored = (page: Page) => page.evaluate(() => ({
  reports: JSON.parse(localStorage.getItem("trend-radar-ig-pulse") ?? "[]") as Array<{ id: string; generatedAt: string }>,
  tracked: JSON.parse(localStorage.getItem("trend-radar-ig-track") ?? "[]") as string[],
}));

test.describe("Pulse RESCAN never loses history", () => {
  test("a successful RESCAN adds one new report and keeps all 6 old reports and the 5 tracked tags", async ({ page }) => {
    await page.route("**/api/trends/instagram", (route) => route.fulfill({ json: { mode: "live", cached: false, report: newReport() } }));
    await seed(page, SIX, FIVE);
    const board = page.getByTestId("ig-pulse");
    await expect(board.getByTestId("rescan-note")).toHaveText("새로운 측정을 실행합니다. 기존 측정 기록은 유지됩니다.");
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByTestId("ig-pulse-notice")).toContainText("이전 보고서 6개는 그대로 유지됩니다");
    const after = await stored(page);
    expect(after.reports).toHaveLength(7);
    expect(new Set(after.reports.map((item) => item.id)).size).toBe(7);
    for (const old of SIX) expect(after.reports.some((item) => item.id === old.id)).toBe(true);
    expect(after.tracked).toEqual(expect.arrayContaining(FIVE));
    // 같은 응답을 다시 저장해도 중복 보고서가 생기지 않는다.
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByTestId("ig-pulse-notice")).toBeVisible();
    expect((await stored(page)).reports.length).toBeLessThanOrEqual(8);
  });

  test("an API error keeps reports, tracked tags and the board, and says so", async ({ page }) => {
    await page.route("**/api/trends/instagram", (route) => route.fulfill({ status: 502, json: { error: "META_GRAPH_ERROR", message: "Meta 응답 오류" } }));
    await seed(page, SIX, FIVE);
    const board = page.getByTestId("ig-pulse");
    const rowsBefore = await board.locator(".activity li").count();
    expect(rowsBefore).toBeGreaterThan(0);
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByTestId("ig-pulse-error")).toContainText("새로운 측정에 실패했습니다. 이전 측정 결과는 유지됩니다.");
    await expect(board.locator(".activity li")).toHaveCount(rowsBefore);
    const after = await stored(page);
    expect(after.reports).toHaveLength(6);
    expect(after.tracked).toEqual(FIVE);
  });

  test("a RESCAN that returns 0 hashtags is saved as its own report but does not empty the board (the 2026-10-30 bug)", async ({ page }) => {
    await page.route("**/api/trends/instagram", (route) => route.fulfill({ json: { mode: "live", cached: false, report: emptyReport() } }));
    await seed(page, SIX, FIVE);
    const board = page.getByTestId("ig-pulse");
    const rowsBefore = await board.locator(".activity li").count();
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByTestId("ig-pulse-notice")).toContainText("0개입니다. 이전 측정 결과는 그대로 유지됩니다");
    await expect(board.locator(".activity li")).toHaveCount(rowsBefore);
    await expect(board.locator(".activity li").first()).toContainText("시간 전 측정");
    const after = await stored(page);
    expect(after.reports).toHaveLength(7);
    expect(after.tracked).toEqual(FIVE);
    await board.getByTestId("ig-pulse-history").locator("summary").click();
    await expect(board.getByTestId("ig-pulse-history").locator("li")).toHaveCount(7);
    await expect(board.getByTestId("ig-pulse-history").locator("li").first()).toContainText("확인된 태그 0개");
  });

  test("with nothing to measure, RESCAN makes no API call and creates no empty report", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/trends/instagram", (route) => { calls += 1; return route.fulfill({ json: { report: emptyReport() } }); });
    await seed(page, SIX, []);
    const board = page.getByTestId("ig-pulse");
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByTestId("ig-pulse-error")).toContainText("이전 측정 결과는 유지됩니다");
    expect(calls).toBe(0);
    expect((await stored(page)).reports).toHaveLength(6);
  });

  test("past tags are offered for re-tracking but never added without the user's choice", async ({ page }) => {
    await seed(page, SIX, []);
    const board = page.getByTestId("ig-pulse");
    const restore = board.getByTestId("ig-pulse-restore");
    await expect(restore).toBeVisible();
    expect((await stored(page)).tracked).toEqual([]);
    await restore.getByRole("button", { name: /#치이카와/ }).click();
    await expect(board.locator(".track .chip", { hasText: "#치이카와" })).toBeVisible();
    expect((await stored(page)).tracked).toEqual(["치이카와"]);
    await expect(restore.getByRole("button", { name: /#치이카와/ })).toHaveCount(0);
  });
});

test.describe("Pulse cloud sync protects tracked tags", () => {
  test("an empty local list never wipes the cloud list; explicit removal and re-add are respected", () => {
    const cloud = { tracked: FIVE, dismissed: [] };
    expect(mergePulsePreferences({ tracked: [], dismissed: [] }, cloud).tracked).toEqual(FIVE);
    const removed = mergePulsePreferences({ tracked: FIVE.slice(1), dismissed: [{ tag: "치이카와", at: "2026-10-30T00:00:00.000Z" }] }, cloud);
    expect(removed.tracked).toEqual(FIVE.slice(1));
    const readded = mergePulsePreferences({ tracked: ["치이카와"], dismissed: [] }, removed);
    expect(readded.tracked).toEqual(expect.arrayContaining(FIVE));
    expect(readded.dismissed).toEqual([]);
  });

  test("saving a report does not touch the tracked-tag row; other accounts see nothing", async () => {
    const store = createStore();
    const a = fakeSupabase(store, { id: "user-a" });
    const b = fakeSupabase(store, { id: "user-b" });
    await a.from("instagram_pulse_preferences").upsert({ user_id: "user-a", tracked_tags: FIVE, dismissed_tags: [] }, { onConflict: "user_id" }).select("user_id");
    for (const report of SIX) expect((await pushIgPulseReport(report, a)).ok).toBe(true);
    expect((await pushIgPulseReport(emptyReport(), a)).ok).toBe(true);
    expect(rowCount(store, "instagram_pulse_reports", "user-a")).toBe(7);
    const prefs = await a.from("instagram_pulse_preferences").select("tracked_tags").eq("user_id", "user-a");
    expect((prefs.data as Array<{ tracked_tags: string[] }>)[0].tracked_tags).toEqual(FIVE);
    // 다른 브라우저(같은 계정)에서 불러오면 7개 모두 내려온다. 다른 계정은 0개.
    expect((await pullIgPulseCloud(a)).reportCount).toBe(7);
    expect((await pullIgPulseCloud(b)).reportCount).toBe(0);
    expect(rowCount(store, "instagram_pulse_reports", "user-b")).toBe(0);
  });
});
