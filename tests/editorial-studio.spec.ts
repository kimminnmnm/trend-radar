import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import fixture from "./fixtures/editorial-studio.json";
import base from "./fixtures/live-pipeline.json";
import { defaultSettings, productionPlanSchema, validateProduction, type ProductionPlan, type StudioProject } from "../lib/content-production";
import { contentAngleSchema, findReportPhrases, isGenericTitle, REPORT_PHRASES, stripInternalRefs, validateAngles, type ContentAngle } from "../lib/editorial";
import { toFigmaExport } from "../lib/figma-export";
import type { LiveAnalysisSnapshot } from "../lib/types";

/*
 * CONTENT STUDIO EDITORIAL REDESIGN (E0~E7).
 * 픽스처: 2026-11-02 실측(editorial-studio.json) — 기아타이거즈·치이카와 디저트 WHY 분석(Instagram 제외), 5개 소재 방향 제안,
 * 기아타이거즈 개선 전(v1 프롬프트 재현)·후, 보컬로이드·Creative 콘셉트 카드뉴스. 화면 테스트는 이 응답을 재사용하고 API를 다시 부르지 않는다.
 * 품질 판단은 규칙 검사(보고서식 표현·뻔한 제목·중복·근거)이며, 사용자 평가가 아니다.
 */
type Angles = { promptVersion: string; mode: string; model: string; angles: ContentAngle[]; validation: { genericTitles: string[] } };
type Produced = { promptVersion: string; model: string; plan: ProductionPlan; validation: StudioProject["validation"]; references: unknown[] };
const f = fixture as unknown as {
  analyses: Record<string, { analyzedAt: string; report: LiveAnalysisSnapshot["whyReport"]; evidence: NonNullable<LiveAnalysisSnapshot["evidence"]>; signalStats: LiveAnalysisSnapshot["signalStats"] }>;
  kia: { before: { plan: ProductionPlan }; angles: Angles; selectedAngle: number; after: Produced };
  angles: Record<string, Angles>;
  vocaloid: { selectedAngle: number; after: Produced };
  concept: { angles: Angles; selectedAngle: number; after: Produced };
};
const publishText = (plan: ProductionPlan) => [...plan.slides.flatMap((slide) => [slide.headline, slide.body, slide.supporting_text, slide.cta]), ...plan.scenes.flatMap((scene) => [scene.on_screen_text, scene.voice_over]), plan.caption].join("\n");
const subjects = ["기아타이거즈", "보컬로이드", "헤이세이 레트로", "디지털카메라", "치이카와 디저트"] as const;
const anglesOf = (subject: (typeof subjects)[number]) => subject === "기아타이거즈" ? f.kia.angles : f.angles[subject];

test.describe("E0·E7 recorded before/after (no browser)", () => {
  test("before: the v1 prompt turned 기아타이거즈 into a search-interest report; after: an editorial piece without report phrases", () => {
    const before = f.kia.before.plan, after = f.kia.after.plan;
    expect(productionPlanSchema.safeParse(after).success).toBe(true);
    const beforeHits = findReportPhrases(publishText(before));
    expect(before.title).toContain("검색 관심도");
    expect(beforeHits.length).toBeGreaterThanOrEqual(3);
    expect(publishText(before)).toMatch(/지수|상대 검색/);
    expect(findReportPhrases(publishText(after))).toEqual([]);
    expect(publishText(after)).not.toMatch(/검색 관심도|검색량|지수 100/);
    expect(after.title).toBe(f.kia.angles.angles[f.kia.selectedAngle].title);
    expect(after.slides).toHaveLength(6);
    // 슬라이드 전개가 고정 패턴(body×4)이 아니다.
    expect(new Set(after.slides.map((slide) => slide.type)).size).toBeGreaterThanOrEqual(5);
    expect(before.slides.filter((slide) => slide.type === "body").length).toBeGreaterThanOrEqual(3);
    // 게시용 캡션에 내부 근거 ID가 없고, 검증 정보는 Editor Notes에 있다.
    expect(after.caption).not.toMatch(/T\d+:[A-Z]+-\d+/);
    expect(after.editor_notes?.fact_checks.length).toBeGreaterThan(0);
    expect(after.slides.some((slide) => (slide.fact_checks ?? []).length > 0)).toBe(true);
  });

  test("each subject gets 5 distinct, subject-specific angles with no template titles", () => {
    const all: string[] = [];
    for (const subject of subjects) {
      const result = anglesOf(subject);
      expect(result.angles).toHaveLength(5);
      expect(result.angles.every((angle) => contentAngleSchema.safeParse(angle).success)).toBe(true);
      expect(new Set(result.angles.map((angle) => angle.title)).size).toBe(5);
      expect(result.validation.genericTitles).toEqual([]);
      expect(result.angles.every((angle) => !/검색\s*(관심도|량)|지수/.test(`${angle.title} ${angle.hook}`))).toBe(true);
      all.push(...result.angles.map((angle) => angle.title));
    }
    expect(new Set(all).size).toBe(all.length);
  });

  test("the cross-subject template '<subject>, 어디서 …' found in v1 angles is now detected, and the v2 rerun avoids it", () => {
    const v1 = subjects.flatMap((subject) => anglesOf(subject).angles.map((angle) => angle.title)).filter(isGenericTitle);
    expect(v1).toEqual(["기아 타이거즈, 어디서 왔을까?", "헤이세이 레트로, 어디서 시작할까", "구형 디카, 어디서 만날까", "치이카와 디저트, 어디서 만났을까?"]);
    const v2 = f.angles["헤이세이 레트로 v2"];
    expect(v2.promptVersion).toBe("studio-angles-v2");
    expect(v2.angles.filter((angle) => isGenericTitle(angle.title))).toEqual([]);
  });

  test("Creative concept stays a concept proposal; vocaloid digging piece cites sources only in editor notes", () => {
    const concept = f.concept.after.plan;
    expect(concept.concept_notice).toMatch(/콘셉트 제안/);
    expect(concept.concept_notice).toMatch(/실제 운영 중인 .*아니에요|공식 협업이 아니에요/);
    expect(publishText(concept)).not.toMatch(/출시|판매 중|오픈했/);
    expect(f.concept.angles.angles.every((angle) => /다면|상상|가상|콘셉트|따라가요|역할|동작/.test(`${angle.title} ${angle.hook}`))).toBe(true);
    const vocaloid = f.vocaloid.after.plan;
    expect(findReportPhrases(publishText(vocaloid))).toEqual([]);
    expect(f.vocaloid.after.references.length).toBeGreaterThan(0);
    expect(publishText(vocaloid)).not.toMatch(/T\d+:[A-Z]+-\d+/);
  });
});

test.describe("E2·E3·E5 server validation (no browser)", () => {
  const angle = (title: string, extra: Partial<ContentAngle> = {}): ContentAngle => ({ angle_id: "x", title, hook: "h", editorial_perspective: `${title} 관점`, target_audience: "t", reader_benefit: "b", content_structure: ["a"], suggested_visuals: [], research_requirements: [], evidence_ids: [], evidence_fit: "partial", ...extra });

  test("angles: invented evidence ids are removed and 'grounded' is downgraded, repeats are dropped, template titles are flagged", () => {
    const { angles, validation } = validateAngles({ angles: [
      angle("삐끼삐끼는 아웃송에서 시작", { evidence_ids: ["T1:WEB-01", "T1:FAKE-99"], evidence_fit: "grounded" }),
      angle("삐끼삐끼는 아웃송에서 시작했어요"),
      angle("요즘 뜨는 기아타이거즈"),
      angle("기아타이거즈 트렌드 완벽 분석", { evidence_ids: ["T1:FAKE-1"], evidence_fit: "grounded" }),
    ] }, ["T1:WEB-01"]);
    expect(angles.map((item) => item.angle_id)).toEqual(["angle-1", "angle-2", "angle-3"]);
    expect(angles[0]).toMatchObject({ evidence_ids: ["T1:WEB-01"], evidence_fit: "grounded" });
    expect(angles[2]).toMatchObject({ evidence_ids: [], evidence_fit: "needs_research" });
    expect(validation).toMatchObject({ removedEvidenceIds: ["T1:FAKE-99", "T1:FAKE-1"], droppedDuplicates: ["삐끼삐끼는 아웃송에서 시작했어요"], downgradedFit: 1 });
    expect(validation.genericTitles).toEqual(["요즘 뜨는 기아타이거즈", "기아타이거즈 트렌드 완벽 분석"]);
  });

  const slide = (n: number, extra: Partial<ProductionPlan["slides"][number]> = {}) => ({ slide_id: `s${n}`, number: n, type: n === 1 ? "cover" as const : "story" as const, headline: `헤드 ${n}`, body: "본문", supporting_text: "", visual_direction: "v", image_ref: "", image_prompt: "p", layout_hint: "l", cta: "", evidence_ids: [], ...extra });
  const planWith = (slides: ProductionPlan["slides"], caption = "캡션"): ProductionPlan => ({ title: "t", concept_notice: "", summary: "s", claims: [], slides, scenes: [], caption, hashtags: ["#야구 [T1:WEB-01]"], verify_before_publishing: [] });

  test("production: internal ids are stripped from publishing copy, unsupported facts mark the slide for review, report phrases are flagged outside REPORT", () => {
    const raw = planWith([
      slide(1, { body: "2024년 통합 우승 [T1:WEB-01] 이후 퍼레이드가 열렸어요 (근거: T1:WEB-02).", fact_checks: [{ text: "2024년 통합 우승", evidence_ids: ["T1:WEB-01"], status: "Verified Signal" }] }),
      slide(2, { body: "관중이 30만 명이었어요.", fact_checks: [{ text: "관중 30만 명", evidence_ids: ["T1:FAKE"], status: "Supported Hypothesis" }] }),
      slide(3, { body: "상대 검색 관심도가 올랐어요." }),
      slide(4),
    ], "우승 퍼레이드 이야기 T1:WEB-01");
    const { plan, validation } = validateProduction(raw, defaultSettings("cardnews"), ["T1:WEB-01", "T1:WEB-02"], []);
    expect(plan.slides[0].body).toBe("2024년 통합 우승 이후 퍼레이드가 열렸어요.");
    expect(plan.caption).toBe("우승 퍼레이드 이야기");
    expect(plan.hashtags).toEqual(["#야구"]);
    expect(plan.slides[1].review).toEqual(["검증 필요: 관중 30만 명"]);
    expect(plan.slides[1].fact_checks?.[0].status).toBe("Insufficient Evidence");
    expect(validation).toMatchObject({ needsReview: [2], removedEvidenceIds: ["T1:FAKE"], reportPhrases: [{ unit: 3, phrase: "상대 검색 관심도" }] });
    expect(validation.strippedRefs).toBeGreaterThanOrEqual(2);
    // TREND REPORT 모드에서는 분석 표현이 정상이다.
    expect(validateProduction(raw, defaultSettings("cardnews", "report"), ["T1:WEB-01"], []).validation.reportPhrases).toEqual([]);
  });

  test("concept mode always carries a concept notice; v1 plans without new fields still validate", () => {
    const { plan, validation } = validateProduction(planWith([slide(1), slide(2), slide(3), slide(4)]), defaultSettings("cardnews", "concept"), [], [], { concept: true });
    expect(plan.concept_notice).toMatch(/가상의 콘셉트 제안/);
    expect(validation.conceptNoticeAdded).toBe(true);
    const v1 = f.kia.before.plan;
    expect(productionPlanSchema.safeParse(v1).success).toBe(true);
    const legacy = validateProduction(v1, { ...defaultSettings("cardnews"), mode: undefined }, [], []);
    expect(legacy.plan.slides).toHaveLength(6);
    expect(stripInternalRefs("[YT-01, YT-02] 좋아요").text).toBe("좋아요");
    expect(REPORT_PHRASES).toContain("상대 검색 관심도");
  });

  test("Figma export separates publishing copy and editor notes; the plugin makes two side frames and still reads old JSON", () => {
    const plugin = createRequire(__filename)("../figma-plugin/code.js") as { buildFigmaPlan: (data: unknown) => { errors: string[]; publishing: { text: string; name: string }; notes: { text: string; name: string } } };
    const project: StudioProject = { id: "studio-single-kia", mode: "single", title: "기아타이거즈", source: { trendKeys: ["live-기아타이거즈"], trendNames: ["기아타이거즈"] }, settings: defaultSettings("cardnews"), plan: f.kia.after.plan, validation: f.kia.after.validation, angle: f.kia.angles.angles[1], assets: [], edited: false, createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z" };
    const exported = toFigmaExport(project, "2026-11-02T00:00:00.000Z");
    expect(exported.project).toMatchObject({ contentMode: "editorial", contentModeLabel: "TREND EDITORIAL", angle: { title: "삐끼삐끼는 아웃송에서 시작" } });
    expect(exported.editorNotes.factChecks.length).toBeGreaterThan(0);
    const plan = plugin.buildFigmaPlan(exported);
    expect(plan.errors).toEqual([]);
    expect(plan.publishing.name).toMatch(/^PUBLISHING/);
    expect(plan.publishing.text).toContain(f.kia.after.plan.caption.split("\n")[0]);
    expect(plan.publishing.text).not.toMatch(/게시 전 확인|근거 ID|T\d+:/);
    expect(plan.notes.name).toMatch(/^EDITOR NOTES · 게시 안 함/);
    expect(plan.notes.text).toContain("게시 전 확인");
    expect(plan.notes.text).toContain("방향: 삐끼삐끼는 아웃송에서 시작");
    // 이전 형식(editorNotes·contentMode 없음)도 읽는다.
    const legacy = { ...exported, editorNotes: undefined, project: { ...exported.project, contentMode: undefined, contentModeLabel: undefined, angle: undefined } };
    const old = plugin.buildFigmaPlan(legacy);
    expect(old.errors).toEqual([]);
    expect(old.notes.text).toContain("이미지 출처·권리");
  });
});

/* ---------- 화면(실측 응답 재사용) ---------- */

const kiaSnapshot = (): LiveAnalysisSnapshot => {
  const sample = (base.snapshots as unknown as LiveAnalysisSnapshot[])[0];
  const a = f.analyses["기아타이거즈"];
  return { ...sample, id: "kia", trendId: "live-기아타이거즈", trendName: "기아타이거즈", keywords: ["기아타이거즈"], analyzedAt: a.analyzedAt, whyReport: a.report, evidence: a.evidence, signalStats: a.signalStats, dna: undefined, dnaGeneratedAt: undefined, embedding: null, media: [], summary: "기아타이거즈" } as LiveAnalysisSnapshot;
};
async function seedKia(page: Page) {
  await page.goto("/");
  await page.evaluate((snapshot) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-live-analyses", JSON.stringify([snapshot])); }, kiaSnapshot());
  const calls = { angles: [] as Array<{ mode: string }>, production: [] as Array<{ angle?: ContentAngle; settings: { mode?: string } }> };
  await page.route("**/api/studio/angles", (route) => { calls.angles.push(route.request().postDataJSON()); return route.fulfill({ json: { cached: false, generatedAt: "2026-11-02T02:00:00.000Z", ...f.kia.angles } }); });
  await page.route("**/api/studio/production", (route) => { calls.production.push(route.request().postDataJSON()); return route.fulfill({ json: { mode: "live", cached: false, generatedAt: "2026-11-02T02:01:00.000Z", ...f.kia.after } }); });
  return calls;
}

test.describe("E1·E2·E5 Content Studio flow", () => {
  test("TREND EDITORIAL is the default, generation waits for an angle, and the output separates publishing content from collapsed editor notes", async ({ page }) => {
    const calls = await seedKia(page);
    await page.goto(`/studio?trend=${encodeURIComponent("live-기아타이거즈")}`);
    await expect(page.getByTestId("mode-editorial")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("mode-concept")).toHaveCount(0);
    await expect(page.getByTestId("production-generate")).toBeDisabled();
    await page.getByTestId("angles-generate").click();
    await expect(page.getByTestId("angle-card")).toHaveCount(5);
    expect(calls.angles[0].mode).toBe("editorial");
    await page.getByTestId("angle-card").nth(1).click();
    await expect(page.getByTestId("angle-title")).toHaveValue("삐끼삐끼는 아웃송에서 시작");
    await page.getByTestId("production-generate").click();
    await expect(page.getByTestId("production-slide")).toHaveCount(6);
    expect(calls.production[0].angle?.title).toBe("삐끼삐끼는 아웃송에서 시작");
    expect(calls.production[0].settings.mode).toBe("editorial");
    await expect(page.getByTestId("publishing-content")).toContainText("TREND EDITORIAL");
    await expect(page.getByTestId("publishing-caption")).not.toContainText("T1:");
    const notes = page.getByTestId("editor-notes");
    await expect(notes).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("server-validation")).toBeHidden();
    await notes.locator("summary").click();
    await expect(page.getByTestId("server-validation")).toBeVisible();
    await expect(notes).toContainText("VERIFY BEFORE PUBLISHING");
    await expect(notes).toContainText(f.kia.after.plan.editor_notes!.fact_checks[0]);
    // 슬라이드 카드에는 근거 ID 줄이 없다(Editor Notes로 옮김).
    await expect(page.getByTestId("production-slide").first()).not.toContainText("근거 T1:");
    // 새로고침해도 방향·결과가 남는다.
    await page.reload();
    await expect(page.getByTestId("angle-title")).toHaveValue("삐끼삐끼는 아웃송에서 시작");
    await expect(page.getByTestId("production-slide")).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test("TREND REPORT is kept and can still be generated without an angle", async ({ page }) => {
    const calls = await seedKia(page);
    await page.goto(`/studio?trend=${encodeURIComponent("live-기아타이거즈")}`);
    await page.getByTestId("mode-report").click();
    await expect(page.getByTestId("production-generate")).toBeEnabled();
    await page.getByTestId("production-generate").click();
    await expect(page.getByTestId("production-slide")).toHaveCount(6);
    expect(calls.production[0].settings.mode).toBe("report");
    expect(calls.production[0].angle).toBeUndefined();
    expect(calls.angles).toHaveLength(0);
  });
});
