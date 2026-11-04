import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import fixture from "./fixtures/live-pipeline.json";

/*
 * COLLISION → TREND LAB 회귀(실측 픽스처: 러닝 × 마라톤, 2026-10-28 기록). 유료 API 호출은 실패로 본다.
 * 브라우저 저장소에 스냅샷·Collision을 넣어 재현한다. 계정 복원은 Supabase REST 응답을 브라우저에서 가짜로 돌려준다(실제 계정 아님).
 */
type Snapshot = (typeof fixture.snapshots)[number];
const [RUNNING, MARATHON] = fixture.snapshots as Snapshot[];
const COLLISION = fixture.collision;
// 목록 맨 앞에 오는 다른 Collision(조용히 첫 항목으로 바뀌면 이것이 선택된다).
const OTHER = { ...COLLISION, id: "collision-other", result: { ...COLLISION.result, title: "다른 Collision 결과", creativeOpportunities: [{ ...COLLISION.result.creativeOpportunities[0], title: "다른 기회" }] } };
const OPPORTUNITY = COLLISION.result.creativeOpportunities[0].title;

async function seed(page: Page, data: { snapshots?: unknown[]; collisions?: unknown[]; owner?: string; labs?: unknown[] }) {
  await page.goto("/");
  await page.evaluate(({ snapshots, collisions, owner, labs }) => {
    localStorage.clear();
    localStorage.setItem("trend-radar-onboarded", "1");
    localStorage.setItem("trend-radar-live-analyses", JSON.stringify(snapshots));
    localStorage.setItem("trend-radar-collisions", JSON.stringify(collisions));
    if (labs.length) localStorage.setItem("trend-radar-lab-reviews", JSON.stringify(labs));
    if (owner) localStorage.setItem("trend-radar-session-owner", owner);
  }, { snapshots: data.snapshots ?? fixture.snapshots, collisions: data.collisions ?? [OTHER, COLLISION], owner: data.owner ?? null, labs: data.labs ?? [] });
}
function forbidPaidCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => { if (/\/api\/(analyze|dna|collision|lab|studio\/production|creative-collision)$/.test(new URL(request.url()).pathname)) calls.push(request.url()); });
  return calls;
}
async function expectCollisionSelected(page: Page) {
  await expect(page.getByTestId("lab-source")).toHaveValue(`collision:${COLLISION.id}`);
  await expect(page.getByTestId("lab-source").locator("option:checked")).toContainText("러닝 × 마라톤");
  await expect(page.getByPlaceholder(OPPORTUNITY)).toBeVisible();
  await expect(page.getByTestId("lab-collision-missing")).toHaveCount(0);
}

test.describe("Collision → Trend Lab", () => {
  test("1·2. Validate in Trend Lab carries the exact collision (not the first one), and a reload keeps it", async ({ page }) => {
    await seed(page, {});
    const calls = forbidPaidCalls(page);
    await page.goto("/collision");
    // 저장된 결과 중 원하는 Collision을 보여 준 뒤(목록 두 번째) Lab으로 간다.
    const link = page.getByRole("link", { name: /Validate in Trend Lab/ });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/lab\?collision=collision-/);
    await page.goto(`/lab?collision=${COLLISION.id}`);
    await expect(page).toHaveURL(new RegExp(`/lab\\?collision=${COLLISION.id}$`));
    await expectCollisionSelected(page);
    await page.reload();
    await expectCollisionSelected(page);
    // 버튼이 만든 링크도 같은 형식으로 같은 Collision을 연다.
    await page.goto(href!);
    await expect(page.getByTestId("lab-source")).toHaveValue(href!.replace("/lab?collision=", "collision:"));
    expect(calls).toEqual([]);
  });

  test("3. a missing WHY snapshot: shows which trend is missing, keeps the collision, blocks the review and links the fix (signed out)", async ({ page }) => {
    await seed(page, { snapshots: [RUNNING] });
    const calls = forbidPaidCalls(page);
    await page.goto(`/lab?collision=${COLLISION.id}`);
    const box = page.getByTestId("lab-collision-missing");
    await expect(box).toHaveAttribute("data-state", "incomplete");
    await expect(page.getByTestId("lab-collision-summary")).toContainText("러닝 × 마라톤");
    await expect(page.getByTestId("lab-collision-summary")).toContainText(OPPORTUNITY);
    await expect(page.getByTestId("lab-missing-list")).toContainText("마라톤");
    await expect(page.getByTestId("lab-missing-list")).not.toContainText("러닝 —");
    await expect(page.getByTestId("lab-restore-state")).toContainText(/복원하지 못함: (로그인하지 않아|Supabase가 설정되지 않아)/);
    await expect(box).toContainText("지금은 Trend Lab 검토를 실행할 수 없습니다");
    await expect(page.getByTestId("lab-recover-why")).toHaveCount(1);
    await expect(page.getByTestId("lab-recover-why")).toHaveAttribute("href", /\/trends\/live-/);
    // 다른 분석으로 자동 대체하지 않는다(검토 실행 폼이 없다).
    await expect(page.getByTestId("lab-source")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Run LIVE review/ })).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  test("3b. a missing WHY snapshot is restored from the signed-in account's saved analyses", async ({ page }) => {
    const envUrl = (() => { try { return fs.readFileSync(".env.local", "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim() ?? null; } catch { return null; } })();
    test.skip(!envUrl, "Supabase URL 설정이 없어 로그인 흉내를 낼 수 없음");
    const origin = new URL(envUrl!).origin, ref = new URL(envUrl!).hostname.split(".")[0];
    const user = { id: "55555555-5555-4555-8555-555555555555", aud: "authenticated", role: "authenticated", email: "lab@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" };
    const asked: string[] = [];
    await page.route(`${origin}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
      if (url.pathname === "/rest/v1/trend_analyses" && route.request().method() === "GET") {
        asked.push(decodeURIComponent(url.search));
        return route.fulfill({ json: [{ id: "row-1", trend_id: MARATHON.trendId, trend_name: MARATHON.trendName, keywords: MARATHON.keywords, period_months: 12, source: "NAVER DataLab + OpenAI", report: MARATHON.whyReport, naver_signal: null, prompt_version: "v", analyzed_at: MARATHON.analyzedAt, evidence: MARATHON.evidence, signal_stats: null, youtube: null, dna: MARATHON.dna, dna_generated_at: null, dna_model: null }] });
      }
      if (url.pathname.startsWith("/rest/v1/")) return route.fulfill({ json: [] });
      return route.fulfill({ json: {} });
    });
    await seed(page, { snapshots: [RUNNING] });
    await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${ref}-auth-token`, session: { access_token: "test-access-token", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r", user } });
    const calls = forbidPaidCalls(page);
    await page.goto(`/lab?collision=${COLLISION.id}`);
    await expectCollisionSelected(page);
    expect(asked.some((query) => query.includes(`trend_id=in.(${MARATHON.trendId})`))).toBe(true); // 빠진 트렌드만 내 계정에서 조회
    expect(calls).toEqual([]);
  });

  test("4. opening a saved collision ID directly selects it even when another collision is listed first", async ({ page }) => {
    await seed(page, {});
    await page.goto(`/lab?collision=${COLLISION.id}`);
    await expectCollisionSelected(page);
    await expect(page.getByTestId("lab-source").locator("option")).toHaveCount(4); // Collision 2 + 트렌드 2
  });

  test("5. an unknown collision ID is reported and nothing else is auto-selected; choosing manually updates the URL", async ({ page }) => {
    await seed(page, {});
    await page.goto("/lab?collision=collision-does-not-exist");
    await expect(page.getByTestId("lab-collision-missing")).toHaveAttribute("data-state", "not-found");
    await expect(page.getByTestId("lab-collision-missing")).toContainText("collision-does-not-exist");
    await expect(page.getByTestId("lab-source")).toHaveCount(0);
    await page.getByTestId("lab-other-source").selectOption(`collision:${COLLISION.id}`);
    await expectCollisionSelected(page);
    await expect(page).toHaveURL(new RegExp(`collision=${COLLISION.id}$`));
    await page.getByTestId("lab-source").selectOption(`trend:${RUNNING.trendId}`);
    await expect(page).toHaveURL(/\/lab$/);
  });

  test("6. a collision saved by another account on this browser is not reachable; owner-less (older) collisions stay visible", async ({ page }) => {
    await seed(page, { owner: "me-1111", collisions: [{ ...COLLISION, ownerId: "other-2222" }] });
    await page.goto(`/lab?collision=${COLLISION.id}`);
    await expect(page.getByTestId("lab-collision-missing")).toHaveAttribute("data-state", "not-found");
    await seed(page, { owner: "me-1111", collisions: [COLLISION] });
    await page.goto(`/lab?collision=${COLLISION.id}`);
    await expectCollisionSelected(page);
    // 로그인 중 새로 저장하면 계정이 붙고, 다른 계정의 항목은 지워지지 않는다.
    await page.evaluate(() => {
      const all = JSON.parse(localStorage.getItem("trend-radar-collisions") ?? "[]");
      localStorage.setItem("trend-radar-collisions", JSON.stringify([...all, { ...all[0], id: "collision-of-other", ownerId: "other-2222" }]));
    });
    await page.goto("/collision");
    await expect(page.getByRole("link", { name: /Validate in Trend Lab/ })).toHaveAttribute("href", `/lab?collision=${COLLISION.id}`);
  });

  test("7. plain Trend Lab (single trend, no collision) still opens with the first source", async ({ page }) => {
    await seed(page, { collisions: [] });
    await page.goto("/lab");
    await expect(page.getByTestId("lab-source")).toHaveValue(`trend:${RUNNING.trendId}`);
    await expect(page.getByRole("button", { name: /Run LIVE review/ })).toBeVisible();
    await expect(page.getByTestId("lab-collision-missing")).toHaveCount(0);
  });

  test("8. Trend Lab → Content Studio keeps the collision and the lab review", async ({ page }) => {
    const lab = { id: "lab-1", trendKeys: COLLISION.trendKeys, trendNames: COLLISION.trendNames, collisionId: COLLISION.id, brief: { brand: "RUN CLUB", description: "d", audience: "a", platform: "Instagram", opportunity: OPPORTUNITY }, analyzedAt: "2026-10-28T00:00:00.000Z", model: "m", result: { overall: { verdict: "EXPLORE", summary: "요약" }, dimensions: [], risks: [] }, validation: { removedEvidenceIds: [], downgraded: 0 }, ledger: [] };
    await seed(page, { labs: [lab] });
    const calls = forbidPaidCalls(page);
    await page.goto(`/lab?collision=${COLLISION.id}`);
    const create = page.getByRole("link", { name: /Create content plan/ });
    await expect(create).toHaveAttribute("href", `/studio?lab=lab-1&collision=${COLLISION.id}`);
    await create.click();
    await expect(page).toHaveURL(new RegExp(`/studio\\?lab=lab-1&collision=${COLLISION.id}$`));
    await expect(page.locator("#studio-source")).toHaveValue(`collision:${COLLISION.id}`);
    expect(calls).toEqual([]);
  });
});

test.describe("Collision → Trend Lab when browser storage is full", () => {
  test("a new collision that cannot be saved permanently is kept for this tab, the user is warned, and Trend Lab still opens it", async ({ page }) => {
    await seed(page, { collisions: [] });
    // Collision 분석 API: 실측 픽스처 응답(유료 호출 없음)
    await page.route("**/api/collision", (route) => route.fulfill({ json: { cached: false, analyzedAt: COLLISION.analyzedAt, promptVersion: COLLISION.promptVersion, result: COLLISION.result, model: COLLISION.model, validation: COLLISION.validation, overlaps: COLLISION.overlaps, ledger: COLLISION.ledger } }));
    await page.goto("/collision");
    // 이후 localStorage 쓰기는 모두 실패(저장 공간 가득). sessionStorage는 그대로.
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (this: Storage, key: string, value: string) { if (this === window.localStorage) throw new DOMException("QuotaExceededError", "QuotaExceededError"); return original.call(this, key, value); };
    });
    await page.getByRole("button", { name: /Analyze connection/ }).click();
    await expect(page.getByTestId("collision-save-warning")).toContainText("영구 저장하지 못했습니다");
    const link = page.getByRole("link", { name: /Validate in Trend Lab/ });
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL((url) => url.pathname + url.search === href);
    await expect(page.getByTestId("lab-source")).toHaveValue(href!.replace("/lab?collision=", "collision:"));
    await expect(page.getByTestId("lab-collision-missing")).toHaveCount(0);
  });
});
