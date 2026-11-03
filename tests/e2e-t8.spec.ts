import { expect, test, type Page } from "@playwright/test";
import e2e from "./fixtures/e2e-t8.json";
import discovery from "./fixtures/discovery-t1-t3.json";
import lockRun from "./fixtures/context-lock-t6.json";
import editorialStudio from "./fixtures/editorial-studio.json";
import engineV2 from "./fixtures/editorial-engine-v2.json";
import engineV21 from "./fixtures/editorial-engine-v21.json";
import { connectionContextOf, parseKeywordPair, type ConnectionRun, type DiscoverySignal } from "../lib/discovery";
import { checkLockUnits, driftHits, type EditorialContextLock } from "../lib/editorial-lock";
import { slideImageBrief, EVIDENCE_GUARD } from "../lib/image-brief";
import { toFigmaExport } from "../lib/figma-export";
import { defaultSettings, type ProductionPlan, type StudioProject } from "../lib/content-production";
import type { TrendAnalysis } from "../lib/schemas";

/*
 * T8 END-TO-END. e2e-t8.json: 2026-11-02 실측 — D(KIA 타이거즈 → 포스트시즌 관중석 색깔 응원전), E(헤이세이 레트로 → 헤이세이 갸루 표지 체험),
 * C(빼빼로데이 → 먼작귀 빼빼로 만들기)를 발견 → 현상 WHY → Context Lock 방향 제안 → 카드뉴스까지. A·B는 T1·T3·T5·T6 실측을 쓴다.
 * "수정 전"은 이전 편집 엔진이 같은 키워드로 만든 카드뉴스(editorial-studio·engine-v2·v21 픽스처)다 — 그때는 현상 선택이 없었다.
 * 품질 판정은 테스트 통과 개수가 아니라 아래의 결정적 규칙과 사람이 읽은 내용 비교(docs/TREND_DISCOVERY_ENGINE.md T8)로 한다.
 */
type Plan = ProductionPlan;
type Run = { keyword: string; lock: EditorialContextLock; production: { plan: Plan; quality: { failing: string[] } }; why?: { response: { report: TrendAnalysis } }; angles: { angles: Array<{ title: string; hook: string; editorial_perspective: string }> } };
type Discovered = { keyword: string; window: { from: string; to: string }; signals: DiscoverySignal[] };
const f = e2e as unknown as { D: Run; E: Run; C: Run; discover: { kia: Discovered; heisei: Discovered } };
const units = (plan: Plan) => plan.slides.map((slide) => ({ n: slide.number, text: `${slide.headline} ${slide.body} ${slide.supporting_text}` }));
const copy = (plan: Plan) => `${plan.title} ${plan.slides.map((slide) => `${slide.headline} ${slide.body} ${slide.supporting_text}`).join(" ")} ${plan.caption}`;
const HISTORY = /역사|기원|유래|시초/;
const HYPE = /급상승|바이럴|대세|인기 폭발|인기 1위/;
const before = {
  kiaGuide: (engineV2 as unknown as { productions: Record<string, { plan: Plan }> }).productions.kiaCustom.plan,
  kiaReport: (editorialStudio as unknown as { kia: { before: { plan: Plan } } }).kia.before.plan,
  heiseiV2: (engineV2 as unknown as { productions: Record<string, { plan: Plan }> }).productions.heisei.plan,
  heiseiV21: (engineV21 as unknown as { productions: Record<string, { plan: Plan }> }).productions.heisei.plan,
};

test.describe("T8 scenarios (recorded real runs)", () => {
  test("A 메이크업: current sub-phenomena instead of makeup's history", () => {
    const signals = (discovery as unknown as { makeup: Discovered }).makeup.signals;
    expect(signals.length).toBeGreaterThanOrEqual(4);
    for (const signal of signals) expect(signal.title).not.toMatch(HISTORY);
  });

  test("B 로블록스 × 메이크업 → 현실 재현: the chosen direction is kept through WHY and content; no in-game feature drift", () => {
    const lock = (lockRun as unknown as { lock: EditorialContextLock }).lock;
    const plan = (lockRun as unknown as { after: { production: { plan: Plan } } }).after.production.plan;
    expect(lock.direction).toBe("Virtual → Real");
    expect(checkLockUnits(units(plan), lock)).toMatchObject({ drift: [], pass: true });
    expect(copy(plan)).toMatch(/현실/);
    expect(copy(plan)).not.toMatch(/아이템을 (사|구매)|게임 안에서 (아이템|도구)를? (고르|쓰)/);
  });

  test("C 빼빼로데이: this year's cases first (discovery) and the content is the making behavior, not the day's origin", () => {
    const pepero = (discovery as unknown as { pepero: Discovered }).pepero;
    for (const signal of pepero.signals) { expect(signal.title).not.toMatch(HISTORY); expect(signal.observedDateRange!.to >= pepero.window.from).toBe(true); }
    const plan = f.C.production.plan;
    expect(checkLockUnits(units(plan), f.C.lock).pass).toBe(true);
    expect(copy(plan)).toMatch(/치이카와|먼작귀/);
    expect(copy(plan)).not.toMatch(/빼빼로데이의 (유래|기원|역사)/);
  });

  test("D KIA 타이거즈 → 응원 문화: the cheering phenomenon itself, not a stadium preparation guide (before: ticket booking + team history)", () => {
    expect(f.discover.kia.signals.map((signal) => signal.title).join(" ")).not.toMatch(HISTORY);
    expect(f.D.why!.response.report.phenomenon!.checks).toMatchObject({ anchored: true, warnings: [] });
    const after = f.D.production.plan;
    expect(checkLockUnits(units(after), f.D.lock)).toMatchObject({ drift: [], pass: true });
    expect(copy(after)).toMatch(/타월|우비|관중석/);
    expect(copy(after)).not.toMatch(/준비물|예매|입장 방법|규칙 몰라도|첫 직관/);
    expect(f.D.production.quality.failing).toEqual([]);
    // 수정 전: 같은 키워드로 만든 입문 가이드는 같은 규칙에서 역사·예매 이탈로 걸린다.
    const old = checkLockUnits(units(before.kiaGuide), f.D.lock);
    expect(old.pass).toBe(false);
    expect(old.drift.flatMap((unit) => unit.hits).join(" ")).toMatch(/역사·기원.*입문·초보자|입문·초보자.*역사·기원/);
    expect(copy(before.kiaReport)).toMatch(/검색 관심도/);
  });

  test("E 헤이세이 레트로: a concrete Heisei-culture case instead of generic sticker decorating (before: sticker binder)", () => {
    const after = f.E.production.plan;
    expect(checkLockUnits(units(after), f.E.lock).pass).toBe(true);
    expect(copy(after)).toMatch(/egg|갸루/);
    expect(copy(after)).not.toMatch(/스티커|바인더/);
    for (const old of [before.heiseiV2, before.heiseiV21]) {
      expect(copy(old)).toMatch(/스티커|바인더/);
      expect(copy(old)).not.toMatch(/egg|갸루|헤이세이 문화/);
      expect(checkLockUnits(units(old), f.E.lock).pass).toBe(false);
    }
  });

  test("limited evidence stays EMERGING and is never written up as hype; gaps are recorded instead of switching topics", () => {
    for (const run of [f.D, f.E]) {
      expect(run.lock.evidenceStatus).toBe("EMERGING");
      expect(copy(run.production.plan)).not.toMatch(HYPE);
      expect(run.production.plan.editor_notes?.research_gaps?.length ?? 0).toBeGreaterThan(0);
      for (const angle of run.angles.angles) expect(driftHits(`${angle.title} ${angle.hook} ${angle.editorial_perspective}`, run.lock)).toEqual([]);
    }
  });

  test("material uniqueness: the three scenarios share no slide headlines and each cover names its own behavior", () => {
    const heads = [f.C, f.D, f.E].map((run) => new Set(run.production.plan.slides.map((slide) => slide.headline)));
    expect([...heads[0]].some((item) => heads[1].has(item) || heads[2].has(item))).toBe(false);
    expect(f.D.production.plan.slides[0].headline).toMatch(/타월|우비/);
    expect(f.E.production.plan.slides[0].headline).toMatch(/egg|표지/);
    expect(f.C.production.plan.slides[0].headline).toMatch(/코팅|얼굴/);
  });

  test("image briefs carry each scenario's subject and action with the evidence guard (prompt stage only — no images generated in T8)", () => {
    for (const run of [f.C, f.D, f.E]) {
      const brief = slideImageBrief(run.production.plan.slides[0], { lock: run.lock, title: run.production.plan.title });
      expect(brief.action).toBe(run.lock.coreBehavior);
      expect(brief.forbidden[0]).toBe(EVIDENCE_GUARD);
      expect(brief.forbidden.join(" ")).toContain(run.lock.selectedPhenomenon);
    }
  });

  test("Figma handoff carries the locked phenomenon in the editor notes, separate from the publishing copy", () => {
    const project: StudioProject = { id: "t8-d", mode: "single", title: f.D.production.plan.title, source: { trendKeys: ["t"], trendNames: [f.D.keyword] }, settings: { ...defaultSettings("cardnews"), slideCount: 6 }, plan: f.D.production.plan, assets: [], edited: false, contextLock: f.D.lock, createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z" };
    const exported = toFigmaExport(project, "2026-11-02T00:00:00.000Z") as unknown as { editorNotes: { contextLock: string[] }; copy: { caption: string } };
    expect(exported.editorNotes.contextLock[0]).toContain(f.D.lock.selectedPhenomenon);
    expect(exported.editorNotes.contextLock.join(" ")).toContain("다루지 않을 주제");
    expect(exported.copy.caption).not.toContain("다루지 않을 주제");
    const unlocked = toFigmaExport({ ...project, contextLock: { ...f.D.lock, enabled: false } }, "2026-11-02T00:00:00.000Z") as unknown as { editorNotes: { contextLock: string[] } };
    expect(unlocked.editorNotes.contextLock).toEqual([]);
  });

  test("relation interpretation: connection types map to evidence status without being merged across directions", () => {
    const conn = (discovery as unknown as { connections: Omit<ConnectionRun, "id" | "generatedAt" | "a" | "b"> & { a: string; b: string } }).connections;
    const run = { ...conn, id: "cr-test", generatedAt: "2026-11-02T00:00:00.000Z" } as ConnectionRun;
    const contexts = run.connections.map((connection) => connectionContextOf(run, connection));
    expect(new Set(contexts.map((context) => context.phenomenonId)).size).toBe(contexts.length);
    run.connections.forEach((connection, index) => expect(contexts[index].verificationStatus).toBe({ "OBSERVED CONNECTION": "OBSERVED", "EMERGING SIGNAL": "EMERGING", "CREATIVE HYPOTHESIS": "INSUFFICIENT EVIDENCE" }[connection.type]));
    expect(parseKeywordPair("로블록스 × 메이크업")).toEqual({ a: "로블록스", b: "메이크업" });
    expect(parseKeywordPair("로블록스 x 메이크업")).toEqual({ a: "로블록스", b: "메이크업" });
    expect(parseKeywordPair("메이크업")).toBeNull();
    expect(parseKeywordPair("메이크업 × 메이크업")).toBeNull();
    // 고유명사 안의 ×·X는 구분자가 아니다.
    expect(parseKeywordPair("SPY×FAMILY")).toBeNull();
    expect(parseKeywordPair("Gen X 문화")).toBeNull();
    expect(parseKeywordPair("SPY×FAMILY × 메이크업")).toEqual({ a: "SPY×FAMILY", b: "메이크업" });
  });
});

async function openOverview(page: Page) { await page.goto("/"); await page.evaluate(() => localStorage.clear()); await page.reload(); return page.getByTestId("happening-now"); }

test.describe("T8 scenario B through the UI (recorded responses)", () => {
  test("search '로블록스 × 메이크업' → pick Virtual → Real → WHY gets the direction → Studio locks it and forbids in-game feature content", async ({ page }) => {
    const requests: Array<Record<string, unknown>> = [];
    await page.route("**/api/discover/connections", async (route) => { requests.push(route.request().postDataJSON()); await route.fulfill({ json: discovery.connections }); });
    const panel = await openOverview(page);
    await panel.getByLabel("Discovery keyword").fill("로블록스 × 메이크업");
    await expect(panel.getByTestId("hn-discover")).toHaveText(/두 키워드 연결 찾기/);
    await panel.getByTestId("hn-discover").click();
    expect(requests).toEqual([{ a: "로블록스", b: "메이크업", days: 30, force: false }]);
    const cards = panel.getByTestId("hn-connection");
    await expect(cards).toHaveCount(discovery.connections.connections.length);
    const real = cards.filter({ hasText: "가상 메이크업을 현실에서 따라 하기" });
    await expect(real).toHaveAttribute("data-direction", "Virtual → Real");
    await expect(real).toContainText("떠오르는 신호");
    await real.getByRole("button", { name: "VIEW EVIDENCE" }).click();
    await expect(real.getByTestId("hn-connection-evidence").locator("li")).toHaveCount(1);
    const why = await real.getByRole("link", { name: "EXPLORE WHY" }).getAttribute("href");
    const params = new URLSearchParams(why!.split("?")[1]);
    expect(params.get("dir")).toBe("Virtual → Real");
    expect(params.get("kw")).toBe("로블록스 × 메이크업");
    expect(params.get("ev")).toBe("YT-04");
    await real.getByRole("link", { name: "CREATE CONTENT" }).click();
    const lock = page.getByTestId("context-lock");
    await expect(lock.getByTestId("lock-phenomenon")).toContainText("가상 메이크업을 현실에서 따라 하기");
    await expect(lock.getByTestId("lock-drift")).toHaveValue(/게임·가상 공간 안에서 아이템·기능을 쓰는 방법/);
    // 연결 결과는 저장돼 다시 열 때 API를 부르지 않는다.
    await page.goto("/");
    await expect(page.getByTestId("happening-now").getByTestId("hn-connection")).toHaveCount(discovery.connections.connections.length);
    expect(requests).toHaveLength(1);
  });

  test("connection API errors are shown and nothing is saved", async ({ page }) => {
    await page.route("**/api/discover/connections", (route) => route.fulfill({ status: 401, json: { message: "실제 API 분석은 로그인 후 사용할 수 있습니다." } }));
    const panel = await openOverview(page);
    await panel.getByLabel("Discovery keyword").fill("로블록스 × 메이크업");
    await panel.getByTestId("hn-discover").click();
    await expect(panel.getByRole("alert")).toContainText("로그인 후");
    expect(await page.evaluate(() => localStorage.getItem("trend-radar-connection-runs"))).toBeNull();
  });
});
