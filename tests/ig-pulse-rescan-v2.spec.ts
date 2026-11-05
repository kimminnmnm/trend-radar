import { expect, test, type Page } from "@playwright/test";
import Module from "node:module";
import path from "node:path";
import fixture from "./fixtures/ig-pulse.json";
import type { IgPulseItem, IgPulseReport } from "../lib/types";

/*
 * 2026-11 INSTAGRAM PULSE RESCAN 재설계.
 * - 서버 로직(lib/ig-pulse scanIgPulse): fetch를 가짜로 바꿔 Meta·OpenAI에 실제로 요청하지 않는다. 호출한 주소를 세어 한도·중복·순서를 확인한다.
 * - 화면: /api/trends/instagram을 가로채 진행 단계(NDJSON)와 결과를 돌려준다.
 */

/* ---------- 서버 로직 ---------- */
type Candidate = { hashtag: string; keyword: string; category: string; summary: string; sourceUrls: string[] };
function fakeApis(options: { recent: string[]; candidates?: Candidate[] }) {
  const calls = { openai: 0, search: [] as string[], media: [] as string[] };
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  const now = Date.now();
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "api.openai.com") {
      calls.openai += 1;
      const candidates = options.candidates ?? [];
      return json({ output_text: JSON.stringify({ candidates }), output: [{ action: { sources: candidates.flatMap((item) => item.sourceUrls.map((source) => ({ url: source, title: item.keyword }))) } }] });
    }
    if (url.pathname.endsWith("/recently_searched_hashtags")) return json({ data: options.recent.map((name) => ({ id: `h-${name}`, name })) });
    if (url.pathname.endsWith("/ig_hashtag_search")) { const q = url.searchParams.get("q")!; calls.search.push(q); return json({ data: [{ id: `h-${q}` }] }); }
    if (url.pathname.endsWith("/recent_media")) {
      calls.media.push(decodeURIComponent(url.pathname.split("/").at(-2)!));
      return json({ data: [1, 2, 3].map((i) => ({ id: `${url.pathname}-${i}`, permalink: `https://www.instagram.com/p/x${i}/`, timestamp: new Date(now - i * 36e5).toISOString() })) });
    }
    throw new Error(`unexpected request ${url.href}`);
  }) as typeof fetch;
  return calls;
}
const candidate = (tag: string): Candidate => ({ hashtag: tag, keyword: tag, category: "food", summary: `${tag} 화제`, sourceUrls: [`https://news.example.com/${encodeURIComponent(tag)}`] });

test.describe("RESCAN server logic (no real API)", () => {
  let scanIgPulse: typeof import("../lib/ig-pulse").scanIgPulse;
  let account = 0;
  const original = globalThis.fetch;
  test.beforeAll(async () => {
    const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
    const resolve = M._resolveFilename;
    M._resolveFilename = function (request: string, ...rest: unknown[]) { return request === "server-only" ? path.resolve(__dirname, "fixtures/empty-module.cjs") : resolve.call(this, request, ...rest); };
    Object.assign(process.env, { META_ACCESS_TOKEN: "test-token", OPENAI_API_KEY: "test-key" });
    ({ scanIgPulse } = await import("../lib/ig-pulse"));
  });
  // 계정 ID마다 '최근 조회 태그' 캐시가 따로라 테스트마다 새 계정을 쓴다.
  test.beforeEach(() => { account += 1; process.env.META_IG_USER_ID = `ig-test-${Date.now()}-${account}`; });
  test.afterAll(() => { globalThis.fetch = original; });

  test("2·5. three new candidates are measured before tracked tags; a candidate that duplicates a tracked tag (or differs only in case) is measured once and does not use quota", async () => {
    const calls = fakeApis({ recent: ["치이카와", "아이브"], candidates: [candidate("두바이쫀득쿠키"), candidate("치이카와"), candidate("말차라떼"), candidate("두바이쫀득쿠키"), candidate("요거트아이스크림")] });
    const events: string[] = [];
    const report = await scanIgPulse({ track: ["치이카와", "아이브"], add: [], discover: true, allowNew: true }, (event) => events.push(event.stage));
    expect(calls.openai).toBe(1);
    expect(calls.media.slice(0, 3)).toEqual(["h-두바이쫀득쿠키", "h-말차라떼", "h-요거트아이스크림"]); // 신규 후보를 먼저 잰다
    expect(report.items.map((item) => item.tag).sort()).toEqual(["두바이쫀득쿠키", "말차라떼", "아이브", "요거트아이스크림", "치이카와"]);
    expect(report.items.find((item) => item.tag === "치이카와")?.origin).toBe("tracked"); // 후보와 겹쳐도 추적 태그
    expect(new Set(report.items.map((item) => item.tag)).size).toBe(report.items.length); // 중복 없음
    expect(calls.search).toEqual(["두바이쫀득쿠키", "말차라떼", "요거트아이스크림"]); // 신규만 검색(한도 사용), 치이카와는 기존 ID로
    expect(report.items.filter((item) => item.usedQuota).map((item) => item.tag)).toEqual(["두바이쫀득쿠키", "말차라떼", "요거트아이스크림"]);
    expect(report.scan).toMatchObject({ mode: "discover", discovered: 5, newCandidates: 3, knownCandidates: 1, measured: 5, added: 3, deferredNew: 0 });
    expect(events[0]).toBe("discover");
    expect(events.at(-1)).toBe("rank");
    expect(events.filter((stage) => stage === "measure")).toHaveLength(5);
  });

  test("4. not enough weekly quota: only what fits is searched; the rest is deferred with its candidate info and never called or invented", async () => {
    // 30개 한도 - 예비 6개 = 24. 이미 23개를 썼으면 신규는 1개만.
    const recent = Array.from({ length: 23 }, (_, i) => `기존태그${i}`);
    const calls = fakeApis({ recent, candidates: [candidate("새태그가"), candidate("새태그나"), candidate("새태그다")] });
    const report = await scanIgPulse({ track: [], add: [], discover: true, allowNew: true });
    expect(calls.search).toEqual(["새태그가"]);
    expect(report.items.map((item) => item.tag)).toEqual(["새태그가"]);
    expect(report.deferred.map((item) => item.tag)).toEqual(["새태그나", "새태그다"]);
    expect(report.deferred.every((item) => item.candidate?.sources?.length && /주간 해시태그 한도/.test(item.reason))).toBe(true);
    expect(report.scan).toMatchObject({ newCandidates: 3, measured: 1, added: 1, deferredNew: 2 });
  });

  test("queued candidates from the last scan go first; more than 4 new tags per scan wait for the next scan", async () => {
    const calls = fakeApis({ recent: [], candidates: ["가", "나", "다", "라"].map((t) => candidate(`후보${t}`)) });
    const report = await scanIgPulse({ track: [], add: [], discover: true, allowNew: true, queue: [{ tag: "대기태그", keyword: "대기", sources: [{ url: "https://news.example.com/q" }] }] });
    expect(calls.search).toEqual(["대기태그", "후보가", "후보나", "후보다"]);
    expect(report.deferred).toEqual([expect.objectContaining({ tag: "후보라", reason: "새 태그는 스캔당 최대 4개", candidate: expect.objectContaining({ tag: "후보라" }) })]);
  });

  test("3. zero new candidates: tracked tags are still re-measured and the summary says 0", async () => {
    const calls = fakeApis({ recent: ["치이카와"], candidates: [] });
    const report = await scanIgPulse({ track: ["치이카와"], add: [], discover: true, allowNew: true });
    expect(calls.openai).toBe(1);
    expect(calls.search).toEqual([]);
    expect(report.items.map((item) => item.tag)).toEqual(["치이카와"]);
    expect(report.scan).toMatchObject({ mode: "discover", newCandidates: 0, measured: 1, added: 0 });
  });

  test("6. approval OFF: no web search, the queue is ignored, only tracked tags are re-measured with their saved IDs", async () => {
    const calls = fakeApis({ recent: ["치이카와", "아이브"], candidates: [candidate("두바이쫀득쿠키")] });
    const report = await scanIgPulse({ track: ["치이카와", "아이브"], add: ["새태그"], discover: true, allowNew: false, queue: [{ tag: "대기태그" }] });
    expect(calls.openai).toBe(0);
    expect(calls.search).toEqual([]);
    expect(report.items.map((item) => item.tag).sort()).toEqual(["아이브", "치이카와"]);
    expect(report.deferred).toEqual([{ tag: "새태그", reason: "신규 해시태그 검색 승인이 필요합니다" }]);
    expect(report.scan).toMatchObject({ mode: "refresh", discovered: 0, newCandidates: 0, added: 0 });
  });
});

test("the streaming RESCAN request is validated and access-checked before any external call (plain JSON errors, not a stream)", async ({ request }) => {
  const invalid = await request.post("/api/trends/instagram", { data: { stream: true, allowNew: true, queue: [{ tag: "x", sources: [{ url: "javascript:alert(1)" }] }] } });
  expect(invalid.status()).toBe(400);
  const signedOut = await request.post("/api/trends/instagram", { data: { stream: true, discover: true, allowNew: true, track: ["러닝"], queue: [{ tag: "두바이쫀득쿠키" }] } });
  expect(signedOut.status()).toBe(401);
  expect(signedOut.headers()["content-type"]).toContain("application/json");
});

/* ---------- 화면 ---------- */
const HOUR = 36e5;
const base = fixture.second.items[0] as unknown as IgPulseItem;
const item = (tag: string, perHour: number, at: string, extra: Partial<IgPulseItem> = {}): IgPulseItem => ({ ...base, tag, hashtagId: `h-${tag}`, perHour, collectedAt: at, complete: true, rateBasis: "24h-full", sampled: Math.round(perHour * 24), posts24h: Math.round(perHour * 24), origin: "tracked", sources: [], usedQuota: false, searchKind: "refresh", found: true, ...extra });
const T0 = Date.parse("2026-11-04T09:00:00.000Z");
const at = (hours: number) => new Date(T0 + hours * HOUR).toISOString();
const report = (generatedAt: string, items: IgPulseItem[], extra: Partial<IgPulseReport> = {}): IgPulseReport => ({ ...(fixture.second as unknown as IgPulseReport), id: undefined, generatedAt, items, deferred: [], failed: [], ...extra });
const OLD = report(at(0), [item("치이카와", 10, at(0)), item("아이브", 8, at(0))]);
const discovered = (tag: string, perHour: number, when: string) => item(tag, perHour, when, { origin: "discovered", usedQuota: true, searchKind: "new", keyword: tag, category: "food", sources: [{ url: `https://news.example.com/${encodeURIComponent(tag)}` }] });
const NEW = report(at(26), [item("치이카와", 15, at(26)), discovered("두바이쫀득쿠키", 30, at(26)), discovered("말차라떼", 5, at(26)), discovered("요거트아이스크림", 2, at(26))],
  { scan: { mode: "discover", discovered: 4, newCandidates: 3, knownCandidates: 1, measured: 4, added: 3, deferredNew: 0 } });
const ndjson = (...lines: unknown[]) => lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
const progress = [{ type: "progress", stage: "discover" }, { type: "progress", stage: "measure", done: 0, total: 4 }, { type: "progress", stage: "rank" }];

async function seed(page: Page, reports: IgPulseReport[], tracked: string[], queue: unknown[] = []) {
  await page.goto("/settings");
  await page.evaluate(({ reports, tracked, queue }) => {
    localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1");
    localStorage.setItem("trend-radar-ig-pulse", JSON.stringify(reports)); localStorage.setItem("trend-radar-ig-track", JSON.stringify(tracked)); localStorage.setItem("trend-radar-ig-queue", JSON.stringify(queue));
  }, { reports, tracked, queue });
  await page.goto("/");
}
const stored = (page: Page) => page.evaluate(() => ({
  reports: JSON.parse(localStorage.getItem("trend-radar-ig-pulse") ?? "[]") as IgPulseReport[],
  queue: JSON.parse(localStorage.getItem("trend-radar-ig-queue") ?? "[]") as Array<{ tag: string }>,
}));
const tags = (page: Page, list: "activity" | "rising") => page.getByTestId("ig-pulse").locator(`.${list} li .kw b`).allTextContents();

test.describe("RESCAN screen", () => {
  test("1·2·7·8. approval ON → RESCAN shows the 4 stages, replaces both charts with this scan (3 new tags marked NEW), reports the summary, survives a reload and keeps the old report", async ({ page }) => {
    const sent: Array<Record<string, unknown>> = [];
    await page.route("**/api/trends/instagram", (route) => { sent.push(route.request().postDataJSON()); return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: ndjson(...progress, { type: "result", mode: "live", cached: false, report: NEW }) }); });
    await seed(page, [OLD], ["치이카와", "아이브"]);
    const board = page.getByTestId("ig-pulse");
    expect(await tags(page, "activity")).toEqual(["#치이카와", "#아이브"]);
    await board.getByLabel("신규 해시태그 검색 승인").check();
    await expect(board.getByTestId("rescan-cost")).toContainText("웹 후보 검색 1회");
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByTestId("ig-pulse-stages").locator("li.done")).toHaveCount(4);
    expect(sent[0]).toMatchObject({ discover: true, allowNew: true, stream: true, track: ["치이카와", "아이브"], queue: [] });
    const check = async () => {
      // 많이 올라오는 순: 이번 스캔에서 잰 태그만(이번에 재지 않은 #아이브는 섞지 않음)
      expect(await tags(page, "activity")).toEqual(["#두바이쫀득쿠키", "#치이카와", "#말차라떼", "#요거트아이스크림"]);
      // 오르는 순: 이전 측정이 있는 #치이카와는 변화율, 처음 잰 3개는 NEW(상승률 없음)
      expect(await tags(page, "rising")).toEqual(["#치이카와", "#두바이쫀득쿠키", "#말차라떼", "#요거트아이스크림"]);
      await expect(board.locator(".rising li .chg")).toHaveText(["▲ 50%", "NEW", "NEW", "NEW"]);
      const summary = board.getByTestId("ig-pulse-scan-summary");
      await expect(summary.getByTestId("scan-new-candidates")).toHaveText("3개");
      await expect(summary.getByTestId("scan-measured")).toHaveText("4개");
      await expect(summary.getByTestId("scan-added")).toHaveText("3개");
      await expect(summary.getByTestId("scan-queued")).toHaveText("0개");
      await expect(board.getByTestId("ig-pulse-previous")).toHaveCount(0);
    };
    await check();
    await expect(board.getByTestId("ig-pulse-notice")).toContainText("새 측정 4개로 차트를 바꿨습니다");
    await expect(board.getByLabel("신규 해시태그 검색 승인")).not.toBeChecked(); // 승인은 스캔마다 다시
    await page.reload();
    await check();
    const after = await stored(page);
    expect(after.reports.map((saved) => saved.generatedAt)).toEqual([NEW.generatedAt, OLD.generatedAt]); // 과거 기록 유지
    await board.getByTestId("ig-pulse-history").locator("summary").click();
    await expect(board.getByTestId("ig-pulse-history").locator("li")).toHaveCount(2);
  });

  test("4. candidates over the quota wait in the next-scan queue (not in the chart); the next approved RESCAN sends them first and then clears them", async ({ page }) => {
    const first = report(at(26), [discovered("두바이쫀득쿠키", 30, at(26))], {
      deferred: ["말차라떼", "요거트아이스크림"].map((tag) => ({ tag, reason: "주간 해시태그 한도(30개 중 예비 6개 제외) 도달", candidate: { tag, keyword: tag, category: "food", summary: `${tag} 화제`, sources: [{ url: `https://news.example.com/${encodeURIComponent(tag)}` }] } })),
      scan: { mode: "discover", discovered: 3, newCandidates: 3, knownCandidates: 0, measured: 1, added: 1, deferredNew: 2 },
    });
    const second = report(at(28), [discovered("말차라떼", 5, at(28)), discovered("요거트아이스크림", 2, at(28))], { scan: { mode: "discover", discovered: 0, newCandidates: 2, knownCandidates: 0, measured: 2, added: 2, deferredNew: 0 } });
    const sent: Array<{ queue: Array<{ tag: string }> }> = [];
    const responses = [first, second];
    await page.route("**/api/trends/instagram", (route) => { sent.push(route.request().postDataJSON()); return route.fulfill({ contentType: "application/x-ndjson", body: ndjson({ type: "result", cached: false, report: responses[sent.length - 1] }) }); });
    await seed(page, [OLD], ["치이카와", "아이브"]);
    const board = page.getByTestId("ig-pulse");
    await board.getByLabel("신규 해시태그 검색 승인").check();
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByTestId("scan-queued")).toHaveText("2개");
    await expect(board.getByTestId("ig-pulse-queue")).toContainText("#말차라떼, #요거트아이스크림");
    expect(await tags(page, "activity")).toEqual(["#두바이쫀득쿠키"]); // 재지 않은 후보는 차트에 없다
    expect((await stored(page)).queue.map((entry) => entry.tag)).toEqual(["말차라떼", "요거트아이스크림"]);

    await board.getByLabel("신규 해시태그 검색 승인").check();
    await expect(board.getByTestId("rescan-cost")).toContainText("대기 2개 먼저");
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByTestId("scan-queued")).toHaveText("0개");
    expect(sent[1].queue.map((entry) => entry.tag)).toEqual(["말차라떼", "요거트아이스크림"]);
    expect((await stored(page)).queue).toEqual([]);
    await expect(board.getByTestId("ig-pulse-queue")).toHaveCount(0);
  });

  test("3. zero new candidates: the tracked tags measured now become the chart and the notice says no new candidate was found", async ({ page }) => {
    const refreshOnly = report(at(26), [item("치이카와", 12, at(26)), item("아이브", 8, at(26))], { scan: { mode: "discover", discovered: 0, newCandidates: 0, knownCandidates: 0, measured: 2, added: 0, deferredNew: 0 } });
    await page.route("**/api/trends/instagram", (route) => route.fulfill({ contentType: "application/x-ndjson", body: ndjson({ type: "result", cached: false, report: refreshOnly }) }));
    await seed(page, [OLD], ["치이카와", "아이브"]);
    const board = page.getByTestId("ig-pulse");
    await board.getByLabel("신규 해시태그 검색 승인").check();
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByTestId("ig-pulse-notice")).toContainText("새 후보가 없어 이미 측정한 태그만 다시 쟀습니다");
    await expect(board.getByTestId("scan-new-candidates")).toHaveText("0개");
    await expect(board.locator(".rising li .chg")).toHaveText(["▲ 20%", "■ 0%"]);
  });

  test("6. approval OFF: only tracked tags are re-measured; no discovery is requested and the screen says discovery needs approval", async ({ page }) => {
    const sent: Array<Record<string, unknown>> = [];
    const refresh = report(at(26), [item("치이카와", 12, at(26)), item("아이브", 8, at(26))], { scan: { mode: "refresh", discovered: 0, newCandidates: 0, knownCandidates: 0, measured: 2, added: 0, deferredNew: 0 } });
    await page.route("**/api/trends/instagram", (route) => { sent.push(route.request().postDataJSON()); return route.fulfill({ contentType: "application/x-ndjson", body: ndjson({ type: "progress", stage: "measure", done: 0, total: 2 }, { type: "result", cached: false, report: refresh }) }); });
    await seed(page, [OLD], ["치이카와", "아이브"], [{ tag: "대기태그", queuedAt: at(1), reason: "x" }]);
    const board = page.getByTestId("ig-pulse");
    await expect(board.getByTestId("rescan-cost")).toContainText("새 후보 탐색은 승인을 켜야 실행");
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByTestId("ig-pulse-notice")).toContainText("신규 후보 탐색은 '신규 해시태그 검색 승인'을 켠 RESCAN에서만 실행됩니다");
    expect(sent[0]).toMatchObject({ discover: false, allowNew: false, queue: [] });
    await expect(board.getByTestId("ig-pulse-stages").locator("li").first()).toContainText("건너뜀");
    await expect(board.getByTestId("scan-new-candidates")).toHaveText("탐색 안 함");
    expect((await stored(page)).queue.map((entry) => entry.tag)).toEqual(["대기태그"]); // 대기열은 그대로
  });

  test("9. an error during the scan (after progress started) keeps the previous chart, reports and queue", async ({ page }) => {
    await page.route("**/api/trends/instagram", (route) => route.fulfill({ contentType: "application/x-ndjson", body: ndjson(...progress.slice(0, 2), { type: "error", status: 429, error: "META_RATE_LIMITED", message: "Meta API 호출 한도에 도달했습니다." }) }));
    await seed(page, [OLD], ["치이카와", "아이브"], [{ tag: "대기태그", queuedAt: at(1), reason: "x" }]);
    const board = page.getByTestId("ig-pulse");
    await board.getByLabel("신규 해시태그 검색 승인").check();
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByTestId("ig-pulse-error")).toContainText("Meta API 호출 한도에 도달했습니다");
    await expect(board.getByTestId("ig-pulse-error")).toContainText("이전 측정 결과는 유지됩니다");
    expect(await tags(page, "activity")).toEqual(["#치이카와", "#아이브"]);
    await expect(board.getByTestId("ig-pulse-stages")).toHaveCount(0);
    const after = await stored(page);
    expect(after.reports).toHaveLength(1);
    expect(after.queue.map((entry) => entry.tag)).toEqual(["대기태그"]);
  });

  test("RESCAN with approval ON works even with nothing tracked (it discovers); with approval OFF and nothing tracked no call is made", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/trends/instagram", (route) => { calls += 1; return route.fulfill({ contentType: "application/x-ndjson", body: ndjson({ type: "result", cached: false, report: NEW }) }); });
    await seed(page, [OLD], []);
    const board = page.getByTestId("ig-pulse");
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByTestId("ig-pulse-error")).toContainText("'신규 해시태그 검색 승인'을 켜면 새 후보를 찾아 측정합니다");
    expect(calls).toBe(0);
    await board.getByLabel("신규 해시태그 검색 승인").check();
    await board.getByRole("button", { name: /RESCAN/ }).click();
    await expect(board.getByTestId("ig-pulse-notice")).toBeVisible();
    expect(calls).toBe(1);
  });
});
