import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import base from "./fixtures/live-pipeline.json";
import extra from "./fixtures/culture-validation.json";

/*
 * 실제 Supabase 클라우드 저장·불러오기 검증(선택 실행).
 * .env.local에 CLOUD_TEST_EMAIL, CLOUD_TEST_PASSWORD가 있을 때만 실행한다. 값은 출력하지 않는다.
 * 실측 분석 8개를 그 계정에 저장하고, 성공 여부는 localStorage가 아니라 "DB 행 확인"(Supabase 실제 행 수)으로 판단한다.
 * 데이터를 지우지 않는다. 가능하면 테스트 전용 계정을 쓴다. 유료 API(OpenAI·NAVER·Meta)는 호출하지 않는다.
 */
function credentials() {
  try {
    const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((line) => line.includes("=") && !line.trim().startsWith("#")).map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
    return env.CLOUD_TEST_EMAIL && env.CLOUD_TEST_PASSWORD ? { email: env.CLOUD_TEST_EMAIL, password: env.CLOUD_TEST_PASSWORD, other: env.CLOUD_TEST_EMAIL_B && env.CLOUD_TEST_PASSWORD_B ? { email: env.CLOUD_TEST_EMAIL_B, password: env.CLOUD_TEST_PASSWORD_B } : null } : null;
  } catch { return null; }
}
const creds = credentials();
const all = [...base.snapshots, ...extra.snapshots];

test.describe.configure({ mode: "serial" });
test.skip(!creds, "CLOUD_TEST_EMAIL / CLOUD_TEST_PASSWORD 미설정 — 실제 Supabase 검증을 건너뜀");

async function signIn(page: Page, account: { email: string; password: string } = creds!) {
  await page.goto("/auth");
  await page.locator("input[type=email]").fill(account.email);
  await page.locator("input[type=password]").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("로그인했습니다.")).toBeVisible({ timeout: 20_000 });
}

async function readCounts(page: Page) {
  await page.getByTestId("cloud-count").click();
  await expect(page.getByTestId("cloud-counts")).toBeVisible({ timeout: 30_000 });
  const tables = ["trend_analyses", "culture_trends", "culture_analysis_versions", "culture_trend_attributes", "culture_evidence_items", "culture_relations", "saved_items"];
  const counts: Record<string, number> = {};
  for (const table of tables) counts[table] = Number(await page.getByTestId(`cloud-count-${table}`).innerText());
  return { counts, duplicates: await page.getByTestId("cloud-duplicates").innerText() };
}

async function freshBrowser(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

test("real Supabase: save from browser A, verify rows, no duplicates, load in browser B", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "실제 DB 쓰기는 한 번만 실행");
  test.setTimeout(180_000);

  // 브라우저 A: 로컬 분석 8개 → 클라우드 저장
  const a = await freshBrowser(browser);
  await signIn(a.page);
  await a.page.evaluate((items) => { localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-live-analyses", JSON.stringify(items)); }, all);
  await a.page.goto("/culture-map");
  await expect(a.page.getByTestId("culture-cloud-auth")).toContainText("로그인됨");
  await a.page.getByTestId("cloud-push").click();
  await expect(a.page.getByTestId("culture-cloud-message")).toContainText(/저장했습니다|새로 저장할 항목이 없습니다/, { timeout: 90_000 });
  await expect(a.page.getByTestId("culture-cloud-message")).not.toContainText("실패");
  const first = await readCounts(a.page);
  testInfo.annotations.push({ type: "rows after first save", description: JSON.stringify(first) });
  expect(first.counts.trend_analyses).toBeGreaterThanOrEqual(8);
  expect(first.counts.culture_trends).toBeGreaterThanOrEqual(8);
  expect(first.counts.culture_analysis_versions).toBeGreaterThanOrEqual(8);
  expect(first.counts.culture_relations).toBeGreaterThan(0);
  expect(first.duplicates).toBe("중복 분석 행 없음");

  // 같은 데이터를 다시 저장해도 행이 늘지 않는다
  await a.page.getByTestId("cloud-push").click();
  await expect(a.page.getByTestId("culture-cloud-message")).not.toContainText("실패", { timeout: 90_000 });
  const second = await readCounts(a.page);
  expect(second.counts).toEqual(first.counts);

  // 브라우저 B: 빈 저장소 + 같은 계정 → 지도가 Supabase에서 채워진다
  const b = await freshBrowser(browser);
  await signIn(b.page);
  await b.page.evaluate(() => { localStorage.setItem("trend-radar-onboarded", "1"); localStorage.removeItem("trend-radar-live-analyses"); localStorage.removeItem("trend-radar-culture-versions"); localStorage.removeItem("trend-radar-culture-relations"); });
  await b.page.goto("/culture-map");
  await expect(b.page.getByTestId("culture-cloud-message")).toContainText("가져왔습니다", { timeout: 60_000 });
  await expect(b.page.locator(".react-flow__node")).not.toHaveCount(0);
  expect(await b.page.locator(".react-flow__node").count()).toBeGreaterThanOrEqual(8);
  const relationsInB = await b.page.getByTestId("map-counts").innerText();
  testInfo.annotations.push({ type: "browser B map", description: relationsInB });
  expect(relationsInB).not.toMatch(/관계 0\/0/);

  // 새로고침해도 유지되고, B에서 불러온 뒤에도 DB 행이 늘지 않는다
  await b.page.reload();
  await expect(b.page.locator(".react-flow__node")).not.toHaveCount(0);
  const third = await readCounts(b.page);
  expect(third.counts).toEqual(first.counts);

  await a.context.close();
  await b.context.close();
});

const PLAN_ID = "plan-live-test-fixture";
// 실제 Content Studio 응답(2026-10-28 기록 픽스처)을 기획안으로 저장해 Studio에서 그대로 열리는지 본다.
const studio = (base as unknown as { studioResponse: { result: { title: string }; references: unknown[]; model: string; analyzedAt: string } }).studioResponse;
const plan = { id: PLAN_ID, type: "plan", mode: "live", title: `[테스트] ${studio.result.title}`, subtitle: "Instagram · Card News · 러닝 × 마라톤", createdAt: "2026-10-30T01:00:00.000Z", updatedAt: "2026-10-30T01:00:00.000Z", payload: { kind: "content-plan", plan: studio.result, references: studio.references, brief: { platform: "Instagram", format: "Card News", target: "", tone: "" }, trendNames: ["러닝", "마라톤"], trendKeys: ["live-러닝", "live-마라톤"], model: studio.model, analyzedAt: studio.analyzedAt } };

test("real Supabase: workspace plan is saved once, restored in another browser, and hidden from another account", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "실제 DB 쓰기는 한 번만 실행");
  test.setTimeout(180_000);
  const a = await freshBrowser(browser);
  await signIn(a.page);
  await a.page.evaluate((item) => { localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-workspace", JSON.stringify([item])); }, plan);
  await a.page.goto("/workspace");
  const section = a.page.getByTestId("saved-items");
  a.page.once("dialog", (dialog) => void dialog.accept());
  await section.getByTestId("saved-push").click();
  await expect(section.getByTestId("saved-sync-message")).not.toContainText("실패", { timeout: 60_000 });
  await expect(section.getByTestId("saved-cloud-count")).not.toHaveText("—", { timeout: 30_000 });
  await a.page.goto("/culture-map");
  const first = await readCounts(a.page);
  expect(first.counts.saved_items).toBeGreaterThanOrEqual(1);
  // 같은 항목 재저장 → 행 수 동일
  await a.page.goto("/workspace");
  a.page.once("dialog", (dialog) => void dialog.accept());
  await a.page.getByTestId("saved-push").click();
  await expect(a.page.getByTestId("saved-sync-message")).not.toContainText("실패", { timeout: 60_000 });
  await a.page.goto("/culture-map");
  expect((await readCounts(a.page)).counts.saved_items).toBe(first.counts.saved_items);

  // 다른 브라우저(빈 저장소)에서 같은 계정 → 기획안 복원 후 Studio에서 열기
  const b = await freshBrowser(browser);
  await signIn(b.page);
  await b.page.evaluate(() => { localStorage.setItem("trend-radar-onboarded", "1"); localStorage.removeItem("trend-radar-workspace"); });
  await b.page.goto("/workspace");
  const restored = b.page.getByTestId("saved-item").filter({ hasText: plan.title });
  await expect(restored).toBeVisible({ timeout: 60_000 });
  await restored.getByRole("link", { name: /Open plan/ }).click();
  await expect(b.page.getByRole("heading", { name: studio.result.title })).toBeVisible({ timeout: 30_000 });

  // 다른 계정에는 보이지 않는다(계정 B 정보가 있을 때만)
  if (creds!.other) {
    const c = await freshBrowser(browser);
    await signIn(c.page, creds!.other);
    await c.page.goto("/workspace");
    await expect(c.page.getByTestId("saved-cloud-count")).not.toHaveText("—", { timeout: 60_000 });
    await expect(c.page.getByTestId("saved-item").filter({ hasText: plan.title })).toHaveCount(0);
    await c.page.goto("/");
    for (const name of all.map((item) => item.trendName)) await expect(c.page.locator(".live-card h3").filter({ hasText: name })).toHaveCount(0);
    await c.context.close();
  } else testInfo.annotations.push({ type: "skipped", description: "CLOUD_TEST_EMAIL_B / CLOUD_TEST_PASSWORD_B 미설정 — 다른 계정 격리는 실제 DB로 확인하지 않음" });
  await a.context.close();
  await b.context.close();
});
