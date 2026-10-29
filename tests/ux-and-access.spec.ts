import { expect, test, type Page } from "@playwright/test";
import why from "./fixtures/why-v3.json";

/*
 * 2026-10-29 실제 WHY v3 결과(NAVER + Instagram + 웹 출처)를 저장소에 주입해 UX와 근거 표시를 검증한다.
 * 외부 API는 호출하지 않는다. 비용 API 접근 제어는 배포 모드(PAID_API_ACCESS 기본값 auth)에서 확인한다.
 */
const RUNNING_WHY = "/trends/live-%EB%9F%AC%EB%8B%9D/why";

async function seed(page: Page, values: Record<string, unknown>) {
  await page.goto("/");
  await page.evaluate((entries) => { localStorage.clear(); for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); }, values);
  await page.reload();
}

test.describe("first-run UX", () => {
  test("onboarding shows once, can be dismissed, and reopens from the guide link", async ({ page }, testInfo) => {
    await seed(page, {});
    const onboarding = page.getByTestId("onboarding");
    await expect(onboarding).toBeVisible();
    await expect(onboarding.getByText("② 왜 뜨나")).toBeVisible();
    await onboarding.getByRole("button", { name: "둘러볼게요" }).click();
    await expect(onboarding).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("onboarding")).toHaveCount(0);
    if (testInfo.project.name === "mobile-chromium") await page.getByRole("button", { name: "메뉴 열기" }).click();
    await page.getByRole("link", { name: "사용 가이드" }).click();
    await expect(page.getByTestId("onboarding")).toBeVisible();
  });

  test("menu items explain themselves in Korean", async ({ page }, testInfo) => {
    await seed(page, { "trend-radar-onboarded": "1" });
    if (testInfo.project.name === "mobile-chromium") await page.getByRole("button", { name: "메뉴 열기" }).click();
    await expect(page.getByText("키워드 입력하고 분석 시작")).toBeVisible();
    await expect(page.getByText("트렌드를 6가지 요소로 분해")).toBeVisible();
  });

  test("journey bar guides an empty workspace to Discover", async ({ page }) => {
    await seed(page, { "trend-radar-onboarded": "1" });
    const bar = page.getByTestId("journey-bar");
    await expect(bar).toContainText("아직 분석한 트렌드가 없습니다");
    await bar.getByRole("link", { name: /첫 키워드 분석하기/ }).click();
    await expect(page).toHaveURL(/\/discover$/);
    await expect(page.getByTestId("overview-empty")).toHaveCount(0);
  });

  test("overview empty state tells the user what to do", async ({ page }) => {
    await seed(page, { "trend-radar-onboarded": "1" });
    await expect(page.getByTestId("overview-empty")).toContainText("아직 직접 분석한 트렌드가 없습니다");
  });
});

test.describe("analysis journey", () => {
  test("journey bar shows the current trend, completed steps, and the next action", async ({ page }) => {
    await seed(page, { "trend-radar-onboarded": "1", "trend-radar-live-analyses": [why.snapshot] });
    await page.goto(RUNNING_WHY);
    const bar = page.getByTestId("journey-bar");
    await expect(bar.getByTestId("journey-trend")).toHaveText("러닝");
    await expect(bar.locator("li.done")).toHaveCount(2); // 찾기, WHY
    await expect(bar.getByRole("link", { name: "② 왜 뜨나" })).toHaveAttribute("aria-current", "step");
    await bar.getByTestId("journey-next").click();
    await expect(page).toHaveURL(/\/trends\/live-.+\/dna$/);
  });

  test("demo trend pages are clearly marked as not real data", async ({ page }) => {
    await seed(page, { "trend-radar-onboarded": "1" });
    await page.goto("/trends/heisei-retro/why");
    const bar = page.getByTestId("journey-bar");
    await expect(bar).toContainText("예시 데이터입니다");
    await expect(bar.getByRole("link", { name: /내 키워드로 실제 분석하기/ })).toHaveAttribute("href", "/discover");
  });
});

test.describe("TREND WHY web evidence", () => {
  test("separates reported facts from AI hypotheses and links real sources without API calls", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/api/analyze")) calls.push(request.url()); });
    await seed(page, { "trend-radar-onboarded": "1", "trend-radar-live-analyses": [why.snapshot] });
    await page.goto(RUNNING_WHY);
    const context = page.getByTestId("why-context");
    await expect(context).toBeVisible();
    const report = why.snapshot.whyReport;
    const event = report.context!.events[0];
    await expect(context.getByText(event.label)).toBeVisible();
    await expect(context.getByText(report.context!.brandCases[0].brand, { exact: false }).first()).toBeVisible();
    await expect(context.getByText("출처 보도").first()).toBeVisible();
    await expect(context.getByText("AI 가설").first()).toBeVisible();
    const web = why.snapshot.evidence.find((item) => item.id === event.evidenceIds[0])!;
    await expect(context.getByRole("link", { name: event.evidenceIds[0] }).first()).toHaveAttribute("href", web.url!);
    await expect(page.getByText(/WEB 5/).first()).toBeVisible();
    expect(calls).toEqual([]);
  });
});

test.describe("paid API access control (production default: auth)", () => {
  test("valid requests without login are rejected before any external call", async ({ request }) => {
    const analyze = await request.post("/api/analyze", { data: { trend: "러닝" } });
    expect(analyze.status()).toBe(401);
    expect((await analyze.json()).error).toBe("AUTH_REQUIRED");
    expect((await request.post("/api/trends/now", { data: {} })).status()).toBe(401);
    expect((await request.post("/api/trends/instagram", { data: { discover: false, track: ["러닝"] } })).status()).toBe(401);
    expect((await request.get("/api/meta/hashtag?query=%EB%9F%AC%EB%8B%9D")).status()).toBe(401);
  });

  test("a forged bearer token is not accepted", async ({ request }) => {
    // 올바른 요청 본문 + 가짜 토큰: Supabase Auth 확인(무료)에서 거절되어 NAVER·OpenAI까지 가지 않는다.
    const response = await request.post("/api/analyze", { headers: { Authorization: "Bearer not-a-real-token" }, data: { trend: "러닝" } });
    expect(response.status()).toBe(401);
  });
});
