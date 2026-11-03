import { expect, test, type Page } from "@playwright/test";
import discovery from "./fixtures/discovery-t1-t3.json";
import recorded from "./fixtures/why-phenomenon-t5.json";
import { phenomenonContextOf, phenomenonFromQuery, phenomenonQuery, phenomenonTrendId, reusePhenomenonEvidence, type DiscoveryReport, type DiscoverySignal, type PhenomenonContext } from "../lib/discovery";
import { dedupeEvidence, normalizeEvidenceUrl } from "../lib/evidence-quality";
import { liveTrendId, trendPath } from "../lib/live-trend";
import { trendAnalysisSchema, type EvidenceItem, type TrendAnalysis } from "../lib/schemas";

/*
 * T5 Context-Aware WHY. 픽스처 why-phenomenon-t5.json: 2026-11-02 /api/analyze 현상 모드 실측(A·B·C).
 * UI 테스트는 그 응답을 그대로 돌려주는 모의 API로 실행한다(외부 API 호출 없음).
 * 서버의 주제 고정 검사(checkPhenomenonFocus)는 server-only 모듈이라 같은 규칙을 실측 결과로 확인한다.
 */
type Run = { request: { phenomenon: PhenomenonContext; phenomenonEvidence: EvidenceItem[]; includeYouTube: boolean; includeWeb: boolean; includeInstagram: boolean }; response: { report: TrendAnalysis; evidence: EvidenceItem[]; promptVersion: string; validation: { removedEvidenceIds: string[] } } & Record<string, unknown> };
const runs = recorded as unknown as Record<"A" | "B" | "C", Run>;
const { A, B, C } = runs;
const text = (report: TrendAnalysis) => [report.what?.summary, report.overview?.summary, report.phenomenon?.who.summary, report.phenomenon?.how.summary, report.context?.background.summary].join(" ");
const cited = (report: TrendAnalysis) => {
  const ids = new Set<string>();
  const walk = (value: unknown, key = ""): void => {
    if (key === "context" && value && typeof value === "object" && "phenomenonId" in value) return; // 맥락의 발견 단계 ID는 인용이 아니다
    if (Array.isArray(value)) value.forEach((item) => walk(item));
    else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => { if (k === "evidenceIds" && Array.isArray(v)) v.forEach((id) => ids.add(id)); else walk(v, k); });
  };
  walk(report);
  return [...ids];
};

test.describe("T5 recorded analyses — the selected phenomenon itself is analyzed", () => {
  test("A (메이크업 → 가상 메이크업 현실 재현) stays on recreating the look in real life, not in-game item use or makeup history", () => {
    const report = A.response.report;
    expect(A.response.promptVersion).toBe("why-phenomenon-v1");
    expect(report.phenomenon?.context).toMatchObject({ keyword: "메이크업", direction: "Virtual → Real", verificationStatus: "EMERGING" });
    expect(report.what!.summary).toMatch(/현실/);
    expect(report.overview!.summary).toMatch(/현실/);
    expect(text(report)).not.toMatch(/메이크업의 역사|화장의 역사|기원은|유래는/);
    expect(report.what!.summary).not.toMatch(/아이템을 (사용|착용)하는 방법|게임 안에서 (립스틱|블러셔)를 고르/);
    expect(report.origin.evidenceIds).toEqual([]);
    expect(report.phenomenon!.checks).toMatchObject({ anchored: true, warnings: [] });
  });

  test("B (로블록스 → 게임 안 메이크업 룩 만들기) is analyzed as a different phenomenon from A", () => {
    const a = A.response.report, b = B.response.report;
    expect(b.phenomenon?.context).toMatchObject({ keyword: "로블록스", direction: "A 안에서 B", verificationStatus: "OBSERVED" });
    expect(b.what!.summary).toMatch(/게임|플레이어/);
    expect(b.what!.summary).not.toMatch(/현실(에서|로)? (재현|따라)/);
    expect(a.phenomenon!.context.phenomenonId).not.toBe(b.phenomenon!.context.phenomenonId);
    expect(phenomenonTrendId(a.phenomenon!.context)).not.toBe(phenomenonTrendId(b.phenomenon!.context));
    expect(a.what!.summary).not.toBe(b.what!.summary);
    expect(b.phenomenon!.checks).toMatchObject({ anchored: true, warnings: [] });
  });

  test("C (빼빼로데이 → 먼작귀 빼빼로 만들기) describes the making behavior, not Pepero Day's origin", () => {
    const report = C.response.report;
    expect(report.phenomenon?.context).toMatchObject({ keyword: "빼빼로데이", verificationStatus: "OBSERVED" });
    expect(text(report)).toMatch(/치이카와|먼작귀/);
    expect(text(report)).toMatch(/만들/);
    expect(text(report)).not.toMatch(/빼빼로데이의 (유래|기원|역사)|1990년대|부산/);
    // 모델이 없는 NAVER ID를 인용한 것은 서버가 제거했다.
    expect(C.response.validation.removedEvidenceIds).toEqual(["NAVER-02", "NAVER-03"]);
  });

  test("every cited id exists in that run's ledger; reused discovery evidence is renumbered D-xx", () => {
    for (const run of [A, B, C]) {
      const ledger = new Set(run.response.evidence.map((item) => item.id));
      for (const id of cited(run.response.report)) expect(ledger.has(id), id).toBe(true);
      expect(run.response.report.phenomenon!.reusedEvidenceIds).toEqual(run.request.phenomenonEvidence.map((item) => `D-${item.id}`));
    }
  });

  test("extra searching happens only when discovery evidence is thin; Instagram is never searched for a phenomenon", () => {
    expect(A.request).toMatchObject({ includeYouTube: true, includeWeb: true, includeInstagram: false });
    expect(B.request).toMatchObject({ includeYouTube: false, includeWeb: false, includeInstagram: false });
    expect(B.response.youtube).toMatchObject({ status: "skipped" });
    expect((B.response.web as { status: string }).status).toBe("skipped");
    expect(B.response.evidence.filter((item) => item.id.startsWith("D-")).length).toBe(9);
    expect(A.response.evidence.filter((item) => /^YT-/.test(item.id)).length).toBeGreaterThan(1);
  });

  test("EMERGING stays EMERGING: no popularity wording for limited signals", () => {
    expect(A.response.report.phenomenon!.context.verificationStatus).toBe("EMERGING");
    expect(`${A.response.report.what!.summary} ${A.response.report.overview!.summary}`).not.toMatch(/급상승|바이럴|대세|인기를 끌/);
  });
});

test.describe("T5 rules (deterministic)", () => {
  test("only the phenomenon's own discovery evidence is reused, renumbered so it cannot collide with new YT/WEB ids", () => {
    const ledger = discovery.connections.ledger as unknown as EvidenceItem[];
    const reused = reusePhenomenonEvidence({ evidenceIds: ["YT-04", "NAVER-01", "NOPE"] }, [...ledger, { ...ledger[0], id: "NAVER-01", kind: "naver_series" }]);
    expect(reused.map((item) => item.id)).toEqual(["D-YT-04"]);
    expect(reused[0].excerpt).toContain("재사용");
  });

  test("evidence de-duplication keeps different YouTube videos and still drops tracking-only duplicates", () => {
    expect(normalizeEvidenceUrl("https://www.youtube.com/watch?v=AbC123xyz_0&si=track")).toBe("www.youtube.com/watch?v=AbC123xyz_0");
    const item = (id: string, url: string): EvidenceItem => ({ id, kind: "youtube_video", title: id, source: "s", url, collectedAt: "x", excerpt: "" });
    const kept = dedupeEvidence([item("D-YT-04", "https://www.youtube.com/watch?v=aaa"), item("YT-01", "https://www.youtube.com/watch?v=bbb"), item("YT-02", "https://www.youtube.com/watch?v=aaa&feature=share")]);
    expect(kept.map((entry) => entry.id)).toEqual(["D-YT-04", "YT-01"]);
  });

  test("phenomenon analyses get their own storage id, separate from a keyword analysis with the same words", () => {
    const context = A.response.report.phenomenon!.context;
    expect(phenomenonTrendId(context)).toMatch(/^live-ph-[0-9a-z]+$/);
    expect(phenomenonTrendId(context)).not.toBe(liveTrendId(context.title));
    expect(phenomenonTrendId(context)).not.toBe(liveTrendId(context.keyword));
  });

  test("the link carries every handoff field and restores the same context", () => {
    for (const run of [A, B, C]) {
      const context = run.request.phenomenon;
      expect(phenomenonFromQuery(new URLSearchParams(phenomenonQuery(context)))).toEqual(context);
    }
    expect(phenomenonFromQuery(new URLSearchParams("phenomenon=custom&kw=a&title=b&from=2026-10-01&to=2026-10-30&days=30"))).toBeNull();
  });

  test("the phenomenon section survives the stored report schema (used by browser and cloud restore)", () => {
    const parsed = trendAnalysisSchema.parse(A.response.report);
    expect(parsed.phenomenon?.context.title).toBe(A.request.phenomenon.title);
    expect(parsed.phenomenon?.who.summary).toBe(A.response.report.phenomenon!.who.summary);
  });

  test("invalid phenomenon input is rejected before any paid access check", async ({ request }) => {
    const response = await request.post("/api/analyze", { data: { trend: "x", phenomenon: { phenomenonId: "", keyword: "", title: "", window: { days: 0, from: "x", to: "y" }, verificationStatus: "VIRAL" } } });
    expect(response.status()).toBe(400);
  });
});

async function mockAnalyze(page: Page, body: unknown) {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/analyze", async (route) => { requests.push(route.request().postDataJSON()); await route.fulfill({ json: body }); });
  return requests;
}
const whyHref = (context: PhenomenonContext) => `${trendPath(phenomenonTrendId(context), "why")}?${phenomenonQuery(context)}`;
async function clean(page: Page) { await page.goto("/"); await page.evaluate(() => localStorage.clear()); }

test.describe("T5 WHY screen", () => {
  test("A: the banner shows the selected phenomenon and the request carries the full context, not just a keyword", async ({ page }) => {
    const requests = await mockAnalyze(page, A.response);
    await clean(page);
    const context = A.request.phenomenon;
    await page.goto(whyHref(context));
    const banner = page.getByTestId("why-phenomenon");
    await expect(banner).toContainText("ANALYZING PHENOMENON");
    await expect(banner.locator("h3")).toHaveText(context.title);
    await expect(banner).toContainText("Parent Keyword: 메이크업");
    await expect(banner).toContainText("Evidence Status: EMERGING SIGNAL");
    await expect(banner).toContainText("Virtual → Real");
    await expect(page.locator("h1")).toContainText(context.title);
    await page.getByRole("button", { name: /Run live analysis/ }).click();
    await expect(page.getByTestId("why-who")).toContainText(A.response.report.phenomenon!.who.summary.slice(0, 20));
    await expect(page.getByTestId("why-how")).toBeVisible();
    expect(requests).toHaveLength(1);
    const body = requests[0] as { trend: string; phenomenon: PhenomenonContext; includeInstagram: boolean; includeYouTube: boolean };
    expect(body.trend).toBe(context.title);
    expect(body.phenomenon).toEqual(context);
    expect(body.includeInstagram).toBe(false);
    // 이 브라우저에 발견 결과가 없으니 재사용 근거 0 → 추가 검색 기본 켜짐
    expect(body.includeYouTube).toBe(true);
  });

  test("context survives reload and navigation without the query; saved result reopens without an API call", async ({ page }) => {
    const requests = await mockAnalyze(page, A.response);
    await clean(page);
    const context = A.request.phenomenon;
    await page.goto(whyHref(context));
    await page.getByRole("button", { name: /Run live analysis/ }).click();
    await expect(page.getByTestId("why-who")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("why-phenomenon").locator("h3")).toHaveText(context.title);
    await page.goto(trendPath(phenomenonTrendId(context), "why"));
    await expect(page.getByTestId("why-phenomenon").locator("h3")).toHaveText(context.title);
    await expect(page.getByText("SAVED ANALYSIS").first()).toBeVisible();
    await expect(page.getByTestId("why-who")).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-live-analyses") ?? "[]"));
    expect(stored.map((item: { trendId: string }) => item.trendId)).toEqual([phenomenonTrendId(context)]);
    expect(stored[0].whyReport.phenomenon.context.phenomenonId).toBe(context.phenomenonId);
    expect(requests).toHaveLength(1);
  });

  test("A and B are stored separately; neither overwrites the plain keyword analysis", async ({ page }) => {
    let next: unknown = A.response;
    await page.route("**/api/analyze", (route) => route.fulfill({ json: next }));
    await clean(page);
    await page.goto(whyHref(A.request.phenomenon));
    await page.getByRole("button", { name: /Run live analysis/ }).click();
    await expect(page.getByTestId("why-who")).toBeVisible();
    next = B.response;
    await page.goto(whyHref(B.request.phenomenon));
    await page.getByRole("button", { name: /Run live analysis/ }).click();
    await expect(page.getByTestId("why-who")).toContainText(B.response.report.phenomenon!.who.summary.slice(0, 20));
    const ids = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-live-analyses") ?? "[]").map((item: { trendId: string }) => item.trendId));
    expect(new Set(ids)).toEqual(new Set([phenomenonTrendId(A.request.phenomenon), phenomenonTrendId(B.request.phenomenon)]));
    expect(ids).not.toContain(liveTrendId("메이크업"));
  });

  test("B: with enough discovery evidence in this browser, it is reused and no extra search is requested", async ({ page }) => {
    const requests = await mockAnalyze(page, B.response);
    await clean(page);
    // B의 발견 근거가 이 브라우저(Workspace 저장 현상)에 있는 상황
    const context = B.request.phenomenon;
    await page.evaluate(({ context, evidence }) => localStorage.setItem("trend-radar-workspace", JSON.stringify([{ id: `phen-${context.phenomenonId}`, type: "insight", mode: "live", title: context.title, subtitle: "", createdAt: "2026-11-02T00:00:00.000Z", payload: { kind: "phenomenon", context, phenomenon: "", relatedKeywords: [], observedPlatforms: [], evidence, generatedAt: "2026-11-02T00:00:00.000Z" } }])), { context, evidence: B.request.phenomenonEvidence });
    await page.goto(whyHref(context));
    await expect(page.getByTestId("why-phenomenon")).toContainText("발견 단계 근거 9건을 재사용");
    await page.getByRole("button", { name: /Run live analysis/ }).click();
    await expect(page.getByTestId("why-who")).toBeVisible();
    const body = requests[0] as { includeYouTube: boolean; includeWeb: boolean; phenomenonEvidence: EvidenceItem[] };
    expect(body).toMatchObject({ includeYouTube: false, includeWeb: false });
    expect(body.phenomenonEvidence.map((item) => item.id)).toEqual(context.evidenceIds);
  });

  test("from Overview: EXPLORE WHY passes the discovered phenomenon and its stored evidence", async ({ page }) => {
    const pepero = discovery.pepero as unknown as { keyword: string; window: DiscoveryReport["window"]; signals: DiscoverySignal[]; ledger: EvidenceItem[] };
    await page.route("**/api/discover/phenomena", (route) => route.fulfill({ json: discovery.pepero }));
    const requests = await mockAnalyze(page, C.response);
    await clean(page);
    await page.reload();
    const panel = page.getByTestId("happening-now");
    await panel.getByLabel("Discovery keyword").fill("빼빼로데이");
    await panel.getByTestId("hn-discover").click();
    await panel.getByTestId("hn-signal").first().getByRole("link", { name: "EXPLORE WHY" }).click();
    await expect(page).toHaveURL(/\/trends\/live-ph-[0-9a-z]+\/why\?/);
    await expect(page.getByTestId("why-phenomenon").locator("h3")).toHaveText(pepero.signals[0].title);
    await expect(page.getByTestId("why-phenomenon")).toContainText("Parent Keyword: 빼빼로데이");
    await page.getByRole("button", { name: /Run live analysis/ }).click();
    await expect(page.getByTestId("why-who")).toBeVisible();
    const body = requests[0] as { phenomenon: PhenomenonContext; phenomenonEvidence: EvidenceItem[] };
    expect(body.phenomenon).toMatchObject({ keyword: "빼빼로데이", title: pepero.signals[0].title, evidenceIds: pepero.signals[0].evidenceIds, coreBehavior: pepero.signals[0].audienceBehavior });
    expect(body.phenomenonEvidence.map((item) => item.id)).toEqual(pepero.signals[0].evidenceIds);
    expect(body.phenomenon.phenomenonId).toBe(phenomenonContextOf(body.phenomenon.phenomenonId.split("~")[0], pepero, pepero.signals[0]).phenomenonId);
  });

  test("switching to the full keyword analysis goes back to the existing keyword WHY, which sends no phenomenon", async ({ page }) => {
    const { phenomenon: _drop, ...plain } = A.response.report;
    void _drop;
    const requests = await mockAnalyze(page, { ...A.response, report: plain });
    await clean(page);
    await page.goto(whyHref(A.request.phenomenon));
    await page.getByTestId("why-switch-keyword").click();
    await expect(page).toHaveURL(new RegExp(`${encodeURIComponent(liveTrendId("메이크업"))}/why$`));
    await expect(page.getByTestId("why-phenomenon")).toHaveCount(0);
    await page.getByRole("button", { name: /Run live analysis/ }).click();
    await expect(page.getByTestId("why-what")).toBeVisible();
    expect(requests[0]).not.toHaveProperty("phenomenon");
    expect(requests[0]).toMatchObject({ trend: "메이크업", includeInstagram: true });
  });

  test("Workspace restore: a LIVE insight saved from a phenomenon WHY reopens with the phenomenon", async ({ page }) => {
    await mockAnalyze(page, A.response);
    await clean(page);
    await page.goto(whyHref(A.request.phenomenon));
    await page.getByRole("button", { name: /Run live analysis/ }).click();
    await page.getByTestId("save-live-insight").click();
    await page.goto("/workspace");
    await page.getByTestId("saved-item").filter({ hasText: A.request.phenomenon.title }).getByRole("link", { name: /WHY 분석 열기/ }).click();
    await expect(page.getByTestId("why-phenomenon").locator("h3")).toHaveText(A.request.phenomenon.title);
  });

  test("Content Studio from a phenomenon WHY keeps the phenomenon context", async ({ page }) => {
    await mockAnalyze(page, A.response);
    await clean(page);
    await page.goto(whyHref(A.request.phenomenon));
    await page.getByRole("button", { name: /Run live analysis/ }).click();
    await page.getByTestId("why-to-studio").click();
    await expect(page.getByTestId("studio-phenomenon")).toContainText(A.request.phenomenon.title);
    await expect(page.getByTestId("custom-topic")).toHaveValue(A.request.phenomenon.title);
  });

  test("a phenomenon id with no stored analysis and no link context explains what is missing", async ({ page }) => {
    await clean(page);
    await page.goto("/trends/live-ph-zzzz/why");
    await expect(page.getByText(/이 현상 분석의 맥락을 이 브라우저와 주소에서 찾지 못했습니다/)).toBeVisible();
  });
});
