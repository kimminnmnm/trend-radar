import { expect, test, type Page } from "@playwright/test";
import recorded from "./fixtures/context-lock-t6.json";
import whyRuns from "./fixtures/why-phenomenon-t5.json";
import discovery from "./fixtures/discovery-t1-t3.json";
import { buildContextLock, checkLockUnits, defaultDrift, driftHits, lockEvidenceLimited, type EditorialContextLock } from "../lib/editorial-lock";
import { editorialQualityGate } from "../lib/editorial-quality";
import { needsAngleRegeneration, type ContentAngle } from "../lib/editorial";
import { phenomenonTrendId, type PhenomenonContext } from "../lib/discovery";
import { liveTrendId } from "../lib/live-trend";
import type { ProductionPlan } from "../lib/content-production";
import type { EvidenceItem, TrendAnalysis } from "../lib/schemas";

/*
 * T6 EDITORIAL CONTEXT LOCK. context-lock-t6.json: 2026-11-02 실측 — 같은 현상("가상 메이크업을 현실에서 따라 하기")으로
 * before(주제만 전달, T5까지) / after(Context Lock 전달) 방향 제안 → 카드뉴스 제작. 화면 테스트는 그 응답을 모의 API로 돌려준다.
 */
type Slide = ProductionPlan["slides"][number];
type Variant = { angles: { angles: ContentAngle[]; validation: Record<string, unknown> } & Record<string, unknown>; production: { plan: ProductionPlan; quality: { failing: string[]; checks: Array<{ id: string; pass: boolean }> } } & Record<string, unknown>; check: { drift: unknown[]; unanchored: number[]; pass: boolean } };
const f = recorded as unknown as { lock: EditorialContextLock; before: Variant; after: Variant };
type WhyRun = { request: { phenomenon: PhenomenonContext }; response: { report: TrendAnalysis; evidence: EvidenceItem[]; analyzedAt: string; signalStats: unknown[] } };
const A = (whyRuns as unknown as Record<string, WhyRun>).A;
const unitsOf = (plan: ProductionPlan) => plan.slides.map((slide: Slide) => ({ n: slide.number, text: `${slide.headline} ${slide.body} ${slide.supporting_text}` }));

test.describe("T6 recorded before/after (same phenomenon, same rule)", () => {
  test("after: every slide stays on the locked phenomenon and the quality gate's context-lock check passes", () => {
    const check = checkLockUnits(unitsOf(f.after.production.plan), f.lock);
    expect(check).toMatchObject({ drift: [], unanchored: [], pass: true });
    expect(f.after.production.quality.checks.find((item) => item.id === "context-lock")).toMatchObject({ pass: true });
    expect(f.after.production.quality.failing).toEqual([]);
    expect(driftHits(f.after.production.plan.title, f.lock)).toEqual([]);
  });

  test("before: no hard drift, but two slides were generic eyeliner tips that did not show the phenomenon", () => {
    const check = checkLockUnits(unitsOf(f.before.production.plan), f.lock);
    expect(check.drift).toEqual([]);
    expect(check.unanchored).toEqual([3, 4]);
    expect(check.pass).toBe(false);
    // 수정 전에는 잠금 검사가 없어 이 문제가 품질 게이트에 잡히지 않았다.
    expect(f.before.production.quality.checks.some((item) => item.id === "context-lock")).toBe(false);
  });

  test("both keep the topic when evidence is thin and record what is missing instead of switching subjects", () => {
    for (const variant of [f.before, f.after]) expect(variant.production.plan.editor_notes?.research_gaps?.length ?? 0).toBeGreaterThan(0);
    for (const angle of f.after.angles.angles) expect(driftHits(`${angle.title} ${angle.hook} ${angle.editorial_perspective}`, f.lock)).toEqual([]);
  });
});

test.describe("T6 lock rules (deterministic)", () => {
  test("default drift follows the direction: Virtual → Real forbids in-game item use, A 안에서 B forbids real-life recreation", () => {
    const base = { keyword: "메이크업", object: "현실의 메이크업 룩" };
    expect(defaultDrift({ ...base, direction: "Virtual → Real" }).map((item) => item.id)).toEqual(["history", "beginner", "purchase", "generic", "opposite"]);
    expect(defaultDrift({ ...base, direction: "Virtual → Real" }).at(-1)!.label).toMatch(/게임·가상 공간 안에서/);
    expect(defaultDrift({ ...base, direction: "A 안에서 B" }).at(-1)!.label).toMatch(/현실에서 따라/);
    expect(defaultDrift({ ...base, direction: "" }).map((item) => item.id)).not.toContain("opposite");
  });

  test("drift rules catch the spec's off-topic examples and leave on-topic sentences alone", () => {
    const lock = f.lock;
    expect(driftHits("로블록스 메이크업 아이템 구매 방법과 로벅스 가격", lock)).toContain("아이템·상품 구매 방법이나 가격 안내");
    expect(driftHits("로블록스 초보자 가이드: 가입하는 방법부터", lock)).toContain(lock.prohibitedTopicDrift[1].label);
    expect(driftHits("메이크업의 역사는 고대 이집트에서 시작됐어요", lock)).toContain(lock.prohibitedTopicDrift[0].label);
    expect(driftHits("게임 안에서 립스틱 아이템을 고르는 법", lock)).toContain(lock.prohibitedTopicDrift[4].label);
    expect(driftHits("아바타의 네온 섀도를 현실 얼굴에 옮겨 봐요", lock)).toEqual([]);
    expect(driftHits("재현에 쓴 준비물: 글리터 섀도와 속눈썹", lock)).toEqual([]);
    const kia = { ...lock, parentKeyword: "KIA 타이거즈", prohibitedTopicDrift: defaultDrift({ keyword: "KIA 타이거즈", object: "", direction: "" }) };
    expect(driftHits("야구장 준비물 체크리스트", kia).length).toBeGreaterThan(0);
    const custom = { ...lock, prohibitedTopicDrift: [{ id: "custom-1", label: "피부 타입별 기초 스킨케어" }] };
    expect(driftHits("피부 타입별로 기초 스킨케어를 바꿔요", custom)).toEqual(["피부 타입별 기초 스킨케어"]);
  });

  test("the lock's observed evidence comes only from the phenomenon WHY ledger; a parent-keyword WHY gives none (limited)", () => {
    const lock = buildContextLock(A.request.phenomenon, { report: A.response.report, evidence: A.response.evidence });
    const ledger = new Map(A.response.evidence.map((item) => [item.id, item]));
    expect(lock.observedEvidenceIds.length).toBeGreaterThanOrEqual(2);
    for (const id of lock.observedEvidenceIds) expect(ledger.get(id)?.kind).not.toBe("naver_series");
    expect(lock).toMatchObject({ selectedPhenomenonId: A.request.phenomenon.phenomenonId, selectedPhenomenon: A.request.phenomenon.title, parentKeyword: "메이크업", evidenceStatus: "EMERGING", enabled: true });
    const { phenomenon: _drop, ...plain } = A.response.report;
    void _drop;
    const parentOnly = buildContextLock(A.request.phenomenon, { report: plain, evidence: A.response.evidence });
    expect(parentOnly.observedEvidenceIds).toEqual([]);
    expect(lockEvidenceLimited(parentOnly)).toBe(true);
  });

  test("quality gate: a drifting slide fails the required context-lock check; without a lock the gate is unchanged", () => {
    const plan = structuredClone(f.after.production.plan);
    plan.slides[2] = { ...plan.slides[2], headline: "로블록스 초보자 가이드", body: "로블록스에 가입하는 방법과 메이크업 아이템 구매 방법을 알려 줄게요." };
    const subjectTerms = ["가상 메이크업을 현실에서 따라 하기"];
    const locked = editorialQualityGate(plan, { subjectTerms, lock: f.lock });
    expect(locked.failing).toContain("context-lock");
    expect(locked.issues.some((issue) => issue.unit === plan.slides[2].number && /잠근 현상에서 벗어남/.test(issue.problem))).toBe(true);
    const unlocked = editorialQualityGate(plan, { subjectTerms });
    expect(unlocked.checks.some((check) => check.id === "context-lock")).toBe(false);
    expect(editorialQualityGate(plan, { subjectTerms, lock: { ...f.lock, enabled: false } }).checks.some((check) => check.id === "context-lock")).toBe(false);
  });

  test("angles that leave the locked phenomenon trigger one regeneration", () => {
    const result = { angles: f.after.angles.angles, validation: { removedEvidenceIds: [], genericTitles: [], droppedDuplicates: [], downgradedFit: 0 } };
    expect(needsAngleRegeneration(result, "x")).toBe(false);
    expect(needsAngleRegeneration({ ...result, validation: { ...result.validation, lockDrift: ["로블록스 초보자 가이드"] } }, "x")).toBe(true);
  });

  test("invalid lock input is rejected before any paid access check", async ({ request }) => {
    const bad = { selectedPhenomenonId: "", selectedPhenomenon: "", parentKeyword: "" };
    expect((await request.post("/api/studio/angles", { data: { trends: [], concept: undefined, mode: "editorial", settings: { format: "cardnews" }, contextLock: bad } })).status()).toBe(400);
    expect((await request.post("/api/studio/production", { data: { contextLock: bad } })).status()).toBe(400);
  });
});

async function seedPhenomenonWhy(page: Page, withPhenomenon = true) {
  const context = A.request.phenomenon;
  const { phenomenon: _drop, ...plain } = A.response.report;
  void _drop;
  const snapshot = withPhenomenon
    ? { id: "s1", trendId: phenomenonTrendId(context), trendName: context.title, keywords: [context.title], periodMonths: 3, summary: "요약", analyzedAt: A.response.analyzedAt, source: "NAVER DataLab + YouTube + OpenAI", whyReport: A.response.report, evidence: A.response.evidence, signalStats: A.response.signalStats }
    : { id: "s2", trendId: liveTrendId("메이크업"), trendName: "메이크업", keywords: ["메이크업"], periodMonths: 3, summary: "요약", analyzedAt: A.response.analyzedAt, source: "NAVER DataLab + YouTube + OpenAI", whyReport: plain, evidence: A.response.evidence, signalStats: A.response.signalStats };
  await page.goto("/");
  await page.evaluate((value) => { localStorage.clear(); localStorage.setItem("trend-radar-live-analyses", JSON.stringify([value])); }, snapshot);
  const calls = { angles: [] as Array<Record<string, unknown>>, production: [] as Array<Record<string, unknown>> };
  await page.route("**/api/studio/angles", (route) => { calls.angles.push(route.request().postDataJSON()); return route.fulfill({ json: f.after.angles }); });
  await page.route("**/api/studio/production", (route) => { calls.production.push(route.request().postDataJSON()); return route.fulfill({ json: f.after.production }); });
  return { calls, trendId: snapshot.trendId };
}

test.describe("T6 Content Studio", () => {
  test("a project from a phenomenon WHY is locked; angles and production requests carry the lock; edits persist", async ({ page }) => {
    const { calls, trendId } = await seedPhenomenonWhy(page);
    await page.goto(`/studio?trend=${encodeURIComponent(trendId)}`);
    const panel = page.getByTestId("context-lock");
    await expect(panel.getByTestId("lock-phenomenon")).toContainText(A.request.phenomenon.title);
    await expect(panel.getByTestId("lock-evidence")).toContainText("D-YT-04");
    await expect(panel.getByTestId("lock-limited")).toHaveCount(0);
    await expect(panel.getByTestId("lock-drift")).toHaveValue(/메이크업의 역사·기원 설명[\s\S]*게임·가상 공간 안에서/);
    await panel.getByTestId("lock-focus").fill("아바타 룩과 현실 재현 결과를 나란히 비교");
    await panel.getByTestId("lock-drift").fill(`${f.lock.prohibitedTopicDrift.map((item) => item.label).join("\n")}\n피부 타입별 기초 스킨케어`);
    await page.reload();
    await expect(page.getByTestId("lock-focus")).toHaveValue("아바타 룩과 현실 재현 결과를 나란히 비교");
    await page.getByTestId("angles-generate").click();
    await expect(page.getByTestId("angle-card")).toHaveCount(f.after.angles.angles.length);
    const angleLock = calls.angles[0].contextLock as EditorialContextLock;
    expect(angleLock).toMatchObject({ selectedPhenomenon: A.request.phenomenon.title, editorialFocus: "아바타 룩과 현실 재현 결과를 나란히 비교", enabled: true });
    expect(angleLock.prohibitedTopicDrift.at(-1)).toEqual({ id: "custom-1", label: "피부 타입별 기초 스킨케어" });
    expect(angleLock.prohibitedTopicDrift.slice(0, 5).map((item) => item.id)).toEqual(["history", "beginner", "purchase", "generic", "opposite"]);
    await page.getByTestId("angle-card").first().click();
    await page.getByTestId("production-generate").click();
    await expect(page.getByTestId("production-slide")).toHaveCount(f.after.production.plan.slides.length);
    expect((calls.production[0].contextLock as EditorialContextLock).observedEvidenceIds).toEqual(angleLock.observedEvidenceIds);
    await expect(page.getByTestId("quality-gate")).toContainText("현상 고정(Context Lock)");
  });

  test("turning the lock off sends no lock", async ({ page }) => {
    const { calls, trendId } = await seedPhenomenonWhy(page);
    await page.goto(`/studio?trend=${encodeURIComponent(trendId)}`);
    await page.getByTestId("context-lock-toggle").uncheck();
    await page.getByTestId("angles-generate").click();
    await expect(page.getByTestId("angle-card").first()).toBeVisible();
    expect(calls.angles[0]).not.toHaveProperty("contextLock");
  });

  test("a plain keyword project has no lock and sends none (existing behavior)", async ({ page }) => {
    const { calls, trendId } = await seedPhenomenonWhy(page, false);
    await page.goto(`/studio?trend=${encodeURIComponent(trendId)}`);
    await expect(page.getByTestId("studio-production")).toBeVisible();
    await expect(page.getByTestId("context-lock")).toHaveCount(0);
    await page.getByTestId("angles-generate").click();
    await expect(page.getByTestId("angle-card").first()).toBeVisible();
    expect(calls.angles[0]).not.toHaveProperty("contextLock");
  });

  test("a phenomenon picked in Overview without its own WHY is locked but flagged as limited, with ways to add evidence", async ({ page }) => {
    await page.route("**/api/discover/phenomena", (route) => route.fulfill({ json: discovery.pepero }));
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const hn = page.getByTestId("happening-now");
    await hn.getByLabel("Discovery keyword").fill("빼빼로데이");
    await hn.getByTestId("hn-discover").click();
    await hn.getByTestId("hn-signal").first().getByRole("link", { name: "CREATE CONTENT" }).click();
    const panel = page.getByTestId("context-lock");
    await expect(panel.getByTestId("lock-phenomenon")).toContainText(discovery.pepero.signals[0].title);
    await expect(panel.getByTestId("lock-limited")).toContainText("다른 주제로 바꾸지 않습니다");
    await expect(panel.getByTestId("lock-limited")).toContainText(`발견 단계 근거(${discovery.pepero.signals[0].evidenceIds.join(", ")})는 있지만 아직 제작 원장에 들어오지 않았습니다`);
    await expect(panel.getByRole("link", { name: "이 현상의 WHY 분석 실행" })).toHaveAttribute("href", /\/trends\/live-ph-[0-9a-z]+\/why\?/);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]"));
    expect(stored[0].contextLock).toMatchObject({ selectedPhenomenon: discovery.pepero.signals[0].title, parentKeyword: "빼빼로데이", observedEvidenceIds: [] });
  });
});
