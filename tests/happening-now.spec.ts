import { expect, test, type Page } from "@playwright/test";
import fixture from "./fixtures/discovery-t1-t3.json";
import { arrangeSignals, displayStatusOf, phenomenonContextOf, phenomenonFromQuery, phenomenonImage, phenomenonQuery, type DiscoveryReport, type DiscoverySignal } from "../lib/discovery";
import type { EvidenceItem } from "../lib/schemas";

/*
 * T4 Overview "WHAT'S HAPPENING NOW?". 응답은 2026-11-02 실측 픽스처(메이크업·빼빼로데이·로블록스, 30일)를 그대로 돌려준다.
 * 외부 API는 부르지 않는다. 카드가 보이는지만이 아니라, 카드의 현상·상태·출처 수·근거 링크가 원본 원장과 정확히 이어지는지 확인한다.
 */
type Recorded = { keyword: string; window: DiscoveryReport["window"]; signals: DiscoverySignal[]; excluded: DiscoveryReport["excluded"]; ledger: EvidenceItem[] };
const data = fixture as unknown as Record<"makeup" | "pepero" | "roblox", Recorded>;
const scenarios = [["메이크업", data.makeup], ["빼빼로데이", data.pepero], ["로블록스", data.roblox]] as const;

async function mockDiscover(page: Page, body: unknown = data.pepero, status = 200) {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/discover/phenomena", async (route) => { requests.push(route.request().postDataJSON()); await route.fulfill({ status, json: body }); });
  return requests;
}
async function fresh(page: Page) { await page.goto("/"); await page.evaluate(() => localStorage.clear()); await page.reload(); return page.getByTestId("happening-now"); }
async function discover(page: Page, keyword: string) {
  const panel = page.getByTestId("happening-now");
  await panel.getByLabel("Discovery keyword").fill(keyword);
  await panel.getByTestId("hn-discover").click();
  return panel;
}
const savedReport = (recorded: Recorded, generatedAt: string): DiscoveryReport => ({ id: `disc-saved-${recorded.keyword}`, keyword: recorded.keyword, window: recorded.window, signals: recorded.signals, excluded: recorded.excluded, limitations: [], sources: { youtube: 1, web: 1, webDropped: 0 }, ledger: recorded.ledger, model: "recorded", generatedAt });

test.describe("T4 WHAT'S HAPPENING NOW? — display and evidence linkage", () => {
  test("empty state never calls the paid discovery API and leaves the rest of Overview intact", async ({ page }) => {
    const requests = await mockDiscover(page);
    const panel = await fresh(page);
    await expect(panel.getByText(/아직 찾은 현상이 없습니다/)).toBeVisible();
    await expect(panel.getByTestId("hn-discover")).toBeDisabled();
    await expect(page.getByTestId("now-2030")).toBeVisible();
    await expect(page.getByRole("heading", { name: "내 LIVE 분석" })).toBeVisible();
    expect(requests).toEqual([]);
  });

  for (const [keyword, recorded] of scenarios) {
    test(`${keyword}: every card matches its server verdict and every evidence link resolves to the original ledger entry`, async ({ page }) => {
      const requests = await mockDiscover(page, recorded);
      await fresh(page);
      const panel = await discover(page, keyword);
      await expect(panel.getByText("LIVE ANALYSIS")).toBeVisible();
      expect(requests).toEqual([{ keyword, days: 30, force: false }]);
      const cards = panel.getByTestId("hn-signal");
      await expect(cards).toHaveCount(recorded.signals.length);
      const ledger = new Map(recorded.ledger.map((item) => [item.id, item]));
      for (const [index, signal] of recorded.signals.entries()) {
        const card = cards.nth(index);
        await expect(card.locator("h3")).toHaveText(signal.title);
        await expect(card).toHaveAttribute("data-status", displayStatusOf(signal.verificationStatus));
        await expect(card.locator(".status")).toHaveText(displayStatusOf(signal.verificationStatus));
        await expect(card.locator(".srcs")).toContainText(`출처 ${signal.independentSources}곳`);
        await expect(card.locator(".behavior")).toContainText(signal.audienceBehavior);
        if (signal.observedDateRange) await expect(card.locator(".hn-facts")).toContainText(`${signal.observedDateRange.from} ~ ${signal.observedDateRange.to}`);
        for (const platform of signal.observedPlatforms) await expect(card.locator(".hn-facts")).toContainText(platform);
        // 이미지: 근거 YouTube 영상의 썸네일만. 없으면 이미지를 그리지 않는다.
        const image = phenomenonImage(signal, recorded.ledger);
        if (image) await expect(card.locator(".hn-thumb img")).toHaveAttribute("src", image.src);
        else await expect(card.locator(".hn-thumb")).toHaveCount(0);
        await card.getByRole("button", { name: "VIEW EVIDENCE" }).click();
        const rows = card.getByTestId("hn-evidence").locator("li");
        await expect(rows).toHaveCount(signal.evidenceIds.length);
        for (const [i, id] of signal.evidenceIds.entries()) {
          const item = ledger.get(id)!;
          expect(item, `${signal.title}: ${id} must exist in the ledger`).toBeTruthy();
          await expect(rows.nth(i)).toHaveAttribute("data-evidence-id", id);
          if (item.url) await expect(rows.nth(i).locator("a")).toHaveAttribute("href", item.url);
          await expect(rows.nth(i)).toContainText(item.title);
        }
        await card.getByRole("button", { name: "VIEW EVIDENCE" }).click();
      }
      await expect(panel).not.toContainText(/급상승|바이럴|인기 1위|인기 순위/);
    });
  }

  test("single-source phenomena are labeled; several articles from one outlet still count as one source (로블록스)", async ({ page }) => {
    await mockDiscover(page, data.roblox);
    await fresh(page);
    const panel = await discover(page, "로블록스");
    const multiArticle = data.roblox.signals.find((signal) => signal.evidenceIds.length > 1 && signal.independentSources === 1)!;
    expect(multiArticle).toBeTruthy();
    const card = panel.getByTestId("hn-signal").filter({ hasText: multiArticle.title });
    await expect(card.locator(".srcs")).toHaveText(`출처 1곳 (단일 출처) · 근거 ${multiArticle.evidenceIds.length}건`);
    await expect(card.locator(".status")).toHaveText("EMERGING");
    await expect(panel.getByRole("button", { name: "OBSERVED (0)" })).toBeVisible();
  });

  test("status filter covers OBSERVED / EMERGING / INSUFFICIENT EVIDENCE; background and duplicates are not shown as insufficient", async ({ page }) => {
    const body = { ...data.pepero, excluded: [{ title: "빼빼로데이의 유래", reason: "키워드의 일반 설명·역사(현재 현상이 아님)" }, { title: "작년 빼빼로 광고", reason: "근거가 관측 기간 밖이거나 날짜를 확인할 수 없음" }, { title: "출처 없는 소문", reason: "확인된 근거 없음" }, { title: "같은 체험", reason: "다른 후보와 같은 현상" }] };
    await mockDiscover(page, body);
    await fresh(page);
    const panel = await discover(page, "빼빼로데이");
    const observed = data.pepero.signals.filter((signal) => signal.verificationStatus === "Observed").length;
    await panel.getByRole("button", { name: `OBSERVED (${observed})` }).click();
    await expect(panel.locator('[data-testid="hn-signal"][data-status="OBSERVED"]')).toHaveCount(observed);
    await expect(panel.locator('[data-testid="hn-signal"][data-status="EMERGING"]')).toHaveCount(0);
    await panel.getByRole("button", { name: `EMERGING (${data.pepero.signals.length - observed})` }).click();
    await expect(panel.locator('[data-testid="hn-signal"][data-status="OBSERVED"]')).toHaveCount(0);
    await panel.getByRole("button", { name: "INSUFFICIENT EVIDENCE (2)" }).click();
    await expect(panel.getByTestId("hn-insufficient")).toHaveCount(2);
    await expect(panel.getByTestId("hn-insufficient").first()).toContainText("작년 빼빼로 광고");
    await expect(panel).not.toContainText("빼빼로데이의 유래");
    await expect(panel.getByTestId("hn-signal")).toHaveCount(0);
    await panel.getByRole("button", { name: /^ALL/ }).click();
    await panel.getByLabel("정렬").selectOption("recent");
    await expect(panel.getByTestId("hn-signal").locator("h3")).toHaveText(arrangeSignals(data.pepero.signals, "recent", "all").map((signal) => signal.title));
  });

  test("momentum appears only with NAVER data and only as a relative index", async ({ page }) => {
    await mockDiscover(page);
    await fresh(page);
    const panel = await discover(page, "빼빼로데이");
    const withMomentum = data.pepero.signals.filter((signal) => signal.momentumIndicator).length;
    await expect(panel.locator(".momentum")).toHaveCount(withMomentum);
    await expect(panel.locator(".momentum").first()).toContainText("상대 지수 · 절대 검색량·순위 아님");
  });
});

test.describe("T4 WHAT'S HAPPENING NOW? — cache, stale data, empty results and errors", () => {
  test("reload reuses the saved result without calling the API; results older than 7 days are flagged as stale", async ({ page }) => {
    const requests = await mockDiscover(page);
    await page.goto("/");
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await page.evaluate((report) => { localStorage.clear(); localStorage.setItem("trend-radar-discoveries", JSON.stringify([report])); }, savedReport(data.makeup, old));
    await page.reload();
    const panel = page.getByTestId("happening-now");
    await expect(panel.getByText("SAVED ANALYSIS")).toBeVisible();
    await expect(panel.getByTestId("hn-stale")).toContainText("10일 전에 수집한 결과");
    await expect(panel.getByTestId("hn-signal")).toHaveCount(data.makeup.signals.length);
    expect(requests).toEqual([]);
  });

  test("a recent saved result is not flagged as stale", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((report) => { localStorage.clear(); localStorage.setItem("trend-radar-discoveries", JSON.stringify([report])); }, savedReport(data.pepero, new Date().toISOString()));
    await page.reload();
    await expect(page.getByTestId("happening-now").getByTestId("hn-signal").first()).toBeVisible();
    await expect(page.getByTestId("hn-stale")).toHaveCount(0);
  });

  test("an empty result explains that nothing with in-window evidence was found", async ({ page }) => {
    await mockDiscover(page, { ...data.makeup, signals: [], excluded: [] });
    await fresh(page);
    const panel = await discover(page, "메이크업");
    await expect(panel.getByText(/관측 기간 안의 근거가 있는 세부 현상을 찾지 못했습니다/)).toBeVisible();
    await expect(panel.getByTestId("hn-signal")).toHaveCount(0);
  });

  for (const [label, status, body] of [["login required", 401, { message: "실제 API 분석은 로그인 후 사용할 수 있습니다." }], ["server error", 500, { message: "세부 현상 발견에 실패했습니다." }], ["malformed response", 200, { ok: true }]] as const) {
    test(`${label}: shows an error, saves nothing, keeps the previous result and the rest of Overview`, async ({ page }) => {
      await mockDiscover(page, body, status);
      await page.goto("/");
      await page.evaluate((report) => { localStorage.clear(); localStorage.setItem("trend-radar-discoveries", JSON.stringify([report])); }, savedReport(data.pepero, new Date().toISOString()));
      await page.reload();
      const panel = await discover(page, "메이크업");
      await expect(panel.getByRole("alert")).toContainText(status === 200 ? "형식이 올바르지 않습니다" : body.message as string);
      await expect(panel.getByRole("alert")).toContainText("이전에 저장된 결과");
      await expect(panel.getByTestId("hn-signal")).toHaveCount(data.pepero.signals.length);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-discoveries") ?? "[]").length)).toBe(1);
      await expect(page.getByTestId("now-2030")).toBeVisible();
    });
  }
});

test.describe("T4 WHAT'S HAPPENING NOW? — passing the phenomenon on", () => {
  test("EXPLORE WHY carries phenomenon ID, core behavior, window and evidence IDs, not only a keyword", async ({ page }) => {
    await mockDiscover(page);
    await fresh(page);
    const panel = await discover(page, "빼빼로데이");
    const href = await panel.getByTestId("hn-signal").first().getByRole("link", { name: "EXPLORE WHY" }).getAttribute("href");
    expect(href).toMatch(/^\/trends\/live-[^/]+\/why\?/);
    const context = phenomenonFromQuery(new URLSearchParams(href!.split("?")[1]));
    const signal = data.pepero.signals[0];
    expect(context).toMatchObject({ keyword: "빼빼로데이", title: signal.title, coreBehavior: signal.audienceBehavior, window: data.pepero.window, evidenceIds: signal.evidenceIds, verificationStatus: displayStatusOf(signal.verificationStatus), independentSources: signal.independentSources });
    expect(context!.phenomenonId).toMatch(/^disc-.+~sig-1$/);
  });

  test("SAVE TO WORKSPACE stores the phenomenon with its context and cited evidence; Workspace lists and reopens it", async ({ page }) => {
    await mockDiscover(page);
    await fresh(page);
    const panel = await discover(page, "빼빼로데이");
    const signal = data.pepero.signals[0];
    const card = panel.getByTestId("hn-signal").first();
    await card.getByRole("button", { name: "SAVE TO WORKSPACE" }).click();
    await expect(card.getByRole("button", { name: "SAVED" })).toHaveAttribute("aria-pressed", "true");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-workspace") ?? "[]"));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ type: "insight", mode: "live", title: signal.title, payload: { kind: "phenomenon", context: { title: signal.title, evidenceIds: signal.evidenceIds, coreBehavior: signal.audienceBehavior } } });
    expect(stored[0].payload.evidence.map((item: EvidenceItem) => item.id).sort()).toEqual([...signal.evidenceIds].sort());
    await page.goto("/workspace");
    const saved = page.getByTestId("saved-item").filter({ hasText: signal.title });
    await expect(saved).toContainText("PHENOMENON · OBSERVED");
    await expect(saved.getByTestId("saved-phenomenon")).toContainText(signal.evidenceIds.join(", "));
    await expect(saved.getByRole("link", { name: /이 현상 WHY 분석/ })).toHaveAttribute("href", /\/why\?phenomenon=disc-/);
    // 다시 누르면 저장을 취소한다.
    await page.goto("/");
    await page.getByTestId("hn-signal").first().getByRole("button", { name: "SAVED" }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-workspace") ?? "[]").length)).toBe(0);
  });

  test("CREATE CONTENT opens PRODUCTION with the phenomenon context; the same phenomenon reopens the same project", async ({ page }) => {
    await mockDiscover(page);
    await fresh(page);
    const panel = await discover(page, "빼빼로데이");
    const signal = data.pepero.signals[0];
    await panel.getByTestId("hn-signal").first().getByRole("link", { name: "CREATE CONTENT" }).click();
    await expect(page).toHaveURL(/\/studio\?project=/);
    await expect(page.getByTestId("studio-tab-production")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("custom-topic")).toHaveValue(signal.title);
    const banner = page.getByTestId("studio-phenomenon");
    await expect(banner).toContainText(signal.title);
    await expect(banner).toContainText(signal.audienceBehavior);
    await expect(banner).toContainText(`${data.pepero.window.from}~${data.pepero.window.to}`);
    await expect(banner).toContainText(signal.evidenceIds.join(", "));
    const firstUrl = page.url();
    await page.goto("/");
    await page.getByTestId("hn-signal").first().getByRole("link", { name: "CREATE CONTENT" }).click();
    await expect(page).toHaveURL(/\/studio\?project=/);
    expect(page.url()).toBe(firstUrl);
  });

  test("Studio rebuilds the context from the link alone when this browser has no discovery result", async ({ page }) => {
    const report = savedReport(data.roblox, "2026-11-02T00:00:00.000Z");
    const signal = data.roblox.signals[4];
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.goto(`/studio?${phenomenonQuery(phenomenonContextOf(report.id, report, signal))}`);
    await expect(page.getByTestId("custom-topic")).toHaveValue(signal.title);
    await expect(page.getByTestId("studio-phenomenon")).toContainText(signal.evidenceIds.join(", "));
  });

  test("a phenomenon link without context explains what is missing instead of opening an empty project", async ({ page }) => {
    await page.goto("/studio?phenomenon=disc-none~sig-1");
    await expect(page.getByText(/선택한 현상을 이 브라우저에서 찾지 못했습니다/)).toBeVisible();
  });

  test("a user-entered phenomenon goes to WHY marked as custom", async ({ page }) => {
    const panel = await fresh(page);
    await panel.getByLabel("Custom phenomenon").fill("로블록스 메이크업 따라 하기");
    await expect(panel.getByTestId("hn-custom-why")).toHaveAttribute("href", /^\/trends\/live-.+\/why\?phenomenon=custom$/);
  });

  test("link context parsing rejects incomplete or malformed values", () => {
    expect(phenomenonFromQuery(new URLSearchParams("phenomenon=custom&kw=a&title=b&from=2026-10-01&to=2026-10-30&days=30"))).toBeNull();
    expect(phenomenonFromQuery(new URLSearchParams("phenomenon=x&kw=a&title=b&from=2026-10&to=2026-10-30&days=30"))).toBeNull();
    expect(phenomenonFromQuery(new URLSearchParams("phenomenon=x&kw=a&title=b&from=2026-10-01&to=2026-10-30&days=30&ev=YT-01,<script>,WEB-02&status=VIRAL"))).toMatchObject({ evidenceIds: ["YT-01", "WEB-02"], verificationStatus: "EMERGING" });
  });
});
