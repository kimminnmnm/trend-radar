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
    return env.CLOUD_TEST_EMAIL && env.CLOUD_TEST_PASSWORD ? { email: env.CLOUD_TEST_EMAIL, password: env.CLOUD_TEST_PASSWORD } : null;
  } catch { return null; }
}
const creds = credentials();
const all = [...base.snapshots, ...extra.snapshots];

test.describe.configure({ mode: "serial" });
test.skip(!creds, "CLOUD_TEST_EMAIL / CLOUD_TEST_PASSWORD 미설정 — 실제 Supabase 검증을 건너뜀");

async function signIn(page: Page) {
  await page.goto("/auth");
  await page.locator("input[type=email]").fill(creds!.email);
  await page.locator("input[type=password]").fill(creds!.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("로그인했습니다.")).toBeVisible({ timeout: 20_000 });
}

async function readCounts(page: Page) {
  await page.getByTestId("cloud-count").click();
  await expect(page.getByTestId("cloud-counts")).toBeVisible({ timeout: 30_000 });
  const tables = ["trend_analyses", "culture_trends", "culture_analysis_versions", "culture_trend_attributes", "culture_evidence_items", "culture_relations"];
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
