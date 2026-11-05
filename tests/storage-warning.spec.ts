import { expect, test } from "@playwright/test";
import production from "./fixtures/studio-production.json";
import { defaultSettings, type ProductionPlan, type StudioProject } from "../lib/content-production";

/*
 * V4 P0: 브라우저 저장(localStorage) 실패가 조용히 무시되던 문제. 저장 공간이 가득 찬 상태를 흉내 내 경고가 보이는지 확인한다.
 * 아무것도 자동으로 지우지 않는다.
 */
const plan = (production as unknown as { response: { plan: ProductionPlan } }).response.plan;
const project: StudioProject = { id: "studio-storage-full", mode: "single", title: "t", source: { trendKeys: ["t"], trendNames: ["t"] }, settings: { ...defaultSettings("cardnews"), slideCount: 6 }, plan, assets: [], edited: false, createdAt: "2026-11-05T00:00:00.000Z", updatedAt: "2026-11-05T00:00:00.000Z" };

test("when the browser storage is full, editing in Studio shows a warning with the biggest items and a way to clean up; nothing is deleted", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((value) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-studio-projects", JSON.stringify([value])); }, project);
  await page.goto(`/studio?project=${project.id}`);
  await expect(page.getByTestId("production-slide")).toHaveCount(6);
  await expect(page.getByTestId("storage-warning")).toHaveCount(0);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) { if (this === window.localStorage && key.startsWith("trend-radar-studio")) throw new DOMException("QuotaExceededError", "QuotaExceededError"); return original.call(this, key, value); };
  });
  await page.getByTestId("slide-headline").first().fill("고친 제목");
  const warning = page.getByTestId("storage-warning");
  await expect(warning).toContainText("이 브라우저에 저장되지 않았습니다");
  await expect(warning).toContainText("Content Studio 프로젝트");
  await expect(page.getByTestId("storage-warning-workspace")).toHaveAttribute("href", "/workspace");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]").length)).toBe(1); // 지우지 않음
  await warning.getByRole("button", { name: "경고 닫기" }).click();
  await expect(warning).toHaveCount(0);
});
