import { expect, test, type Page } from "@playwright/test";
import base from "./fixtures/live-pipeline.json";
import production from "./fixtures/studio-production.json";
import v3run from "./fixtures/editorial-v3-run.json";
import { studioSavedItem } from "../lib/studio-cloud";
import { defaultSettings, type ProductionPlan, type StudioProject } from "../lib/content-production";
import type { ContentAngle } from "../lib/editorial";
import type { LiveAnalysisSnapshot } from "../lib/types";

/*
 * FINAL POLISH V4 3차 — PHASE 7 WORKFLOW STABILITY. 화면을 옮겨도 고른 트렌드·Collision·프로젝트가 바뀌지 않는지 본다.
 * 외부 API 호출 없음(유료 API 요청이 생기면 실패). 이미 다른 파일이 확인하는 부분은 여기서 반복하지 않는다(docs/FINAL_V4_QA_REPORT.md 표 참고).
 */
const [run, marathon] = base.snapshots as unknown as LiveAnalysisSnapshot[];
const walk = { ...run, id: "s-walk", trendId: "live-걷기", trendName: "걷기", keywords: ["걷기"] };
const snaps = [run, marathon, walk];
const PAID = /\/api\/(analyze|dna|collision|lab|studio\/(angles|production)|images|discover|creative-collision|visual-dna)/;

async function seed(page: Page, values: Record<string, unknown>) {
  const paid: string[] = [];
  page.on("request", (request) => { if (PAID.test(new URL(request.url()).pathname)) paid.push(request.url()); });
  await page.goto("/");
  await page.evaluate((entries) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value)); }, values);
  return paid;
}

test.describe("FLOW A · Discover → WHY → DNA → Studio", () => {
  test("from the DNA page the next step opens Studio for the same trend", async ({ page }) => {
    const paid = await seed(page, { "trend-radar-live-analyses": snaps });
    await page.goto(`/trends/${encodeURIComponent(marathon.trendId)}/dna`);
    const bar = page.getByTestId("journey-bar");
    await expect(bar.getByTestId("journey-trend")).toHaveText(marathon.trendName);
    await bar.getByTestId("journey-next").click();
    await expect(page.getByTestId("production-mode")).toContainText(`SINGLE TREND MODE · ${marathon.trendName}`);
    await page.reload();
    await expect(page.getByTestId("production-mode")).toContainText(`SINGLE TREND MODE · ${marathon.trendName}`);
    expect(paid).toEqual([]);
  });
});

test.describe("FLOW B/C · links into Creative Collision keep the requested trends", () => {
  test("a direct page load of /collision?mode=creative&trend=… selects exactly those trends, not the first saved ones", async ({ page }) => {
    const paid = await seed(page, { "trend-radar-live-analyses": snaps });
    await page.goto(`/collision?mode=creative&trend=${encodeURIComponent(marathon.trendId)}&trend=${encodeURIComponent(walk.trendId)}`);
    await expect(page.getByTestId("creative-a")).toHaveValue(marathon.trendId);
    await expect(page.getByTestId("creative-b")).toHaveValue(walk.trendId);
    await page.reload();
    await expect(page.getByTestId("creative-a")).toHaveValue(marathon.trendId);
    await expect(page.getByTestId("creative-b")).toHaveValue(walk.trendId);
    expect(paid).toEqual([]);
  });

  test("FLOW C: Culture Map's collision link keeps the pair when switching to Creative Collision", async ({ page }) => {
    await seed(page, { "trend-radar-live-analyses": snaps });
    await page.goto(`/collision?trend=${encodeURIComponent(walk.trendId)}&trend=${encodeURIComponent(marathon.trendId)}`);
    await page.getByTestId("mode-creative").click();
    await expect(page.getByTestId("creative-a")).toHaveValue(walk.trendId);
    await expect(page.getByTestId("creative-b")).toHaveValue(marathon.trendId);
  });

  test("an unknown trend id in the link is reported instead of silently using another trend", async ({ page }) => {
    await seed(page, { "trend-radar-live-analyses": snaps });
    await page.goto(`/collision?mode=creative&trend=${encodeURIComponent("live-없는트렌드")}&trend=${encodeURIComponent(walk.trendId)}`);
    await expect(page.getByTestId("creative-missing-trend")).toContainText("없는트렌드");
  });
});

test.describe("FLOW D · Content Studio → Workspace → Content Studio", () => {
  test("restoring from the Workspace copy keeps the angle, own topic, template choices and storyboard, and survives a reload", async ({ page }) => {
    const plan = (production as unknown as { response: { plan: ProductionPlan } }).response.plan;
    const angle = (v3run as unknown as { runs: { kia: { angles: { angles: ContentAngle[] } } } }).runs.kia.angles.angles[1];
    const project: StudioProject = { id: "studio-single-flow-d", mode: "single", title: "러닝", source: { trendKeys: [run.trendId], trendNames: [run.trendName] }, settings: { ...defaultSettings("cardnews"), slideCount: 6 }, plan, angle, customTopic: "러닝 크루의 네 컷 사진", designSource: "templates", templateAssignments: { [plan.slides[0].slide_id]: "TEMPLATE_COVER_02", [plan.slides[2].slide_id]: "TEMPLATE_BODY_03" }, assets: [], edited: true, createdAt: "2026-11-05T00:00:00.000Z", updatedAt: "2026-11-05T00:00:00.000Z" };
    // 이 브라우저에는 프로젝트가 없고 Workspace 사본만 있다(다른 브라우저에서 저장한 경우와 같음).
    const paid = await seed(page, { "trend-radar-live-analyses": [run], "trend-radar-workspace": [studioSavedItem(project)] });
    await page.goto("/workspace");
    await page.getByRole("link", { name: /Studio에서 이어서 작업/ }).first().click();
    await expect(page).toHaveURL(/\/studio\?project=studio-single-flow-d/);
    const check = async () => {
      await expect(page.getByTestId("production-mode")).toContainText(`SINGLE TREND MODE · ${run.trendName}`);
      await expect(page.getByTestId("angle-title")).toHaveValue(angle.title);
      await expect(page.getByTestId("custom-topic")).toHaveValue("러닝 크루의 네 컷 사진");
      await expect(page.getByTestId("design-source-templates")).toBeChecked();
      await expect(page.getByTestId("production-slide")).toHaveCount(plan.slides.length);
    };
    await check();
    await page.reload();
    await check();
    // 복원만 하면 Workspace 사본을 읽는다. 한 번 고치면 이 브라우저에 저장되고, 템플릿 선택·스토리보드는 그대로 따라간다.
    await page.getByTestId("custom-topic").fill("러닝 크루의 네 컷 사진 모음");
    await page.reload();
    await expect(page.getByTestId("custom-topic")).toHaveValue("러닝 크루의 네 컷 사진 모음");
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]").find((item: { id: string }) => item.id === "studio-single-flow-d"));
    expect(local?.templateAssignments).toEqual(project.templateAssignments);
    expect(local?.plan.slides.map((slide: { slide_id: string }) => slide.slide_id)).toEqual(plan.slides.map((slide) => slide.slide_id));
    expect(paid).toEqual([]);
  });
});
