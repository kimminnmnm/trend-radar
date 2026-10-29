import { expect, test, type Page } from "@playwright/test";
import why from "./fixtures/why-v3.json";

const video = {
  id: "video-fixture-1",
  title: "러닝 브이로그 테스트 표본",
  channelTitle: "Fixture Channel",
  publishedAt: "2026-10-28T12:00:00.000Z",
  viewCount: 12345,
  url: "https://www.youtube.com/watch?v=video-fixture-1",
};

const youtube = {
  status: "live" as const,
  query: "러닝",
  collectedAt: "2026-10-29T00:00:00.000Z",
  period: { publishedAfter: "2026-09-29T00:00:00.000Z", publishedBefore: "2026-10-29T00:00:00.000Z" },
  videos: [video],
  hourlyDistribution: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour === 21 ? 1 : 0 })),
  methodology: "최근 30일 최대 10개 공개 영상 검색 표본입니다.",
  cache: { hit: false, ttlSeconds: 21600 },
  quota: { searchCalls: 1, detailCalls: 1, dailySearchUsed: 1, dailySearchLimit: 20 },
};

async function seed(page: Page) {
  const snapshot = {
    ...why.snapshot,
    source: "NAVER DataLab + YouTube + OpenAI",
    youtube,
    evidence: [...why.snapshot.evidence, {
      id: "YT-01", kind: "youtube_video", title: video.title, source: "YouTube Data API · Fixture Channel",
      url: video.url, date: video.publishedAt, collectedAt: youtube.collectedAt,
      excerpt: "공개 영상 검색 표본. 조회수는 원인 증거가 아님.",
    }],
  };
  await page.goto("/");
  await page.evaluate((value) => localStorage.setItem("trend-radar-live-analyses", JSON.stringify([value])), snapshot);
  await page.goto("/trends/live-%EB%9F%AC%EB%8B%9D/why");
}

test.describe("YouTube evidence integration", () => {
  test("saved WHY separates YouTube observations from AI interpretation", async ({ page }) => {
    await seed(page);
    const panel = page.getByTestId("youtube-evidence");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("최근 30일 관련 영상 표본")).toBeVisible();
    await expect(panel.getByRole("link", { name: video.title })).toHaveAttribute("href", video.url);
    await expect(page.getByText("YouTube 1", { exact: true })).toBeVisible();
    await expect(page.getByText("YT-01", { exact: true })).toBeVisible();
    await expect(panel).toContainText("원인 판정이 아닙니다");
  });

  test("Settings marks Google Trends as approval-required, never connected", async ({ page }) => {
    await page.route("**/api/integrations/status", (route) => route.fulfill({ json: {
      openai: { configured: true }, naver: { configured: true }, youtube: { configured: true, usage: { searchUsed: 0, detailUsed: 0, searchLimit: 20 } },
      googleTrends: { configured: false, implemented: false, status: "alpha_approval_required" }, supabase: { configured: true, implemented: true, tablesReady: true },
    } }));
    await page.route("**/api/meta/status", (route) => route.fulfill({ json: { tokenValid: true } }));
    await page.goto("/settings");
    const google = page.locator("article", { hasText: "Google Trends API" });
    await expect(google).toContainText("ALPHA APPROVAL REQUIRED");
    await expect(google).not.toContainText("CONFIGURED");
    await expect(page.locator("article", { hasText: "YouTube Data API v3" })).toContainText("CONFIGURED");
  });

  test("YouTube route validates input before auth and protects valid calls", async ({ request }) => {
    expect((await request.post("/api/youtube/search", { data: { query: "" } })).status()).toBe(400);
    expect((await request.post("/api/youtube/search", { data: { query: "러닝" } })).status()).toBe(401);
  });
});
