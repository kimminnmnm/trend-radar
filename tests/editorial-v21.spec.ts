import { expect, test, type Page } from "@playwright/test";
import v21 from "./fixtures/editorial-engine-v21.json";
import v2 from "./fixtures/editorial-engine-v2.json";
import old from "./fixtures/editorial-studio.json";
import base from "./fixtures/live-pipeline.json";
import cv from "./fixtures/culture-validation.json";
import { defaultSettings, validateProduction, type ProductionPlan } from "../lib/content-production";
import { titleStructure, validateAngles, needsAngleRegeneration, type ContentAngle } from "../lib/editorial";
import { applyPatches, editorialQualityGate, revertRegressions, type EditorialReview } from "../lib/editorial-quality";
import type { LiveAnalysisSnapshot } from "../lib/types";

/*
 * EDITORIAL ENGINE V2.1. 픽스처 editorial-engine-v21.json(2026-11-02 실측). 실패했던 세 소재(헤이세이 레트로·디지털카메라·치이카와)는
 * V2와 같은 방향을 다시 써서 V2 결과(editorial-engine-v2.json)와 비교한다. 발레코어·레트로 게임은 처음 쓴 소재(일반화 확인).
 * 규칙 검사(필수 검증)와 AI 참고 점수(편집 리뷰)는 사용자 평가가 아니다. 방향 선택은 실험자가 했다.
 */
type Produced = { angle: ContentAngle; plan: ProductionPlan; review: EditorialReview | null; quality: { passed: number; total: number; failing: string[] } | null; references: Array<{ id: string; title: string; excerpt: string }> };
const after = (v21 as unknown as { productions: Record<string, Produced>; angles: Record<string, { angles: ContentAngle[]; validation: { regenerated?: boolean } }> });
const before = (v2 as unknown as { productions: Record<string, { plan: ProductionPlan }> }).productions;
const snaps = (cv as unknown as { snapshots: LiveAnalysisSnapshot[] }).snapshots;
const termsOf = (name: string) => { const s = snaps.find((item) => item.trendName === name); return s ? [s.trendName, ...s.keywords] : [name]; };
const copy = (plan: ProductionPlan) => plan.slides.map((slide) => `${slide.headline} ${slide.body}`).join("\n");
const gate = (key: string, name: string) => { const p = after.productions[key]; return editorialQualityGate(p.plan, { subjectTerms: termsOf(name), angle: p.angle, vocabulary: p.references.flatMap((item) => [item.title, item.excerpt]) }); };

test.describe("PHASE 1·2 detail bank → specific slides (recorded, same angles as V2)", () => {
  test("헤이세이 레트로: V2 generic binder tips → V2.1 named products and Heisei-era characters, all bank items sourced", () => {
    const was = copy(before.heisei.plan), now = after.productions.heisei;
    expect(was).not.toMatch(/산리오|미도리|타레판다|코게빵|리락쿠마/);
    expect(copy(now.plan)).toMatch(/산리오/);
    expect(copy(now.plan)).toMatch(/미도리/);
    expect(copy(now.plan)).toMatch(/타레판다|코게빵|리락쿠마/);
    expect(now.plan.detail_bank!.length).toBeGreaterThanOrEqual(6);
    expect(now.plan.detail_bank!.every((item) => item.status === "verified" && item.source_ids.length > 0)).toBe(true);
  });

  test("디지털카메라: V2 any-camera walk tips → V2.1 real routes, distances and a named camera model", () => {
    expect(copy(before.camera.plan)).not.toMatch(/경춘선|거울연못|EOS/);
    const now = copy(after.productions.camera.plan);
    expect(now).toMatch(/경춘선 숲길/);
    expect(now).toMatch(/6km/);
    expect(now).toMatch(/거울연못/);
    expect(now).toMatch(/EOS M50/);
  });

  test("치이카와: the kana mix-in from V2 is gone (language check passes) and details are dated and named", () => {
    expect(copy(before.chiikawa.plan)).toMatch(/[぀-ヿ]/);
    for (const key of ["chiikawa", "chiikawa2"]) {
      expect(gate(key, "치이카와").failing).not.toContain("language");
      expect(copy(after.productions[key].plan).replace(/[「『‘'“"(（][^」』’'”")）]*[」』’'”")）]/g, "")).not.toMatch(/[぀-ヿ]/);
    }
    expect(copy(after.productions.chiikawa2.plan)).toMatch(/메자마시TV|나가노/);
  });

  test("every middle slide uses a different bank item and the server mapped ids to D1..Dn", () => {
    for (const key of ["heisei", "camera", "chiikawa2", "ballet", "retrogame2"]) {
      const plan = after.productions[key].plan;
      const bankIds = new Set(plan.detail_bank!.map((item) => item.id));
      expect([...bankIds].every((id) => /^D\d+$/.test(id)), key).toBe(true);
      const middle = plan.slides.slice(1, -1);
      expect(middle.every((slide) => (slide.detail_ids ?? []).length > 0 && slide.detail_ids!.every((id) => bankIds.has(id))), key).toBe(true);
      const sets = middle.map((slide) => slide.detail_ids!.join(","));
      expect(new Set(sets).size, key).toBe(sets.length);
    }
  });

  test("unused subjects generalize: 발레코어 and 레트로 게임 get dated, named details with sourced banks", () => {
    expect(copy(after.productions.ballet.plan)).toMatch(/1941|브릴랜드/);
    expect(copy(after.productions.ballet.plan)).toMatch(/샤넬|Le Train bleu/);
    expect(gate("ballet", "발레코어").failing).toEqual([]);
    expect(copy(after.productions.retrogame2.plan)).toMatch(/Famicom Music|Ground Theme|슈퍼 마리오/);
    expect(after.productions.retrogame2.plan.detail_bank!.every((item) => item.status === "verified")).toBe(true);
  });
});

test.describe("PHASE 3 hook diversity", () => {
  test("title structures are classified and only real templates count as crowding (the catch-all 'statement' does not)", () => {
    expect(titleStructure("헤이세이 레트로, 뭘 보면 될까?")).toBe("subject-comma-question");
    expect(titleStructure("발레 플랫 대신 발레슈즈 닮은 운동화")).toBe("contrast");
    expect(titleStructure("게임 음악만 듣는 밤, 55분 플레이리스트")).toBe("number-list");
    expect(titleStructure("픽셀 화면 앞에서 첫 판 시작하기")).toBe("howto");
    expect(titleStructure("무대의 튀튀가 거리로 나오기까지")).toBe("statement");
    const angle = (title: string, type: ContentAngle["angle_type"]): ContentAngle => ({ angle_id: "x", title, hook: "", editorial_perspective: title, target_audience: "", reader_benefit: "", content_structure: [], suggested_visuals: [], research_requirements: [], evidence_ids: [], evidence_fit: "partial", angle_type: type, research_anchor: "" });
    const templated = validateAngles({ angles: [angle("헤이세이 레트로, 뭘 보면 될까?", "guide"), angle("스티커, 어떻게 모을까?", "curation"), angle("바인더 꾸미기 순서", "howto"), angle("프리쿠라의 한 장면", "experience")] }, []);
    expect(templated.validation.crowdedStructures).toEqual(["subject-comma-question"]);
    expect(needsAngleRegeneration(templated)).toBe(true);
    // 실측 v4 방향(발레코어·레트로 게임): 구체적인 서술형 제목 4개 — 이제 몰림이 아니다(이전 분류는 이것 때문에 불필요한 재생성 2회).
    for (const keyword of ["발레코어", "레트로 게임"]) {
      expect(validateAngles({ angles: after.angles[keyword].angles }, []).validation.crowdedStructures).toEqual([]);
    }
  });

  test("the editorial review is the judge of hooks: titles were changed by the review only where it chose to", () => {
    const retro = after.productions.retrogame.review!;
    expect(retro.source).toBe("ai-review");
    expect(retro.titleChange).toBeDefined();
    for (const key of Object.keys(after.productions)) {
      const scores = Object.values(after.productions[key].review!.scores);
      expect(scores.every((score) => score >= 1 && score <= 5), key).toBe(true);
    }
  });
});

test.describe("PHASE 4 required checks vs editorial review (rules, not user ratings)", () => {
  test("the gate splits required (facts·topic·language·evidence·duplicate) from editorial signals; only required failures count", () => {
    const report = gate("ballet", "발레코어");
    expect(report.checks.filter((check) => check.group === "required").map((check) => check.id)).toEqual(["facts", "topic", "language", "evidence", "duplicate", "experience", "virality"]); // V3(E4): 허위 경험·근거 없는 유행 주장 추가
    expect(report.checks.filter((check) => check.group === "editorial").map((check) => check.id)).toEqual(["specific", "detail-use", "not-report", "not-survey", "title", "flow"]); // V3: 조사·통계 서술 신호
    expect(report.total).toBe(7);
    // 원어는 「」 안이면 허용한다(곡명·작품명).
    const quoted: ProductionPlan = { ...after.productions.ballet.plan, slides: after.productions.ballet.plan.slides.map((slide, index) => index === 1 ? { ...slide, body: "「ゆるかわ」(느슨한 귀여움)이라는 말이 있어요." } : slide) };
    expect(editorialQualityGate(quoted, { subjectTerms: ["발레코어"] }).failing).not.toContain("language");
    const bare = { ...quoted, slides: quoted.slides.map((slide, index) => index === 1 ? { ...slide, body: "ゆるかわ 느낌이에요." } : slide) };
    expect(editorialQualityGate(bare, { subjectTerms: ["발레코어"] }).failing).toContain("language");
  });

  test("the server decides bank status: invented source ids become needs_check, and slide detail ids follow the renumbering", () => {
    const plan = { ...after.productions.ballet.plan, detail_bank: [{ id: "x1", detail: "1941년 브릴랜드", example: "e", use: "u", source_ids: ["T1:AR-01"], status: "verified" as const }, { id: "x2", detail: "가짜 근거", example: "e", use: "u", source_ids: ["T1:FAKE-9"], status: "verified" as const }], slides: after.productions.ballet.plan.slides.map((slide) => ({ ...slide, detail_ids: ["x2", "x1"], review: undefined })) };
    const { plan: checked, validation } = validateProduction(plan, defaultSettings("cardnews"), ["T1:AR-01"], []);
    expect(checked.detail_bank!.map((item) => [item.id, item.status])).toEqual([["D1", "verified"], ["D2", "needs_check"]]);
    expect(checked.slides[0].detail_ids).toEqual(["D2", "D1"]);
    expect(validation.removedEvidenceIds).toContain("T1:FAKE-9");
  });

  test("patches touch only the named slides and the title; a patch that adds a new problem is reverted to the draft", () => {
    const draft = after.productions.ballet.plan;
    const target = draft.slides[2];
    const { plan: patched, patched: log, titleChange } = applyPatches(draft, [{ number: 3, headline: "튀튀가 드레스로", body: "ゆるい 느낌으로 1930년대 초 이브닝드레스가 됐어요.", supporting_text: "", fact_checks: [], detail_ids: target.detail_ids ?? [], reason: "구체화" }], "새 제목");
    expect(log.map((item) => item.unit)).toEqual([3, "title"]);
    expect(titleChange).toEqual({ from: draft.title, to: "새 제목" });
    expect(patched.slides.filter((slide, index) => slide !== draft.slides[index]).map((slide) => slide.number)).toEqual([3]);
    const terms = { subjectTerms: ["발레코어"] };
    const { plan: guarded, reverted } = revertRegressions(draft, patched, editorialQualityGate(draft, terms), editorialQualityGate(patched, terms));
    expect(reverted.map((item) => item.unit)).toEqual([3]);
    expect(reverted[0].problems.join()).toMatch(/일본어/);
    expect(guarded.slides[2]).toBe(target);
    expect(guarded.title).toBe("새 제목");
  });

  test("recorded: before the guard the review put kana into 레트로 게임's cover; after the guard both reruns pass required checks", () => {
    expect(after.productions.retrogame.quality!.failing).toContain("language");
    expect(after.productions.retrogame.review!.patched.some((item) => item.unit === 1)).toBe(true);
    for (const key of ["retrogame2", "chiikawa2", "ballet"]) expect(after.productions[key].quality!.failing, key).toEqual([]);
    // 남은 실패도 기록대로 보고한다: 헤이세이·디카는 소재 틀(이름)을 드러내지 않아 '주제 일치' 실패.
    expect(after.productions.heisei.quality!.failing).toEqual(["topic"]);
    expect(after.productions.camera.quality!.failing).toEqual(["topic"]);
  });
});

/* ---------- 화면: Detail Bank · 필수/편집 분리 · AI 참고 점수 · 되돌림 표시 ---------- */

async function seed(page: Page) {
  const sample = (base.snapshots as unknown as LiveAnalysisSnapshot[])[0];
  const a = (old as unknown as { analyses: Record<string, { analyzedAt: string; report: LiveAnalysisSnapshot["whyReport"]; evidence: LiveAnalysisSnapshot["evidence"]; signalStats: LiveAnalysisSnapshot["signalStats"] }> }).analyses["기아타이거즈"];
  await page.goto("/");
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-live-analyses", JSON.stringify([s])); }, { ...sample, id: "kia", trendId: "live-기아타이거즈", trendName: "기아타이거즈", keywords: ["기아타이거즈"], analyzedAt: a.analyzedAt, whyReport: a.report, evidence: a.evidence, signalStats: a.signalStats, dna: undefined, embedding: null, media: [] });
  const p = after.productions.retrogame2;
  const calls: Array<{ research?: boolean }> = [];
  await page.route("**/api/studio/production", (route) => { calls.push(route.request().postDataJSON()); return route.fulfill({ json: { mode: "live", cached: false, generatedAt: "2026-11-02T04:00:00.000Z", promptVersion: "studio-production-v4", model: "recorded", plan: p.plan, validation: { removedEvidenceIds: [], removedImageRefs: 0, slideCountAdjusted: false, downgradedClaims: 0, timingFixed: 0 }, quality: editorialQualityGate(p.plan, { subjectTerms: ["레트로 게임"], angle: p.angle }), review: { ...p.review, reverted: [{ unit: 4, problems: ["한국어 문장에 일본어·한자가 섞임"] }] }, research: { requested: true, status: "live", count: 7 }, references: p.references } }); });
  return calls;
}

test.describe("PHASE 4 Content Studio display", () => {
  test("angle research is on by default; notes show the detail bank, required vs editorial groups, AI reference scores and reverted slides", async ({ page }) => {
    const calls = await seed(page);
    await page.goto(`/studio?trend=${encodeURIComponent("live-기아타이거즈")}`);
    await page.getByTestId("custom-topic").fill("게임 음악만 듣는 밤");
    await page.getByTestId("custom-topic-use").click();
    await expect(page.getByTestId("angle-research")).toBeChecked();
    await page.getByTestId("production-generate").click();
    await expect(page.getByTestId("production-slide")).toHaveCount(6);
    expect(calls[0].research).toBe(true);
    await expect(page.getByTestId("slide-revised").first()).toBeVisible();
    await page.getByTestId("editor-notes").locator("summary").click();
    await expect(page.getByTestId("notes-detail-bank")).toContainText("D1");
    await expect(page.getByTestId("quality-gate")).toContainText("A. 필수 검증");
    await expect(page.getByTestId("quality-gate")).toContainText("B. 편집 신호");
    await expect(page.getByTestId("editorial-review")).toContainText("AI 참고 점수(사용자 평가 아님)");
    await expect(page.getByTestId("review-reverted")).toContainText("4번");
  });
});
