import { expect, test, type Page } from "@playwright/test";
import v2 from "./fixtures/editorial-engine-v2.json";
import old from "./fixtures/editorial-studio.json";
import base from "./fixtures/live-pipeline.json";
import cv from "./fixtures/culture-validation.json";
import { ideaSimilarity } from "../lib/creative-collision";
import { customAngle, isGenericTitle, isOffTopic, MAX_ANCHORED_ANGLES, needsAngleRegeneration, validateAngles, type ContentAngle } from "../lib/editorial";
import { editorialQualityGate, isGenericSentence, needsRewrite } from "../lib/editorial-quality";
import type { ProductionPlan } from "../lib/content-production";
import type { LiveAnalysisSnapshot } from "../lib/types";

/*
 * CONTENT STUDIO EDITORIAL ENGINE V2.
 * 픽스처 editorial-engine-v2.json: 2026-11-02 실측(방향 v3·제작 v3, 일부는 방향 맞춤 웹 조사). 방향 선택은 실험자가 했다(사용자 선택 아님).
 * 품질 판정은 lib/editorial-quality.ts 규칙 검사를 현재 코드로 다시 계산한다 — AI 점수도 사용자 평가도 아니다.
 */
type Angles = { promptVersion: string; customTopic: string; angles: ContentAngle[]; validation: { anchored?: number; typeCount?: number; genericTitles: string[]; offTopic?: string[]; regenerated?: boolean } };
type Produced = { angle: ContentAngle; customTopic: string; plan: ProductionPlan; quality: { regenerated?: boolean; passed: number } | null; research: { requested: boolean; status: string; count: number }; references: Array<{ id: string; title: string; excerpt: string }> };
const f = v2 as unknown as { angles: Record<string, Angles>; productions: Record<string, Produced> };
const before = old as unknown as { kia: { angles: { angles: ContentAngle[] }; after: { plan: ProductionPlan } }; analyses: Record<string, { evidence: Array<{ id: string; kind: string; title: string; excerpt: string }> }> };
const snaps = (cv as unknown as { snapshots: LiveAnalysisSnapshot[] }).snapshots;
const termsOf = (name: string) => name === "기아타이거즈" ? ["기아타이거즈", "기아 타이거즈", "KIA 타이거즈"] : (() => { const s = snaps.find((item) => item.trendName === name); return s ? [s.trendName, ...s.keywords] : [name]; })();
const gate = (key: string, name: string) => { const p = f.productions[key]; return editorialQualityGate(p.plan, { subjectTerms: termsOf(name), angle: p.angle, vocabulary: p.references.flatMap((item) => [item.title, item.excerpt]) }); };
const copy = (plan: ProductionPlan) => plan.slides.map((slide) => `${slide.headline} ${slide.body}`).join("\n");

test.describe("PHASE 1 diagnosis (recorded data)", () => {
  test("v2 angles were the research ledger turned into a menu: each of the 5 cited a different single web item", () => {
    const angles = before.kia.angles.angles;
    const ledgerWeb = before.analyses["기아타이거즈"].evidence.filter((item) => item.kind === "web_source").map((item) => `T1:${item.id}`);
    const firstCited = angles.map((angle) => angle.evidence_ids[0]);
    expect(firstCited.every((id) => ledgerWeb.includes(id))).toBe(true);
    expect(new Set(firstCited).size).toBe(5);
    expect(angles.some((angle) => /삐끼삐끼/.test(angle.title))).toBe(true);
  });
});

test.describe("PHASE 2·3 angle-first, diversified (recorded data)", () => {
  const keywords = ["기아타이거즈", "보컬로이드", "헤이세이 레트로", "디지털카메라", "치이카와"];
  test("every keyword gets 5 angles of at least 4 reader-experience types, with at most 2 built on a single research item", () => {
    for (const keyword of keywords) {
      const result = f.angles[keyword];
      expect(result.promptVersion).toBe("studio-angles-v3");
      expect(result.angles).toHaveLength(5);
      expect(new Set(result.angles.map((angle) => angle.angle_type)).size).toBeGreaterThanOrEqual(4);
      expect(result.angles.filter((angle) => angle.research_anchor).length).toBeLessThanOrEqual(MAX_ANCHORED_ANGLES);
    }
    // 기아타이거즈: 입문·팬덤·역사·체험이 모두 있다(소재에 맞춘 선택, 고정 템플릿 아님 — 다른 키워드의 유형 조합은 다르다).
    expect(f.angles["기아타이거즈"].angles.map((angle) => angle.angle_type)).toEqual(expect.arrayContaining(["guide", "fandom", "history", "experience"]));
    const combos = keywords.map((keyword) => f.angles[keyword].angles.map((angle) => angle.angle_type).sort().join(","));
    expect(new Set(combos).size).toBeGreaterThan(1);
  });

  test("a new cross-subject template ('…, 뭘 보면 될까/뭐부터 볼까/어디부터 볼까') found in v3 titles is now detected", () => {
    const flagged = keywords.flatMap((keyword) => f.angles[keyword].angles.map((angle) => angle.title)).filter(isGenericTitle);
    expect(flagged.sort()).toEqual(["미쿠 협업 굿즈, 어디부터 볼까?", "처음 든 디카, 뭐부터 찍을까", "치이카와 팝업, 뭐부터 볼까", "헤이세이 레트로, 뭘 보면 될까?"].sort());
  });

  test("validation counts anchored angles and reader types and asks for one regeneration when the research takes over", () => {
    const angle = (title: string, extra: Partial<ContentAngle>): ContentAngle => ({ angle_id: "x", title, hook: "h", editorial_perspective: `${title} 관점`, target_audience: "t", reader_benefit: "b", content_structure: [], suggested_visuals: [], research_requirements: [], evidence_ids: [], evidence_fit: "partial", angle_type: "guide", research_anchor: "", ...extra });
    const anchored = validateAngles({ angles: ["삐끼삐끼 아웃송", "광주 퍼레이드 현장", "시구 행사 비하인드", "메디힐 스폰서 계약"].map((title, i) => angle(title, { research_anchor: `T1:WEB-0${i + 2}`, angle_type: (["fandom", "history", "behind", "trivia"] as const)[i] })) }, []);
    expect(anchored.validation).toMatchObject({ anchored: 4, typeCount: 4 });
    expect(needsAngleRegeneration(anchored)).toBe(true);
    const sameType = validateAngles({ angles: ["응원가 입문", "직관 준비물", "좌석 고르기", "예매 순서", "입장 요령"].map((title) => angle(title, {})) }, []);
    expect(sameType.validation.typeCount).toBe(1);
    expect(needsAngleRegeneration(sameType)).toBe(true);
    // 사용자 지정 주제가 있으면 같은 유형이어도 괜찮다(모두 그 주제의 변주).
    expect(needsAngleRegeneration(sameType, "처음 야구장에 가는 사람을 위한 입덕 가이드")).toBe(false);
  });
});

test.describe("PHASE 4·6·7 story-first productions (recorded data)", () => {
  test("기아타이거즈 A (입덕 가이드) and B (응원 문화) differ in title, storyline and slides, not just wording", () => {
    const a = f.productions.kiaA3.plan, b = f.productions.kiaB.plan;
    expect(f.productions.kiaA3.angle.angle_type).toBe("guide");
    expect(f.productions.kiaB.angle.angle_type).toBe("fandom");
    expect(a.title).not.toBe(b.title);
    expect(ideaSimilarity(a.storyline!.map((beat) => beat.beat).join(" "), b.storyline!.map((beat) => beat.beat).join(" "))).toBeLessThan(0.3);
    expect(ideaSimilarity(copy(a), copy(b))).toBeLessThan(0.25);
    expect(copy(a)).not.toMatch(/삐끼삐끼/);
    expect(copy(a)).toMatch(/예매|스마트티켓|응원단/);
    expect(copy(b)).toMatch(/삐끼삐끼|아웃송/);
    expect(a.slides.some((slide) => slide.type === "tip")).toBe(true);
  });

  test("a user-written topic wins: the custom guide stays on 'first visit to the ballpark' and never switches to 삐끼삐끼", () => {
    const custom = f.productions.kiaCustom;
    expect(custom.angle.angle_type).toBe("custom");
    expect(custom.customTopic).toBe("처음 야구장에 가는 사람을 위한 입덕 가이드");
    expect(copy(custom.plan)).not.toMatch(/삐끼삐끼|퍼레이드|시구|메디힐/);
    expect(copy(custom.plan)).toMatch(/첫 직관|첫 야구장|예매|입장/);
    const proposals = f.angles["기아타이거즈 custom"];
    expect(proposals.customTopic).toBe("처음 야구장에 가는 사람을 위한 입덕 가이드");
    expect(proposals.angles.every((angle) => !/삐끼삐끼|퍼레이드/.test(`${angle.title} ${angle.editorial_perspective}`))).toBe(true);
    // 단어 기준 주제 이탈 표시는 참고용이다: 유의어를 넣어도 1개는 잘못 걸린다(그래서 재생성 조건에서 뺐다).
    expect(proposals.angles.filter((angle) => isOffTopic(proposals.customTopic, angle)).length).toBeLessThanOrEqual(1);
    expect(customAngle("처음 야구장 가이드")).toMatchObject({ title: "처음 야구장 가이드", angle_type: "custom", evidence_fit: "needs_research" });
  });

  test("every production writes a storyline first (one beat per slide) without search-interest content", () => {
    for (const key of ["kiaA3", "kiaB", "kiaCustom", "vocaloid", "heisei2", "camera", "chiikawa"]) {
      const plan = f.productions[key].plan;
      expect(plan.storyline?.length, key).toBe(plan.slides.length);
      expect(JSON.stringify(plan.storyline)).not.toMatch(/검색 관심도|검색량|지수/);
      expect(plan.slides.every((slide) => (slide.reader_gets ?? "").length > 0 && (slide.specific_detail ?? "").length > 0), key).toBe(true);
    }
  });

  test("angle research (step 5) adds checked sources only when requested", () => {
    // kiaA는 조사 단계를 만들기 전에 기록했다(research 필드 없음 = 요청 안 함).
    expect(f.productions.kiaA.research?.requested ?? false).toBe(false);
    expect(f.productions.kiaA.references.some((item) => item.id.includes(":AR-"))).toBe(false);
    expect(f.productions.kiaA3.research).toMatchObject({ requested: true, status: "live" });
    expect(f.productions.kiaA3.references.filter((item) => item.id.includes(":AR-")).length).toBeGreaterThanOrEqual(3);
    // 조사로 들어온 구체 정보(응원단·응원가·예매 규칙)가 게시 카피에 쓰였고, 검증 필요 슬라이드가 없다.
    expect(copy(f.productions.kiaA3.plan)).toMatch(/외쳐라 최강기아|스마트티켓/);
    expect(f.productions.kiaA3.plan.slides.every((slide) => !(slide.review ?? []).length)).toBe(true);
  });
});

test.describe("PHASE 5 editorial quality gate (rule check, not a user rating)", () => {
  test("the earlier v2 result fails as a source-narrating piece even though it had zero report phrases", () => {
    const plan = before.kia.after.plan;
    const report = editorialQualityGate(plan, { subjectTerms: termsOf("기아타이거즈"), angle: before.kia.angles.angles[1], vocabulary: before.analyses["기아타이거즈"].evidence.flatMap((item) => [item.title, item.excerpt]) });
    expect(report.source).toBe("rule-check");
    // V2.1: 출처 서술은 편집 신호(참고), 소재 연결은 필수 '주제 일치'로 옮겼다.
    const failed = (id: string) => report.checks.find((check) => check.id === id && !check.pass);
    expect(failed("not-report")?.group).toBe("editorial");
    expect(failed("flow")?.group).toBe("editorial");
    expect(report.failing).toContain("topic");
    expect(needsRewrite(report)).toBe(true);
  });

  test("current gate on recorded v3 drafts: catches subject-less and mixed-script drafts, passes the specific ones", () => {
    expect(gate("vocaloid", "보컬로이드").failing).toEqual([]);
    // V2.1 이름: 소재 연결 → 필수 'topic', 문자 섞임 → 필수 'language'.
    expect(gate("heisei", "헤이세이 레트로").failing).toContain("topic");
    expect(gate("camera", "디지털카메라").failing).toContain("topic");
    expect(gate("chiikawa", "치이카와").failing).toContain("language");
    const a3 = gate("kiaA3", "기아타이거즈");
    expect(a3.failing).toEqual([]);
    expect(a3.checks.find((check) => check.id === "specific")?.pass).toBe(true);
    // 고쳐 쓰기: 같은 방향으로 다시 쓴 헤이세이 2차가 1차보다 낫다(소재 고유 캐릭터·제품 사례가 들어감).
    expect(f.productions.heisei2.quality?.regenerated).toBe(true);
    expect(gate("heisei2", "헤이세이 레트로").passed).toBeGreaterThanOrEqual(gate("heisei", "헤이세이 레트로").passed);
    expect(copy(f.productions.heisei2.plan)).toMatch(/시즈쿠짱|아와와짱/);
  });

  test("the swap test: a sentence that survives replacing the subject name is generic", () => {
    const terms = ["기아 타이거즈", "기아타이거즈"];
    expect(isGenericSentence("구단 공식 채널에서 응원가와 응원 영상을 찾아 먼저 들어봐요.", terms, ["챔피언스", "필드"])).toBe(true);
    expect(isGenericSentence("기아 타이거즈의 홈은 광주-기아 챔피언스 필드예요.", terms, ["챔피언스", "필드"])).toBe(false);
    expect(isGenericSentence("「千本桜」는 흑토끼P가 만든 곡이에요.", ["보컬로이드"], [])).toBe(false);
  });
});

/* ---------- 화면: 사용자 지정 주제 · 방향 맞춤 조사 · 품질 게이트 표시 ---------- */

async function seedKia(page: Page) {
  const sample = (base.snapshots as unknown as LiveAnalysisSnapshot[])[0];
  const a = (old as unknown as { analyses: Record<string, { analyzedAt: string; report: LiveAnalysisSnapshot["whyReport"]; evidence: LiveAnalysisSnapshot["evidence"]; signalStats: LiveAnalysisSnapshot["signalStats"] }> }).analyses["기아타이거즈"];
  const snapshot = { ...sample, id: "kia", trendId: "live-기아타이거즈", trendName: "기아타이거즈", keywords: ["기아타이거즈"], analyzedAt: a.analyzedAt, whyReport: a.report, evidence: a.evidence, signalStats: a.signalStats, dna: undefined, embedding: null, media: [] };
  await page.goto("/");
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-live-analyses", JSON.stringify([s])); }, snapshot);
  const calls = { angles: [] as Array<{ customTopic?: string; settings: { tone?: string } }>, production: [] as Array<{ angle?: ContentAngle; customTopic?: string; research?: boolean }> };
  await page.route("**/api/studio/angles", (route) => { calls.angles.push(route.request().postDataJSON()); return route.fulfill({ json: { cached: false, generatedAt: "2026-11-02T03:00:00.000Z", mode: "editorial", ...f.angles["기아타이거즈 custom"] } }); });
  const p = f.productions.kiaCustom;
  await page.route("**/api/studio/production", (route) => { calls.production.push(route.request().postDataJSON()); return route.fulfill({ json: { mode: "live", cached: false, generatedAt: "2026-11-02T03:01:00.000Z", promptVersion: "studio-production-v3", model: "recorded", plan: p.plan, validation: { removedEvidenceIds: [], removedImageRefs: 0, slideCountAdjusted: false, downgradedClaims: 0, timingFixed: 0 }, quality: editorialQualityGate(p.plan, { subjectTerms: termsOf("기아타이거즈"), angle: p.angle, vocabulary: p.references.flatMap((item) => [item.title, item.excerpt]) }), research: p.research, references: p.references } }); });
  return calls;
}

test.describe("PHASE 6 user control in Content Studio", () => {
  test("a typed topic can be used as-is (no AI proposal), is sent with the request, and the quality gate shows as a rule check", async ({ page }) => {
    const calls = await seedKia(page);
    await page.goto(`/studio?trend=${encodeURIComponent("live-기아타이거즈")}`);
    await page.getByTestId("custom-topic").fill("처음 야구장에 가는 사람을 위한 입덕 가이드");
    await page.getByTestId("setting-tone").fill("입문자에게 친절하게");
    await page.getByTestId("custom-topic-use").click();
    await expect(page.getByTestId("angle-title")).toHaveValue("처음 야구장에 가는 사람을 위한 입덕 가이드");
    await page.getByTestId("angle-research").check();
    await page.getByTestId("production-generate").click();
    await expect(page.getByTestId("production-slide")).toHaveCount(6);
    expect(calls.angles).toHaveLength(0);
    expect(calls.production[0]).toMatchObject({ customTopic: "처음 야구장에 가는 사람을 위한 입덕 가이드", research: true, angle: { angle_type: "custom", title: "처음 야구장에 가는 사람을 위한 입덕 가이드" } });
    await expect(page.getByRole("status").filter({ hasText: "방향 맞춤 자료" })).toBeVisible();
    await page.getByTestId("editor-notes").locator("summary").click();
    await expect(page.getByTestId("quality-gate")).toContainText("A. 필수 검증");
    await expect(page.getByTestId("quality-gate")).toContainText("B. 편집 신호");
    await expect(page.getByTestId("notes-storyline")).toBeVisible();
  });

  test("proposing angles for a typed topic sends the topic and tone", async ({ page }) => {
    const calls = await seedKia(page);
    await page.goto(`/studio?trend=${encodeURIComponent("live-기아타이거즈")}`);
    await page.getByTestId("custom-topic").fill("처음 야구장에 가는 사람을 위한 입덕 가이드");
    await page.getByTestId("angles-generate").click();
    await expect(page.getByTestId("angle-card")).toHaveCount(5);
    expect(calls.angles[0]).toMatchObject({ customTopic: "처음 야구장에 가는 사람을 위한 입덕 가이드", settings: { tone: expect.any(String) } });
    await expect(page.getByTestId("angles-check")).toContainText("독자 경험 유형");
  });
});
