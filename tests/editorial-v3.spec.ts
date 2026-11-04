import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import v2 from "./fixtures/editorial-engine-v2.json";
import v21 from "./fixtures/editorial-engine-v21.json";
import old from "./fixtures/editorial-studio.json";
import base from "./fixtures/live-pipeline.json";
import t6 from "./fixtures/context-lock-t6.json";
import t8 from "./fixtures/e2e-t8.json";
import { editorialTypeStructure, editorialTypes, isBasicAngle, needsAngleRegeneration, validateAngles, type ContentAngle } from "../lib/editorial";
import { slideImageBrief } from "../lib/image-brief";
import { editorialQualityGate } from "../lib/editorial-quality";
import { lockFromAngle } from "../lib/editorial-lock";
import type { ProductionPlan } from "../lib/content-production";
import type { LiveAnalysisSnapshot } from "../lib/types";

/*
 * EDITORIAL ENGINE V3 — E0 우선 개선 3개(E1 일부 · E4 일부). 유료 호출 없음: 저장된 실측 기록(픽스처)과 규칙 검사로 확인한다.
 * 실제 생성 품질 비교(V2.1 vs V3)는 사용자 승인 후 별도로 실행해야 한다 — 이 테스트는 그것을 대신하지 않는다.
 */
type Angles = { angles: ContentAngle[] };
type Produced = { angle: ContentAngle; plan: ProductionPlan };
const f2 = v2 as unknown as { angles: Record<string, Angles>; productions: Record<string, Produced> };
const f21 = v21 as unknown as { angles: Record<string, Angles>; productions: Record<string, Produced> };
const angle = (title: string, extra: Partial<ContentAngle> = {}): ContentAngle => ({ angle_id: "x", title, hook: "h", editorial_perspective: `${title} 관점`, target_audience: "t", reader_benefit: "b", content_structure: [], suggested_visuals: [], research_requirements: [], evidence_ids: [], evidence_fit: "partial", ...extra });

test.describe("E1 · angle defaults (PHENOMENON FIRST)", () => {
  test("the prompt no longer suggests the club's history / beginner guide / gear, and asks for a focus per angle and observed phenomena", () => {
    const source = fs.readFileSync("lib/openai-editorial.ts", "utf8");
    expect(source).not.toContain("the club's history");
    expect(source).not.toContain("stadium gear and food");
    expect(source).toContain("PHENOMENON FIRST");
    expect(source).toContain("observed_phenomena");
    expect(source).toMatch(/focus: js\.str/);
    expect(source).toContain("TRUST_RULE");
  });

  test("recorded V2 angle sets (no topic, no lock) would now be regenerated because history/beginner angles dominate", () => {
    // 실측: 사용자 주제·잠금 없이 만든 방향 세트 7개 모두에 history 방향이 있었다(E0 실패 분석 FAILURE 10).
    const sets = { ...Object.fromEntries(["기아타이거즈", "보컬로이드", "헤이세이 레트로", "디지털카메라", "치이카와"].map((key) => [key, f2.angles[key]])), ...Object.fromEntries(Object.entries(f21.angles)) };
    const flagged = Object.entries(sets).map(([key, set]) => ({ key, basic: validateAngles({ angles: set.angles }, []).validation.basicAngles ?? [] }));
    for (const item of flagged) expect(item.basic.length, item.key).toBeGreaterThanOrEqual(1);
    const kia = validateAngles({ angles: f2.angles["기아타이거즈"].angles }, []);
    expect(kia.validation.basicAngles).toEqual(expect.arrayContaining(["기아 타이거즈, 입문은 응원가부터"]));
    // 사용자 주제가 입문이면(주제가 최우선) 입문 방향 때문에 다시 만들지 않는다.
    const custom = validateAngles({ angles: f2.angles["기아타이거즈 custom"].angles }, [], "처음 야구장에 가는 사람을 위한 입덕 가이드");
    expect(needsAngleRegeneration(custom, "처음 야구장에 가는 사람을 위한 입덕 가이드")).toBe(false);
  });

  test("regeneration now asks for 4 different focuses, not 4 reader-experience types", () => {
    const sameTypeDifferentFocus = validateAngles({ angles: ["아웃송 삐끼삐끼 응원", "포스트시즌 붉은 타월 색 맞춤", "하늘색 우비로 물든 원정석", "8회 떼창 구간", "치어리더 화장 수정 영상"].map((title) => angle(title, { angle_type: "fandom", focus: title })) }, []);
    expect(sameTypeDifferentFocus.validation.typeCount).toBe(1);
    expect(sameTypeDifferentFocus.validation.focusCount).toBe(5);
    expect(needsAngleRegeneration(sameTypeDifferentFocus)).toBe(false); // V2에서는 유형 1종이라 재생성됐다
    const sameFocus = validateAngles({ angles: ["삐끼삐끼 춤 따라 하기", "삐끼삐끼 춤 동작 정리", "삐끼삐끼 춤 영상 모음", "삐끼삐끼 춤 원조 장면", "삐끼삐끼 춤 챌린지"].map((title, i) => angle(title, { angle_type: (["howto", "curation", "fandom", "behind", "trivia"] as const)[i], focus: "삐끼삐끼 춤" })) }, []);
    expect(sameFocus.validation.focusCount).toBeLessThan(4);
    expect(needsAngleRegeneration(sameFocus)).toBe(true);
    expect(isBasicAngle(angle("타이거즈는 어디서 왔을까"))).toBe(true);
    expect(isBasicAngle(angle("붉은 타월 옆, 하늘색 우비 관중석"))).toBe(false);
  });
});

test.describe("E1 · soft lock from the chosen angle (keyword / Collision / Lab paths)", () => {
  test("the chosen angle's focus becomes a soft lock; the angle's own type is not forbidden; evidence status follows evidence_fit", () => {
    const fandom = lockFromAngle({ angle_id: "angle-2", title: "삐끼삐끼는 아웃송에서 시작", focus: "아웃송에 맞춘 삐끼삐끼 응원", angle_type: "fandom", evidence_ids: ["T1:WEB-02", "WEB-09"], evidence_fit: "grounded" }, "기아타이거즈")!;
    expect(fandom).toMatchObject({ soft: true, selectedPhenomenon: "아웃송에 맞춘 삐끼삐끼 응원", parentKeyword: "기아타이거즈", evidenceStatus: "OBSERVED", observedEvidenceIds: ["WEB-02"] });
    expect(fandom.prohibitedTopicDrift.map((item) => item.id)).toEqual(expect.arrayContaining(["history", "beginner", "purchase"]));
    const history = lockFromAngle({ angle_id: "a", title: "t", focus: "f", angle_type: "history", evidence_ids: [], evidence_fit: "needs_research" }, "k")!;
    expect(history.prohibitedTopicDrift.map((item) => item.id)).not.toContain("history");
    expect(history.evidenceStatus).toBe("INSUFFICIENT EVIDENCE");
    expect(lockFromAngle({ angle_id: "a", title: "t", angle_type: "guide", evidence_ids: [], evidence_fit: "partial" }, "k")).toBeUndefined(); // 초점 없는 이전 방향
  });

  test("with a soft lock the quality gate catches history filler in a recorded KIA guide production but does not demand the focus words on every slide", () => {
    const produced = f2.productions.kiaA3;
    const lock = lockFromAngle({ ...produced.angle, angle_type: "fandom", focus: "응원가를 함께 부르는 순간" }, "기아타이거즈")!;
    const report = editorialQualityGate(produced.plan, { subjectTerms: ["기아타이거즈", "기아 타이거즈", "KIA"], angle: produced.angle, lock });
    const check = report.checks.find((item) => item.id === "context-lock")!;
    expect(check.label).toContain("방향 초점 유지");
    expect(check.pass).toBe(false);
    expect(report.issues.some((issue) => /역사·기원/.test(issue.problem))).toBe(true); // "이름에 이어진 역사" 슬라이드
    expect(report.issues.some((issue) => /이 현상의 행동·사례로 연결하기/.test(issue.problem))).toBe(false);
  });

  test("the production code builds the soft lock only without a phenomenon lock and without a user topic", () => {
    const source = fs.readFileSync("lib/openai-production.ts", "utf8");
    expect(source).toMatch(/options\.lock\?\.enabled \? options\.lock : !topic && angle && mode !== "report" && mode !== "concept" && trends\[0\] \? lockFromAngle\(angle, trends\[0\]\.name\) : undefined/);
  });
});

test.describe("E4 · trust gates (G2 fake experience · G3 unsupported virality) and survey narration", () => {
  const plan = (bodies: string[], extra: Partial<ProductionPlan> = {}): ProductionPlan => ({ ...(t8 as unknown as { D: { production: { plan: ProductionPlan } } }).D.production.plan, ...extra, slides: (t8 as unknown as { D: { production: { plan: ProductionPlan } } }).D.production.plan.slides.map((slide, i) => bodies[i] !== undefined ? { ...slide, body: bodies[i], fact_checks: [] } : slide) });

  test("a first-person experience or a popularity claim without evidence fails the required checks; the good recorded pieces pass", () => {
    const fake = editorialQualityGate(plan(["", "직접 먹어봤는데 쫀득했어요.", "요즘 난리난 응원 타월이에요."]), { subjectTerms: ["KIA"] });
    expect(fake.checks.find((check) => check.id === "experience")?.pass).toBe(false);
    expect(fake.checks.find((check) => check.id === "virality")?.pass).toBe(false);
    expect(fake.failing).toEqual(expect.arrayContaining(["experience", "virality"]));
    expect(fake.issues.some((issue) => issue.unit === 2 && /1인칭 체험/.test(issue.problem))).toBe(true);
    for (const good of [(t8 as unknown as { D: { production: { plan: ProductionPlan } } }).D.production.plan, (t6 as unknown as { after: { production: { plan: ProductionPlan } } }).after.production.plan, (old as unknown as { kia: { after: { plan: ProductionPlan } } }).kia.after.plan]) {
      const report = editorialQualityGate(good, { subjectTerms: ["KIA"] });
      expect(report.checks.find((check) => check.id === "experience")?.pass).toBe(true);
      expect(report.checks.find((check) => check.id === "virality")?.pass).toBe(true);
    }
  });

  test("user-provided experience material allows a first-person line (it must be attributed to the user)", () => {
    const lock = { ...lockFromAngle({ angle_id: "a", title: "t", focus: "f", angle_type: "experience", evidence_ids: [], evidence_fit: "partial" }, "k")!, userMaterials: "사용자 메모: 3월에 직접 방문해 먹어 봄" };
    const report = editorialQualityGate(plan(["", "직접 먹어봤는데 쫀득했어요."]), { subjectTerms: ["KIA"], lock });
    expect(report.checks.find((check) => check.id === "experience")?.pass).toBe(true);
  });

  test("recorded Chiikawa survey narration (FAILURE 07) is now flagged as an editorial signal", () => {
    const report = editorialQualityGate(f21.productions.chiikawa.plan, { subjectTerms: ["치이카와"] });
    const survey = report.checks.find((check) => check.id === "not-survey")!;
    expect(survey.group).toBe("editorial");
    expect(survey.pass).toBe(false);
    expect(report.hints.filter((hint) => /조사·통계 방법 서술/.test(hint.problem)).map((hint) => hint.unit)).toEqual(expect.arrayContaining([4, 5]));
  });
});

/* ---------- 화면: 현상 후보 전달 ---------- */
async function seedKia(page: Page, withDiscovery: boolean) {
  const sample = (base.snapshots as unknown as LiveAnalysisSnapshot[])[0];
  const a = (old as unknown as { analyses: Record<string, { analyzedAt: string; report: LiveAnalysisSnapshot["whyReport"]; evidence: LiveAnalysisSnapshot["evidence"]; signalStats: LiveAnalysisSnapshot["signalStats"] }> }).analyses["기아타이거즈"];
  const snapshot = { ...sample, id: "kia", trendId: "live-기아타이거즈", trendName: "기아타이거즈", keywords: ["기아타이거즈"], analyzedAt: a.analyzedAt, whyReport: a.report, evidence: a.evidence, signalStats: a.signalStats, dna: undefined, embedding: null, media: [] };
  const discovery = { id: "disc-kia", keyword: "기아타이거즈", window: { days: 30, from: "2026-10-05", to: "2026-11-04" }, signals: [{ signalId: "s1", parentKeyword: "기아타이거즈", title: "포스트시즌 응원석 색 맞춤", phenomenon: "팬들이 붉은 옷·타월로 응원석 색을 맞춤", audienceBehavior: "붉은 타월을 흔들며 응원", relatedEntities: [], relatedKeywords: [], contentExamples: [], observedPlatforms: ["웹"], evidenceIds: ["WEB-01"], observedDateRange: null, evidenceStrength: "moderate", momentumIndicator: null, verificationStatus: "Observed", inWindowCount: 2, independentSources: 2 }], excluded: [], limitations: [], sources: { youtube: 0, web: 2, webDropped: 0 }, ledger: [], model: "m", generatedAt: "2026-11-04T00:00:00.000Z" };
  await page.goto("/");
  await page.evaluate(({ s, d }) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-live-analyses", JSON.stringify([s])); if (d) localStorage.setItem("trend-radar-discoveries", JSON.stringify([d])); }, { s: snapshot, d: withDiscovery ? discovery : null });
  const calls: Array<{ phenomena?: unknown[] }> = [];
  await page.route("**/api/studio/angles", (route) => { calls.push(route.request().postDataJSON()); return route.fulfill({ json: { cached: false, generatedAt: "2026-11-04T03:00:00.000Z", mode: "editorial", angles: f2.angles["기아타이거즈"].angles.map((item, i) => ({ ...item, focus: ["응원가 한 곡", "아웃송 삐끼삐끼", "광주 우승 퍼레이드", "직관 하루 코스", "시구 장면"][i] })), validation: { ...validateAngles({ angles: f2.angles["기아타이거즈"].angles }, []).validation } } }); });
  return calls;
}

test.describe("E1 · Content Studio sends WHAT'S HAPPENING NOW? phenomena with the angle request", () => {
  test("phenomena from the latest discovery of this keyword are sent (no evidence ids); none when there is no discovery; focus is shown on angle cards", async ({ page }) => {
    const calls = await seedKia(page, true);
    const paid: string[] = [];
    page.on("request", (request) => { if (/\/api\/(analyze|dna|collision|lab|studio\/production|images|discover)$/.test(new URL(request.url()).pathname)) paid.push(request.url()); });
    await page.goto(`/studio?trend=${encodeURIComponent("live-기아타이거즈")}`);
    await page.getByTestId("angles-generate").click();
    await expect(page.getByTestId("angle-card")).toHaveCount(5);
    expect(calls[0].phenomena).toEqual([{ title: "포스트시즌 응원석 색 맞춤", behavior: "붉은 타월을 흔들며 응원", status: "Observed", independentSources: 2 }]);
    await expect(page.getByTestId("angle-focus").first()).toContainText("초점 · 응원가 한 곡");
    await expect(page.getByTestId("angles-check")).toContainText("키워드 역사·입문 방향");
    expect(paid).toEqual([]);
    const none = await seedKia(page, false);
    await page.goto(`/studio?trend=${encodeURIComponent("live-기아타이거즈")}`);
    await page.getByTestId("angles-generate").click();
    await expect(page.getByTestId("angle-card")).toHaveCount(5);
    expect(none[0].phenomena).toEqual([]);
  });

  test("the angles API validates phenomena before any AI call", async ({ request }) => {
    const response = await request.post("/api/studio/angles", { data: { trends: [], concept: { title: "x" }, mode: "editorial", settings: { format: "cardnews" }, phenomena: [{ title: "x", status: "Viral" }] } });
    expect(response.status()).toBe(400);
  });
});

/* ---------- E1 브리프 · E2 스토리보드 · E4 사용자 평가 ---------- */

test.describe("E1 brief fields and E2 storyboard", () => {
  test("the prompts ask for editorial_type / reader_value / key_scene per angle and new_information / scene per slide; every editorial type has a structure", () => {
    const angles = fs.readFileSync("lib/openai-editorial.ts", "utf8"), production = fs.readFileSync("lib/openai-production.ts", "utf8");
    expect(angles).toMatch(/editorial_type: js\.enumOf\(editorialTypes\), reader_value: js\.enumOf\(readerValueTypes\), key_scene: js\.str/);
    expect(production).toMatch(/new_information: js\.str, scene: js\.obj\(\{ subject: js\.str, action: js\.str, object: js\.str \}\)/);
    expect(production).toContain("EDITORIAL TYPE (from the brief)");
    for (const type of editorialTypes) expect(editorialTypeStructure[type].length).toBeGreaterThan(40);
    expect(editorialTypeStructure.comparison).toContain("not a first-person review");
  });

  test("the image brief uses the slide's own storyboard scene before the lock or the title", () => {
    const brief = slideImageBrief({ type: "detail", headline: "하늘색 우비로 물든 응원석", scene: { subject: "anonymous fans in the stands", action: "wearing matching sky-blue raincoats", object: "rain ponchos handed out at the gate" } }, { title: "붉은 타월 옆, 하늘색 우비 관중석" });
    expect(brief).toMatchObject({ subject: "anonymous fans in the stands", action: "wearing matching sky-blue raincoats", object: "rain ponchos handed out at the gate" });
    const fallback = slideImageBrief({ type: "detail", headline: "h" }, { title: "제목" });
    expect(fallback.subject).toBe("제목");
  });

  test("storyboard new_information that repeats an earlier slide is flagged (recorded T6 after: four slides end on the same point)", () => {
    const recorded = (t6 as unknown as { after: { production: { plan: ProductionPlan } } }).after.production.plan;
    const info = ["가상 메이크업을 현실 얼굴에 재현하는 영상이 있다", "속눈썹이 현실 재현에서도 눈에 띄는 포인트다", "네온 색과 라인이 현실 재현에서도 눈에 띄는 포인트다", "그래픽 요소가 현실 재현에서도 눈에 띄는 포인트다", "입술도 현실 재현의 포인트다", "각자 추구미로 해석한다"];
    const report = editorialQualityGate({ ...recorded, slides: recorded.slides.map((slide, i) => ({ ...slide, new_information: info[i] })) }, { subjectTerms: ["로블록스"] });
    const check = report.checks.find((item) => item.id === "progressive")!;
    expect(check.group).toBe("editorial");
    expect(check.pass).toBe(false);
    expect(report.hints.some((hint) => /같은 정보를 반복/.test(hint.problem))).toBe(true);
    const distinct = ["재현 영상이 있다", "가장 먼저 속눈썹을 키운다", "네온 섀도는 눈두덩 전체에 넓게 바른다", "눈가 그래픽 선은 아이라이너로 그린다", "입술은 그러데이션으로 마무리한다", "추구미에 따라 결과가 다르다"];
    const good = editorialQualityGate({ ...recorded, slides: recorded.slides.map((slide, i) => ({ ...slide, new_information: distinct[i] })) }, { subjectTerms: ["로블록스"] });
    expect(good.checks.find((item) => item.id === "progressive")!.pass).toBe(true);
    // 스토리보드가 없는 이전 계획에는 이 신호를 만들지 않는다.
    expect(editorialQualityGate(recorded, { subjectTerms: ["로블록스"] }).checks.some((item) => item.id === "progressive")).toBe(false);
  });
});

test.describe("E4 user rating in Content Studio", () => {
  test("brief fields show on angle cards; the user's own 1-5 rating is saved apart from the AI review scores and survives a reload", async ({ page }) => {
    const sample = (base.snapshots as unknown as LiveAnalysisSnapshot[])[0];
    const recorded = (t8 as unknown as { D: { production: { plan: ProductionPlan } } }).D.production.plan;
    const project = { id: "studio-v3-rating", mode: "single", title: "KIA", source: { trendKeys: [sample.trendId], trendNames: [sample.trendName] }, settings: { format: "cardnews", aspect: "4:5", slideCount: 6, durationSec: 30, target: "", tone: "", brand: "", goal: "", cta: "", mode: "editorial" }, plan: recorded, assets: [], edited: false, createdAt: "2026-11-04T00:00:00.000Z", updatedAt: "2026-11-04T00:00:00.000Z",
      angles: { items: [{ ...f2.angles["기아타이거즈"].angles[1], focus: "아웃송 삐끼삐끼", editorial_type: "micro", reader_value: "learn", key_scene: "아웃 직후 응원석이 일제히 춤추는 장면" }], mode: "editorial", validation: { removedEvidenceIds: [], genericTitles: [], droppedDuplicates: [], downgradedFit: 0 }, model: "m", generatedAt: "2026-11-04T00:00:00.000Z" },
      review: { source: "ai-review", model: "m", reviewedAt: "2026-11-04T00:00:00.000Z", scores: { hook: 4, specificity: 4, story: 3, save_share: 3, voice: 4 }, summary: "AI 요약", patched: [], before: { passed: 7, total: 7, failing: [] } } };
    await page.goto("/");
    await page.evaluate((value) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-studio-projects", JSON.stringify([value])); }, project);
    await page.goto(`/studio?project=${project.id}`);
    await expect(page.getByTestId("angle-brief")).toContainText("E 마이크로 현상 · 독자 가치: 알게 됨 · 대표 장면: 아웃 직후 응원석이 일제히 춤추는 장면");
    await page.getByTestId("editor-notes").locator("summary").click();
    await expect(page.getByTestId("editorial-review")).toContainText("AI 참고 점수(사용자 평가 아님)");
    await expect(page.getByTestId("user-rating-save")).toBeDisabled();
    await page.getByTestId("user-rating-specificity").selectOption("5");
    await page.getByTestId("user-rating-flow").selectOption("2");
    await page.getByTestId("user-rating-note").fill("3·4번이 같은 결론");
    await page.getByTestId("user-rating-save").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]")[0]?.userRating)).toMatchObject({ source: "user", scores: { specificity: 5, flow: 2 }, note: "3·4번이 같은 결론", planTitle: recorded.title });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]")[0]);
    expect(stored.review.scores).toEqual({ hook: 4, specificity: 4, story: 3, save_share: 3, voice: 4 }); // AI 점수는 그대로(섞지 않음)
    await page.reload();
    await page.getByTestId("editor-notes").locator("summary").click();
    await expect(page.getByTestId("user-rating-specificity")).toHaveValue("5");
    await expect(page.getByTestId("user-rating")).toContainText("사용자 평가(AI 점수와 별개");
  });
});
