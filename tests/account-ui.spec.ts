import { expect, test, type Page } from "@playwright/test";
import { stubRemoteMedia } from "./helpers/stub-media";
import base from "./fixtures/live-pipeline.json";
import extra from "./fixtures/culture-validation.json";

/*
 * 계정·클라우드 관련 화면 동작(로그인 없이 확인 가능한 범위). 실제 분석 API는 호출하지 않는다.
 * 로그인 상태의 실제 Supabase 저장·복원은 tests/cloud-sync.live.spec.ts(로그인 정보 필요)에서 확인한다.
 */
const all = [...base.snapshots, ...extra.snapshots];
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function seed(page: Page, values: Record<string, unknown>) {
  await stubRemoteMedia(page);
  await page.goto("/");
  await page.evaluate((entries) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value)); }, values);
}

test.describe("overview shows every analysis and keeps searches separate", () => {
  test("analyses beyond the latest three are listed, and searched-only keywords are labelled as not analyzed", async ({ page }) => {
    await seed(page, {
      "trend-radar-live-analyses": all,
      "trend-radar-watchlist": [{ keyword: "치이카와", sources: ["discover"], addedAt: "2026-10-29T00:00:00Z" }, { keyword: "러닝", sources: ["discover"], addedAt: "2026-10-29T00:00:00Z" }],
    });
    await page.goto("/");
    await expect(page.locator(".live-card")).toHaveCount(3);
    const more = page.getByTestId("overview-all-live");
    await expect(more).toContainText(`전체 ${all.length}개`);
    await expect(more.getByRole("link")).toHaveCount(all.length - 3);
    const searched = page.getByTestId("overview-searched");
    await expect(searched).toContainText("분석 아님");
    await expect(searched.getByRole("link", { name: "치이카와" })).toBeVisible();
    // 이미 분석한 키워드는 검색 기록 쪽에 다시 나오지 않는다.
    await expect(searched.getByRole("link", { name: "러닝" })).toHaveCount(0);
  });
});

test.describe("account isolation in this browser", () => {
  test("signed out shows only analyses made without an account; another account's analyses are hidden, not deleted", async ({ page }) => {
    const [run, marathon, vocaloid] = [all[0], all[1], all[2]];
    await seed(page, { "trend-radar-live-analyses": [run, { ...marathon, ownerId: A }, { ...vocaloid, ownerId: B }] });
    await page.goto("/");
    await expect(page.locator(".live-card h3")).toHaveText([run.trendName]);
    // 계정 A로 로그인한 상태를 흉내: 소유자를 A로 설정하면 A의 분석이 보이고 B의 분석은 계속 숨겨진다.
    await page.evaluate((owner) => { localStorage.setItem("trend-radar-session-owner", owner); window.dispatchEvent(new Event("trend-radar:storage")); }, A);
    await expect(page.locator(".live-card h3")).toHaveText([run.trendName, marathon.trendName].sort((a, b) => all.findIndex((s) => s.trendName === a) - all.findIndex((s) => s.trendName === b)));
    await expect(page.getByText(vocaloid.trendName)).toHaveCount(0);
    const raw = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-live-analyses") ?? "[]").length);
    expect(raw).toBe(3);
    await expect(page.getByTestId("account-sync")).toHaveCount(0);
  });
});

test.describe("workspace insights & plans", () => {
  const plan = { id: "plan-1", type: "plan", mode: "live", title: "러닝 기록 카드뉴스", subtitle: "Instagram · Card News", createdAt: "2026-10-30T01:00:00Z", updatedAt: "2026-10-30T01:00:00Z", payload: { kind: "content-plan", plan: { title: "러닝 기록 카드뉴스" }, references: [], brief: { platform: "Instagram", format: "Card News", target: "", tone: "" }, trendNames: ["러닝"], trendKeys: ["live-러닝"], model: "m", analyzedAt: "2026-10-30T00:00:00Z" } };
  const demo = { id: "why-heisei-retro", type: "insight", mode: "demo", title: "헤이세이 레트로 — TREND WHY", subtitle: "demo", createdAt: "2026-10-30T00:00:00Z" };

  test("local and cloud are shown separately and deleting asks for the scope", async ({ page }) => {
    await seed(page, { "trend-radar-saved": [], "trend-radar-workspace": [plan, demo] });
    await page.goto("/workspace");
    const section = page.getByTestId("saved-items");
    await expect(section.getByTestId("saved-local-count")).toHaveText("2");
    await expect(section.getByTestId("saved-cloud-count")).toHaveText("—");
    await expect(section.getByTestId("saved-item-state").first()).toHaveText("LOCAL");
    await expect(section.getByText("DEMO").first()).toBeVisible();
    await section.getByRole("button", { name: `${plan.title} 삭제` }).click();
    const choice = section.getByRole("group", { name: "삭제 범위 선택" });
    await expect(choice.getByRole("button", { name: "브라우저 + 클라우드" })).toBeDisabled();
    await choice.getByRole("button", { name: "이 브라우저에서만" }).click();
    await expect(section.getByTestId("saved-sync-message")).toContainText("이 브라우저에서만");
    await expect(section.getByTestId("saved-item")).toHaveCount(1);
    const tombstones = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-saved-tombstones") ?? "[]"));
    expect(tombstones).toMatchObject([{ id: plan.id, scope: "local" }]);
  });

  test("an incomplete saved plan (e.g. an old cloud row) is listed but cannot crash the page", async ({ page }) => {
    await seed(page, { "trend-radar-live-analyses": [all[0]], "trend-radar-workspace": [{ id: "plan-broken", type: "plan", mode: "live", title: "불완전한 기획안", subtitle: "", createdAt: "2026-10-30T00:00:00Z", payload: { kind: "content-plan" } }] });
    await page.goto("/workspace");
    const item = page.getByTestId("saved-item").filter({ hasText: "불완전한 기획안" });
    await expect(item).toContainText("열 수 없습니다");
    await expect(item.getByRole("link", { name: /Open plan/ })).toHaveCount(0);
    await page.goto("/trends/live-%EB%9F%AC%EB%8B%9D/why");
    await expect(page.getByTestId("journey-bar")).toBeVisible();
  });

  test("a LIVE insight is saved from a real analysis and the cloud state is shown separately", async ({ page }) => {
    await seed(page, { "trend-radar-live-analyses": [all[0]] });
    await page.goto("/trends/live-%EB%9F%AC%EB%8B%9D/why");
    await page.getByTestId("save-live-insight").click();
    const status = page.getByTestId("cloud-save-status").last();
    await expect(status).toContainText("브라우저 저장됨");
    await expect(status).toContainText("로그인 필요");
    await page.goto("/workspace");
    const item = page.getByTestId("saved-item").filter({ hasText: "TREND WHY (LIVE)" });
    await expect(item).toBeVisible();
    await expect(item.getByRole("link", { name: /WHY 분석 열기/ })).toHaveAttribute("href", /\/trends\/live-.+\/why$/);
  });
});
