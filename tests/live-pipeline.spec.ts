import { expect, test, type Page } from "@playwright/test";
import fixture from "./fixtures/live-pipeline.json";

/*
 * 2026-10-28에 실제 NAVER·Instagram·OpenAI 응답으로 기록한 픽스처(Instagram 캡션·링크 익명화)를 브라우저 저장소에 주입한다.
 * 저장된 분석을 다시 열 때 유료 API를 호출하지 않아야 하므로 분석 API 호출은 테스트 실패로 처리한다.
 */
const RUNNING = "/trends/live-%EB%9F%AC%EB%8B%9D";

async function seed(page: Page, options: { collision?: boolean } = {}) {
  await page.goto("/");
  await page.evaluate(({ snapshots, collision }) => {
    localStorage.clear();
    localStorage.setItem("trend-radar-live-analyses", JSON.stringify(snapshots));
    if (collision) localStorage.setItem("trend-radar-collisions", JSON.stringify([collision]));
  }, { snapshots: fixture.snapshots, collision: options.collision ? fixture.collision : null });
}

function forbidPaidCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => { if (/\/api\/(analyze|dna|collision|lab)$/.test(new URL(request.url()).pathname)) calls.push(request.url()); });
  return calls;
}

test.describe("live pipeline with recorded data", () => {
  test("saved LIVE WHY is shown first with evidence ledger and no API call", async ({ page }) => {
    await seed(page);
    const calls = forbidPaidCalls(page);
    await page.goto(`${RUNNING}/why`);
    await expect(page.getByText("SAVED ANALYSIS").first()).toBeVisible();
    await expect(page.getByText("EVIDENCE LEDGER · 서버가 API 응답으로 생성")).toBeVisible();
    await expect(page.locator(".evidence-ledger article").filter({ hasText: "IG-01" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Re-analyze/ })).toBeVisible();
    await expect(page.getByText("CURRENT INTERPRETATION")).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  test("LIVE DNA renders six dimensions with evidence and statuses", async ({ page }) => {
    await seed(page);
    const calls = forbidPaidCalls(page);
    await page.goto(`${RUNNING}/dna`);
    await expect(page.getByText("CULTURAL FINGERPRINT / LIVE")).toBeVisible();
    await expect(page.locator(".dna-card")).toHaveCount(6);
    await page.getByRole("button", { name: /Behavior/ }).click();
    const detail = page.getByTestId("dna-dimension-detail");
    await expect(detail).toContainText("대회 전 훈련과 준비");
    await expect(detail.locator(".evidence-refs a").first()).toBeVisible();
    await page.getByRole("button", { name: /Audience/ }).click();
    await expect(detail).toContainText("Insufficient Evidence");
    expect(calls).toEqual([]);
  });

  test("DNA without WHY shows NOT ANALYZED instead of demo content", async ({ page }) => {
    await seed(page);
    await page.goto("/trends/live-%EC%97%86%EB%8A%94%ED%82%A4%EC%9B%8C%EB%93%9C/dna");
    await expect(page.getByTestId("dna-not-analyzed")).toBeVisible();
    await expect(page.getByText("CULTURAL FINGERPRINT / DEMO")).toHaveCount(0);
  });

  test("Culture Map builds live nodes and typed edges", async ({ page }) => {
    await seed(page);
    await page.goto("/culture-map");
    await expect(page.getByRole("button", { name: "LIVE GRAPH · 2" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
    await expect(page.locator(".react-flow__edge").first()).toBeAttached();
    await page.locator(".connections button").first().click();
    await expect(page.getByText("SELECTED EDGE")).toBeVisible();
    await page.getByRole("button", { name: "DEMO GRAPH" }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(8);
  });

  test("Collision shows saved live result and hands off to Studio", async ({ page }) => {
    await seed(page, { collision: true });
    const calls = forbidPaidCalls(page);
    await page.goto("/collision");
    await expect(page.getByTestId("collision-results")).toContainText(fixture.collision.result.title);
    await expect(page.getByTestId("collision-results")).toContainText("LIMITATIONS");
    await page.getByRole("link", { name: /Create content plan/ }).click();
    await expect(page).toHaveURL(/\/studio\?collision=collision-fixture/);
    await expect(page.locator("#studio-source")).toHaveValue("collision:collision-fixture");
    expect(calls).toEqual([]);
  });

  test("Studio sends real WHY/DNA/Collision context, saves, and restores after reload", async ({ page }) => {
    await seed(page, { collision: true });
    let sent: { trends: Array<{ key: string; dna?: unknown; evidence: unknown[] }>; collision?: { title: string } } | null = null;
    await page.route("**/api/studio", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: fixture.studioResponse });
    });
    await page.goto("/studio?collision=collision-fixture");
    await page.getByRole("button", { name: "Generate grounded brief" }).click();
    await expect(page.getByRole("heading", { name: fixture.studioResponse.result.title })).toBeVisible();
    expect(sent!.trends.map((trend) => trend.key)).toEqual(["live-러닝", "live-마라톤"]);
    expect(sent!.trends.every((trend) => trend.dna && trend.evidence.length > 0)).toBe(true);
    expect(sent!.collision?.title).toBe(fixture.collision.result.title);
    await expect(page.getByText("10 / REFERENCES · 서버 근거 원장")).toBeVisible();
    await page.getByTitle("저장").click();
    await expect(page.getByText("Workspace에 저장했습니다.")).toBeVisible();
    await page.goto("/workspace");
    await page.reload();
    await page.getByRole("button", { name: /CONTENT PLANS/ }).click();
    await page.getByRole("link", { name: /Open plan/ }).click();
    await expect(page.getByRole("heading", { name: fixture.studioResponse.result.title })).toBeVisible();
    await expect(page.getByRole("region", { name: "Content plan output" }).getByText("SAVED ANALYSIS")).toBeVisible();
  });

  test("API failure is shown as ERROR, not replaced by demo data", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.route("**/api/analyze", (route) => route.fulfill({ status: 401, json: { error: "NAVER_AUTH", message: "NAVER API HUB 인증에 실패했습니다." } }));
    await page.goto("/trends/live-%ED%85%8C%EC%8A%A4%ED%8A%B8/why");
    await expect(page.getByText("NOT ANALYZED")).toBeVisible();
    await page.getByRole("button", { name: "Run live analysis" }).click();
    await expect(page.getByText("NAVER API HUB 인증에 실패했습니다.")).toBeVisible();
    await expect(page.getByTestId("data-badge").first()).toHaveText(/ERROR/);
    await expect(page.getByText("EVIDENCE LEDGER")).toHaveCount(0);
  });

  test("analysis APIs reject invalid input without calling external services", async ({ request }) => {
    expect((await request.post("/api/dna", { data: { trend: "러닝" } })).status()).toBe(400);
    expect((await request.post("/api/collision", { data: { trends: [] } })).status()).toBe(400);
    expect((await request.post("/api/lab", { data: {} })).status()).toBe(400);
    expect((await request.post("/api/studio", { data: {} })).status()).toBe(400);
    expect((await request.post("/api/discover/validate", { data: { keywords: [] } })).status()).toBe(400);
  });
});
