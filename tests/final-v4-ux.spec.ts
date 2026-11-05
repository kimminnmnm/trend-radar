import { expect, test } from "@playwright/test";
import base from "./fixtures/live-pipeline.json";
import v3run from "./fixtures/editorial-v3-run.json";
import studio from "./fixtures/editorial-studio.json";
import v21 from "./fixtures/editorial-engine-v21.json";
import { editorialQualityGate } from "../lib/editorial-quality";
import type { ProductionPlan } from "../lib/content-production";
import type { ContentAngle } from "../lib/editorial";
import type { LiveAnalysisSnapshot } from "../lib/types";

/*
 * FINAL POLISH V4 2차 — P1-4: 근거가 부족한 방향을 고르면 생성 전에 대안(A~E)을 보여 준다. P1-6: 출처 서술 2장 이상은 필수 실패.
 * 실제 V3 실측의 치이카와 방향 세트(모두 partial/needs_research)를 쓴다. 유료 호출 없음.
 */
const sample = (base.snapshots as unknown as LiveAnalysisSnapshot[])[0];
const recorded = (v3run as unknown as { runs: { chiikawa: { angles: { angles: ContentAngle[] } } } }).runs.chiikawa.angles.angles;
const project = (angles: ContentAngle[]) => ({ id: "studio-v4-thin", mode: "single", title: "치이카와", source: { trendKeys: [sample.trendId], trendNames: [sample.trendName] }, settings: { format: "cardnews", aspect: "4:5", slideCount: 6, durationSec: 30, target: "", tone: "", brand: "", goal: "", cta: "", mode: "editorial" }, assets: [], edited: false, createdAt: "2026-11-05T00:00:00.000Z", updatedAt: "2026-11-05T00:00:00.000Z",
  angles: { items: angles, mode: "editorial", validation: { removedEvidenceIds: [], genericTitles: [], droppedDuplicates: [], downgradedFit: 0 }, model: "m", generatedAt: "2026-11-04T00:00:00.000Z" } });

async function open(page: import("@playwright/test").Page, angles: ContentAngle[]) {
  const paid: string[] = [];
  page.on("request", (request) => { if (/\/api\/(analyze|dna|collision|lab|studio\/(angles|production)|images|discover)$/.test(new URL(request.url()).pathname)) paid.push(request.url()); });
  await page.goto("/");
  await page.evaluate(({ p, s }) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-live-analyses", JSON.stringify([s])); localStorage.setItem("trend-radar-studio-projects", JSON.stringify([p])); }, { p: project(angles), s: sample });
  await page.goto(`/studio?project=studio-v4-thin`);
  return paid;
}

test.describe("V4 P1-4 · thin evidence alternatives", () => {
  test("the recorded chiikawa angle (partial) shows options A-E before generating; fewer slides is one click; nothing is called", async ({ page }) => {
    const paid = await open(page, recorded);
    await expect(page.getByTestId("thin-evidence")).toHaveCount(0); // 고르기 전에는 없음
    await page.getByTestId("angle-card").first().click(); // "일하고 보상받는 치이카와" — V3 실측에서 실패한 방향
    const box = page.getByTestId("thin-evidence");
    await expect(box).toContainText("근거가 일부만 있어요");
    await expect(box.locator("li")).toHaveCount(5);
    await expect(page.getByTestId("thin-research")).toContainText("켜져 있음"); // 디테일 조사 기본값은 켜짐
    await expect(page.getByTestId("thin-alternatives")).toContainText("지금 제안 중에는 없어요"); // 실측 세트에는 근거 충분 방향이 없다
    await page.getByTestId("thin-slides").getByRole("button", { name: "4장으로 줄이기" }).click();
    await expect(page.getByTestId("setting-slides")).toHaveValue("4");
    await page.getByTestId("angle-research").uncheck();
    await page.getByTestId("thin-research").getByRole("button", { name: "조사 켜기" }).click();
    await expect(page.getByTestId("angle-research")).toBeChecked();
    expect(paid).toEqual([]); // 유료 API 호출 없음
  });

  test("a grounded alternative can be chosen directly, and then the warning goes away", async ({ page }) => {
    const angles = recorded.map((angle, index) => index === 1 ? { ...angle, evidence_fit: "grounded" as const } : angle);
    await open(page, angles);
    await page.getByTestId("angle-card").nth(3).click(); // needs_research
    await expect(page.getByTestId("thin-evidence")).toContainText("근거가 거의 없어요");
    await page.getByTestId("thin-alternatives").getByRole("button", { name: angles[1].title }).click();
    await expect(page.getByTestId("angle-title")).toHaveValue(angles[1].title);
    await expect(page.getByTestId("thin-evidence")).toHaveCount(0);
  });
});

/* ---------- P1-6: 출처 서술 2장 이상은 필수 실패 ---------- */

test.describe("V4 P1-6 · source narration on 2+ slides fails the required gate", () => {
  test("the recorded KIA 'previous best' (narration on slides 2·3·4) now fails and asks the review to rewrite them; one narrated slide stays a signal only", () => {
    const kia = (studio as unknown as { kia: { after: { plan: ProductionPlan } } }).kia.after.plan;
    const report = editorialQualityGate(kia, { subjectTerms: ["기아타이거즈", "기아"] });
    const check = report.checks.find((item) => item.id === "no-source-narration")!;
    expect(check.group).toBe("required");
    expect(check.pass).toBe(false);
    expect(report.failing).toContain("no-source-narration");
    expect(report.issues.filter((issue) => issue.problem.startsWith("출처를 서술하는 문장")).length).toBeGreaterThanOrEqual(2);
    // 1장만 출처를 서술한 실측 결과(V2.1 ballet, V3 KIA 3번)는 필수 통과 · 편집 신호만
    const ballet = (v21 as unknown as { productions: Record<string, { plan: ProductionPlan }> }).productions.ballet.plan;
    const one = editorialQualityGate(ballet, { subjectTerms: ["발레코어"] });
    expect(one.failing).not.toContain("no-source-narration");
    expect(one.checks.find((item) => item.id === "not-report")!.pass).toBe(false);
    expect(one.hints.some((hint) => hint.problem.startsWith("출처를 서술하는 문장"))).toBe(true);
  });
});

/* ---------- P1-7: 화면마다 같은 틀의 안내(이 화면 · 먼저 · 결과는) ---------- */
test("V4 P1-7 · main screens show the same three-line guide", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-live-analyses", JSON.stringify([s])); }, sample);
  for (const path of ["/discover", `/trends/${encodeURIComponent(sample.trendId)}/why`, `/trends/${encodeURIComponent(sample.trendId)}/dna`, "/culture-map", "/collision", "/lab", "/studio", "/workspace"]) {
    await page.goto(path);
    const guide = page.getByTestId("page-guide");
    await expect(guide, path).toBeVisible();
    await expect(guide.locator("li"), path).toHaveCount(3);
    await expect(guide, path).toContainText("먼저");
  }
});
