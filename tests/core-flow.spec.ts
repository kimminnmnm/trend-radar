import { expect, test } from "@playwright/test";

test.describe("core cultural intelligence flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("all primary routes render", async ({ page }) => {
    const routes = ["/", "/discover", "/trends/heisei-retro/why", "/trends/heisei-retro/dna", "/culture-map", "/collision", "/lab", "/studio", "/workspace", "/auth", "/settings", "/instagram"];
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("global navigation and the gated Settings link resolve", async ({ page }, testInfo) => {
    await page.goto("/");
    if (testInfo.project.name === "mobile-chromium") {
      await page.getByRole("button", { name: "메뉴 열기" }).click();
    }
    await page.getByRole("link", { name: "Discover", exact: true }).click();
    await expect(page).toHaveURL(/\/discover$/);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("Discover filters demo trends and opens a Why report", async ({ page }) => {
    await page.goto("/discover");
    await page.getByPlaceholder("트렌드, 감정, 행동을 검색하세요").fill("보컬로이드");
    await expect(page.getByRole("heading", { name: "보컬로이드" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "헤이세이 레트로" })).toHaveCount(0);
    await page.getByRole("heading", { name: "보컬로이드" }).click();
    await expect(page).toHaveURL(/\/trends\/vocaloid\/why$/);
  });

  test("Trend Why expands hypotheses and saves an insight", async ({ page }) => {
    await page.goto("/trends/heisei-retro/why");
    const secondHypothesis = page.getByRole("button", { name: /꾸미기가 만드는 작은 주도권/ });
    await expect(secondHypothesis).toHaveAttribute("aria-expanded", "false");
    await secondHypothesis.click();
    await expect(secondHypothesis).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("기성 인터페이스를 스티커")).toBeVisible();
    await page.getByRole("button", { name: "Save insight" }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
    await page.goto("/workspace");
    await expect(page.getByRole("heading", { name: "헤이세이 레트로 — TREND WHY" })).toBeVisible();
  });

  test("Live Why configures comparison keywords and migrates legacy snapshots off demo IDs", async ({ page }) => {
    await page.goto("/trends/heisei-retro/why");
    await page.getByLabel("PRIMARY KEYWORD").fill("러닝");
    await page.getByLabel(/COMPARE/).fill("마라톤, 조깅");
    await page.getByRole("button", { name: "3M" }).click();
    await expect(page.getByText("러닝", { exact: true })).toBeVisible();
    await expect(page.getByText("마라톤", { exact: true })).toBeVisible();
    await expect(page.getByText(/3개월 · 최대 5개 비교/)).toBeVisible();

    // 이전 버전은 LIVE 분석을 데모 트렌드 ID에 저장했다. 이제는 키워드 기반 LIVE ID로 분리되어야 한다.
    await page.evaluate(() => localStorage.setItem("trend-radar-live-analyses", JSON.stringify([{
      id: "live-test", trendId: "heisei-retro", trendName: "러닝", keywords: ["러닝", "마라톤"],
      periodMonths: 3, summary: "테스트 LIVE WHY 맥락", analyzedAt: new Date().toISOString(), source: "NAVER DataLab + OpenAI",
    }])));
    await page.goto("/trends/heisei-retro/dna");
    await expect(page.getByText("LIVE ANALYSIS AVAILABLE")).toHaveCount(0);
    await expect(page.getByText("CULTURAL FINGERPRINT / DEMO")).toBeVisible();
    await page.goto("/workspace");
    await expect(page.getByRole("heading", { name: "러닝" })).toBeVisible();
    await page.goto("/trends/live-%EB%9F%AC%EB%8B%9D/dna");
    await expect(page.getByTestId("dna-not-analyzed")).toBeVisible();
  });

  test("Trend DNA changes the selected cultural dimension", async ({ page }) => {
    await page.goto("/trends/heisei-retro/dna");
    const behavior = page.getByRole("button", { name: /Behavior/i });
    await behavior.click();
    await expect(behavior).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("dna-dimension-detail")).toContainText("관찰 가능한 참여, 수집, 공유 방식");
  });

  test("Culture Map selects a node and routes to its DNA", async ({ page }) => {
    await page.goto("/culture-map");
    await expect(page.getByTestId("selected-culture-node")).toHaveText("헤이세이 레트로");
    const cameraNode = page.locator(".react-flow__node").filter({ hasText: "디지털카메라" });
    await cameraNode.click();
    await expect(page.getByTestId("selected-culture-node")).toHaveText("디지털카메라");
    await page.getByRole("link", { name: /Inspect DNA/ }).click();
    await expect(page).toHaveURL(/\/trends\/digital-camera\/dna$/);
  });

  test("Culture Collision recomputes after changing a trend", async ({ page }) => {
    await page.goto("/collision");
    await expect(page.getByTestId("collision-results")).toBeVisible();
    await page.locator("select").nth(1).selectOption("analog-log");
    await expect(page.getByTestId("collision-results")).toHaveCount(0);
    await page.getByRole("button", { name: "Analyze connection" }).click();
    await expect(page.getByTestId("collision-results")).toContainText("아날로그 기록");
  });

  test("Lab to Studio to Workspace persists and filters a content plan", async ({ page }) => {
    await page.goto("/lab");
    await page.getByRole("button", { name: "Run qualitative review" }).click();
    await expect(page.getByRole("heading", { name: "EXPLORE NOW" })).toBeVisible();
    await page.getByRole("link", { name: /Create content plan/ }).click();
    await page.getByRole("button", { name: "Generate grounded brief" }).click();
    await expect(page.getByRole("heading", { name: /나만의 레트로/ })).toBeVisible();
    await page.getByTitle("저장").click();
    await expect(page.getByText("Workspace에 저장했습니다.")).toBeVisible();
    await page.goto("/workspace");
    await page.getByRole("button", { name: /CONTENT PLANS/ }).click();
    await expect(page.getByRole("heading", { name: "나만의 레트로 디지털 다이어리" })).toBeVisible();
    await page.getByRole("button", { name: /INSIGHTS/ }).click();
    await expect(page.getByText("이 분류에 저장한 항목이 없습니다.")).toBeVisible();
  });

  test("analysis API rejects invalid input without calling external services", async ({ request }) => {
    const invalid = await request.post("/api/analyze", { data: {} });
    expect(invalid.status()).toBe(400);
  });

  test("Instagram API rejects an invalid hashtag without exposing upstream secrets", async ({ request }) => {
    const invalid = await request.get("/api/meta/hashtag?query=invalid%20hashtag");
    expect(invalid.status()).toBe(400);
    const body = await invalid.json();
    expect(body.error).toBe("META_INVALID_HASHTAG");
    expect(JSON.stringify(body)).not.toContain("META_ACCESS_TOKEN");
  });

  test("Supabase account and cloud workspace expose signed-out fallback safely", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("button", { name: "SIGN IN", exact: true })).toBeVisible();
    await expect(page.getByLabel("EMAIL")).toBeVisible();
    await page.goto("/workspace");
    await expect(page.getByText("SIGN IN REQUIRED")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in to sync" })).toHaveAttribute("href", "/auth");
  });
});
