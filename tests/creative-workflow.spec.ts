import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import base from "./fixtures/live-pipeline.json";
import extra from "./fixtures/culture-validation.json";
import v2 from "./fixtures/creative-collision-v2.json";
import production from "./fixtures/studio-production.json";
import { DUPLICATE_THRESHOLD, ideaSimilarity, ideaTypes, validateCreative, type CreativeResult, type CreativeRun } from "../lib/creative-collision";
import { conceptFromIdea, defaultSettings, validateProduction, type ProductionPlan, type StudioProject } from "../lib/content-production";
import { composeImagePrompt, IMAGE_SIZES, imageRequestSchema, validImageSize, type ImageAssetRef } from "../lib/image-assets";
import { prepareAssetsForCloud, removeStoredAssets } from "../lib/asset-storage";
import { DEFAULT_TOKENS, FIGMA_EXPORT_SCHEMA, LAYOUT_TEMPLATES, toFigmaExport } from "../lib/figma-export";
import { loadCloudSavedItems, pushSavedItem, storagePathsOf } from "../lib/saved-items-cloud";
import { studioSavedItem } from "../lib/studio-cloud";
import type { LiveAnalysisSnapshot } from "../lib/types";
import { createStore, fakeSupabase, rowCount } from "./helpers/fake-supabase";

/*
 * Creative workflow C1~C7. 픽스처: 2026-10-30 실측
 *  - creative-collision-v2.json: 헤이세이 레트로 × 디지털카메라, 프롬프트 v2(1회)
 *  - studio-production.json: v2 아이디어 '네 컷 사진 부스' → 카드뉴스 6장(1회)
 * 화면 테스트는 이 응답을 재사용하고 OpenAI·이미지 API를 다시 부르지 않는다(가짜 응답).
 */
const all = [...base.snapshots, ...extra.snapshots] as unknown as LiveAnalysisSnapshot[];
const heisei = all.find((item) => item.trendName === "헤이세이 레트로")!;
const camera = all.find((item) => item.trendName === "디지털카메라")!;
const response = (v2 as unknown as { response: { result: CreativeResult; validation: CreativeRun["validation"]; model: string; analyzedAt: string; promptVersion: string; inputs: CreativeRun["inputs"] } }).response;
const run: CreativeRun = { id: "cc-v2", trendKeys: [heisei.trendId, camera.trendId], trendNames: [heisei.trendName, camera.trendName], analyzedAt: response.analyzedAt, updatedAt: response.analyzedAt, model: response.model, promptVersion: response.promptVersion, result: response.result, inputs: response.inputs, validation: response.validation, selectedIdeaId: response.result.ideas.find((idea) => idea.idea_type === "popup_space")!.id, visuals: [] };
const booth = response.result.ideas.find((idea) => idea.idea_type === "popup_space")!;
const prod = production as unknown as { response: { plan: ProductionPlan; validation: StudioProject["validation"]; model: string; generatedAt: string; promptVersion: string; references: unknown[] } };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const DATA_URL = `data:image/jpeg;base64,${PNG}`;

test.describe("C1 creative quality (no browser)", () => {
  test("the real v2 result has exactly 3 ideas per level, 7+ fitting output types, concrete outputs and no near-duplicates", () => {
    const ideas = response.result.ideas;
    expect(response.validation.levelCounts).toEqual({ SAFE: 3, BOLD: 3, WILD: 3 });
    expect(new Set(ideas.map((idea) => idea.idea_type)).size).toBeGreaterThanOrEqual(7);
    expect(ideas.some((idea) => idea.idea_type === "exhibition" || idea.idea_type === "interactive")).toBe(true);
    for (const type of ideaTypes) expect(ideas.filter((idea) => idea.idea_type === type).length).toBeLessThanOrEqual(2);
    for (const idea of ideas) {
      expect(idea.concrete_output?.length ?? 0).toBeGreaterThan(30);
      expect(idea.cultural_connection?.length ?? 0).toBeGreaterThan(20);
      expect(idea.source_trend_ids).toEqual([heisei.trendId, camera.trendId]);
    }
    for (let i = 0; i < ideas.length; i += 1) for (let j = i + 1; j < ideas.length; j += 1) expect(ideaSimilarity(`${ideas[i].title} ${ideas[i].concrete_output}`, `${ideas[j].title} ${ideas[j].concrete_output}`)).toBeLessThan(DUPLICATE_THRESHOLD);
    expect(response.validation.droppedDuplicates).toEqual([]);
  });

  test("near-duplicate ideas are dropped and reported", () => {
    const first = response.result.ideas[0];
    const raw: CreativeResult = { ...response.result, ideas: [first, { ...first, creativity_level: "WILD", idea_type: "goods", title: `${first.title}!` }, response.result.ideas[4]] };
    const { result, validation } = validateCreative(raw, [], ["A", "B"]);
    expect(result.ideas).toHaveLength(2);
    expect(validation.droppedDuplicates).toEqual([`${first.title}!`]);
  });
});

test.describe("C3 production rules (no browser)", () => {
  test("the real card news plan: 6 slides from cover to CTA, concept marked as a proposal, only real ledger ids", () => {
    const plan = prod.response.plan;
    expect(plan.slides.map((slide) => slide.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(plan.slides[0].type).toBe("cover");
    expect(["cta", "closing"]).toContain(plan.slides[5].type);
    expect(plan.concept_notice).toContain("콘셉트 제안");
    expect(plan.scenes).toEqual([]);
    for (const slide of plan.slides) for (const key of ["headline", "body", "visual_direction", "image_prompt", "layout_hint"] as const) expect(slide[key].length).toBeGreaterThan(0);
    const ledger = new Set([...(heisei.evidence ?? []).map((item) => `T1:${item.id}`), ...(camera.evidence ?? []).map((item) => `T2:${item.id}`)]);
    expect([...plan.claims, ...plan.slides].flatMap((item) => item.evidence_ids).every((id) => ledger.has(id))).toBe(true);
  });

  test("validation removes invented evidence and image refs, downgrades unsupported claims, caps slides and fixes scene timing", () => {
    const plan = prod.response.plan;
    const raw: ProductionPlan = { ...plan, claims: [{ text: "검색량이 300% 늘었다", evidence_ids: ["T9:FAKE-01"], status: "Verified Signal" }], slides: [...plan.slides, ...plan.slides].map((slide) => ({ ...slide, image_ref: "ghost-image", evidence_ids: [...slide.evidence_ids, "T9:FAKE-02"] })) };
    const { plan: cleaned, validation } = validateProduction(raw, { ...defaultSettings("cardnews"), slideCount: 8 }, [...new Set(plan.slides.flatMap((slide) => slide.evidence_ids))], ["real-1"]);
    expect(cleaned.slides).toHaveLength(8);
    expect(cleaned.claims[0]).toMatchObject({ status: "Insufficient Evidence", evidence_ids: [] });
    expect(cleaned.slides.every((slide) => slide.image_ref === "" && !slide.evidence_ids.includes("T9:FAKE-02"))).toBe(true);
    expect(validation).toMatchObject({ downgradedClaims: 1, slideCountAdjusted: true });
    expect(validation.removedEvidenceIds).toEqual(expect.arrayContaining(["T9:FAKE-01", "T9:FAKE-02"]));
    const scenes = validateProduction({ ...plan, slides: [], scenes: [
      { scene_id: "x", time_range: "0-3", description: "d", visual_direction: "v", on_screen_text: "o", voice_over: "n", transition: "cut", asset_ref: "", image_prompt: "p", evidence_ids: [] },
      { scene_id: "y", time_range: "5-90", description: "d", visual_direction: "v", on_screen_text: "o", voice_over: "n", transition: "cut", asset_ref: "", image_prompt: "p", evidence_ids: [] },
    ] }, { ...defaultSettings("shortform"), durationSec: 30 }, [], []);
    expect(scenes.plan.scenes.map((scene) => scene.time_range)).toEqual(["0-3s", "3-30s"]);
    expect(scenes.validation.timingFixed).toBe(1);
  });
});

test.describe("C4 image rules (no browser)", () => {
  test("only sizes allowed by the official constraints are offered; unsupported ratios are rejected", () => {
    for (const size of Object.values(IMAGE_SIZES)) expect(validImageSize(size.width, size.height)).toBe(true);
    expect(IMAGE_SIZES["4:5"]).toEqual({ width: 1024, height: 1280 });
    expect(IMAGE_SIZES["9:16"]).toEqual({ width: 864, height: 1536 });
    expect(validImageSize(1000, 1000)).toBe(false);
    expect(validImageSize(512, 512)).toBe(false);
    expect(imageRequestSchema.safeParse({ prompt: "a".repeat(30), aspect: "3:2" }).success).toBe(false);
    const prompt = composeImagePrompt({ prompt: "A pastel photo booth with a compact camera", purpose: "cover", aspect: "4:5", style: "3d-render", colors: "pastel pink" });
    expect(prompt).toContain("Do not render any text");
    expect(prompt).toContain("Production asset");
    expect(prompt).toContain("Color palette: pastel pink.");
  });
});

const asset = (id: string, status: ImageAssetRef["status"], extra: Partial<ImageAssetRef> = {}): ImageAssetRef => ({ id, status, title: id, createdAt: "2026-10-30T00:00:00.000Z", rights: "r", ...extra });
const project = (): StudioProject => ({
  id: "studio-creative-cc-v2-x", mode: "creative", title: booth.title, source: { trendKeys: run.trendKeys, trendNames: run.trendNames, creativeRunId: run.id, ideaId: booth.id },
  concept: conceptFromIdea(run, booth), settings: { ...defaultSettings("cardnews"), slideCount: 6 },
  plan: { ...prod.response.plan, slides: prod.response.plan.slides.map((slide, index) => index === 0 ? { ...slide, image_ref: "img-cover" } : index === 2 ? { ...slide, image_ref: "real-1" } : slide) },
  assets: [asset("img-cover", "AI PRODUCTION ASSET", { dataUrl: DATA_URL, model: "m", width: 512, height: 640 }), asset("real-1", "REAL REFERENCE", { url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk" }), asset("concept-1", "AI CONCEPT VISUAL", { storagePath: "user-a/creative_cc-v2/x.jpg" })],
  edited: true, createdAt: "2026-10-30T00:00:00.000Z", updatedAt: "2026-10-30T01:00:00.000Z",
});

test.describe("C5 storage + C6 Figma export (no browser)", () => {
  test("generated images go to the private bucket under the user's folder; DB copy keeps only paths; real references are never uploaded", async () => {
    const store = createStore();
    const a = fakeSupabase(store, { id: "user-a" }), b = fakeSupabase(store, { id: "user-b" });
    const { cloudAssets, localAssets, report } = await prepareAssetsForCloud(a, "user-a", "studio-creative-cc-v2-x", project().assets);
    expect(report).toMatchObject({ uploaded: 1, inline: 0 });
    const cover = cloudAssets.find((item) => item.id === "img-cover")!;
    expect(cover.dataUrl).toBeUndefined();
    expect(cover.storagePath).toBe("user-a/studio-creative-cc-v2-x/img-cover.jpg");
    expect(localAssets.find((item) => item.id === "img-cover")).toMatchObject({ dataUrl: DATA_URL, storagePath: cover.storagePath });
    expect(cloudAssets.find((item) => item.id === "real-1")).toMatchObject({ url: expect.stringContaining("ytimg") });
    expect(cloudAssets.find((item) => item.id === "real-1")?.storagePath).toBeUndefined();
    expect(Object.keys(store.objects)).toEqual(["creative-assets/user-a/studio-creative-cc-v2-x/img-cover.jpg"]);
    // 다른 계정은 서명 URL을 만들 수 없다(RLS).
    expect((await b.storage.from("creative-assets").createSignedUrl(cover.storagePath!, 60)).error).not.toBeNull();
    expect((await a.storage.from("creative-assets").createSignedUrl(cover.storagePath!, 60)).data?.signedUrl).toContain("img-cover");
    expect((await removeStoredAssets(b, [cover.storagePath!])).removed).toBe(0);
    expect((await removeStoredAssets(a, [cover.storagePath!])).removed).toBe(1);
  });

  test("without migration 0008 the image is kept inline so the reference is never lost", async () => {
    const store = createStore();
    const a = fakeSupabase(store, { id: "user-a" }, { missingBucket: true });
    const { cloudAssets, report } = await prepareAssetsForCloud(a, "user-a", "p", project().assets);
    expect(report).toMatchObject({ bucketMissing: true, inline: 1, uploaded: 0 });
    expect(cloudAssets.find((item) => item.id === "img-cover")?.dataUrl).toBe(DATA_URL);
  });

  test("a project saves as one Workspace plan row, restores in another browser, and its delete targets only its own images", async () => {
    const store = createStore();
    const a = fakeSupabase(store, { id: "user-a" }), b = fakeSupabase(store, { id: "user-b" });
    const item = studioSavedItem(project());
    expect(item).toMatchObject({ type: "plan", id: "studio-creative-cc-v2-x" });
    expect((await pushSavedItem(a, "user-a", item)).ok).toBe(true);
    expect((await pushSavedItem(a, "user-a", { ...item, updatedAt: "2026-10-30T02:00:00.000Z" })).ok).toBe(true);
    expect(rowCount(store, "saved_items", "user-a")).toBe(1);
    const restored = await loadCloudSavedItems(a, "user-a");
    expect(restored.ok && restored.items[0].item.payload).toMatchObject({ kind: "studio-project", project: { id: "studio-creative-cc-v2-x", edited: true } });
    const other = await loadCloudSavedItems(b, "user-b");
    expect(other.ok && other.items).toEqual([]);
    // 프로젝트를 지워도 Creative 실행의 콘셉트 이미지(AI CONCEPT VISUAL)는 지우지 않는다.
    expect(storagePathsOf({ kind: "studio-project", project: { ...project(), assets: [asset("img-cover", "AI PRODUCTION ASSET", { storagePath: "user-a/p/img.jpg" }), asset("concept-1", "AI CONCEPT VISUAL", { storagePath: "user-a/creative/x.jpg" })] } })).toEqual(["user-a/p/img.jpg"]);
  });

  test("Figma export separates text and image elements per slide, carries canvas, tokens, template ids, rights and sources, and no image binaries", () => {
    const exported = toFigmaExport(project(), "2026-10-30T05:00:00.000Z");
    expect(exported.schema).toBe(FIGMA_EXPORT_SCHEMA);
    expect(exported.project.canvas).toMatchObject({ width: 1080, height: 1350, aspect: "4:5" });
    expect(exported.project.visualTheme.tokens).toEqual(DEFAULT_TOKENS);
    expect(exported.slides).toHaveLength(6);
    for (const slide of exported.slides) {
      expect(Object.keys(LAYOUT_TEMPLATES)).toContain(slide.layoutTemplateId);
      expect(slide.elements.filter((element) => element.type === "TEXT").every((element) => "typographyToken" in element && element.typographyToken.startsWith("typography."))).toBe(true);
    }
    expect(exported.slides[0].elements.some((element) => element.type === "IMAGE" && "assetId" in element && element.assetId === "img-cover")).toBe(true);
    expect(exported.slides[0].layoutTemplateId).toBe("cover-fullbleed");
    expect(exported.assets.find((item) => item.id === "real-1")).toMatchObject({ status: "REAL REFERENCE", source: { kind: "url" }, attribution: expect.stringContaining("youtube.com") });
    expect(exported.assets.find((item) => item.id === "concept-1")).toMatchObject({ source: { kind: "storage", path: "user-a/creative_cc-v2/x.jpg" } });
    expect(JSON.stringify(exported)).not.toContain("base64,");
  });
});

/* ---------- E2E (가짜 API) ---------- */

async function seed(page: Page, data: { live?: unknown[]; runs?: unknown[]; workspace?: unknown[] }) {
  await page.goto("/");
  await page.evaluate((d) => {
    localStorage.clear();
    localStorage.setItem("trend-radar-onboarded", "1");
    localStorage.setItem("trend-radar-live-analyses", JSON.stringify(d.live ?? []));
    if (d.runs) localStorage.setItem("trend-radar-creative-collisions", JSON.stringify(d.runs));
    if (d.workspace) localStorage.setItem("trend-radar-workspace", JSON.stringify(d.workspace));
  }, data);
}
const stubProduction = async (page: Page, plan = prod.response.plan) => {
  const calls: Array<{ settings: { format: string; slideCount: number; durationSec: number; aspect: string }; concept?: { title: string }; trends: unknown[]; assets: Array<{ id: string }> }> = [];
  await page.route("**/api/studio/production", async (route) => { calls.push(route.request().postDataJSON()); await route.fulfill({ json: { mode: "live", cached: false, generatedAt: "2026-10-30T06:00:00.000Z", promptVersion: "studio-production-v1", model: "test-model", plan, validation: prod.response.validation, references: [] } }); });
  return calls;
};
/** E2 이후 생성 전에 방향을 고른다. 이 시나리오는 방향 제안 API를 가짜 응답으로 대신한다(실측 방향 품질은 editorial-studio.spec.ts). */
const STUB_ANGLE = { angle_id: "angle-1", title: "프레임부터 고르는 네 컷", hook: "필터 말고 프레임!", editorial_perspective: "고르는 재미가 먼저인 사진 부스", target_audience: "사진 꾸미기를 좋아하는 20대", reader_benefit: "취향대로 고르는 방법", content_structure: ["후킹", "고르기", "찍기", "마무리"], suggested_visuals: ["투명 프레임 클로즈업"], research_requirements: [], evidence_ids: [], evidence_fit: "partial" };
const pickAngle = async (page: Page) => {
  await page.route("**/api/studio/angles", (route) => route.fulfill({ json: { cached: false, generatedAt: "2026-11-02T00:00:00.000Z", mode: (route.request().postDataJSON() as { mode: string }).mode, angles: [STUB_ANGLE, { ...STUB_ANGLE, angle_id: "angle-2", title: "버튼을 직접 누르는 이유" }], validation: { removedEvidenceIds: [], genericTitles: [], droppedDuplicates: [], downgradedFit: 0 }, model: "test-model" } }));
  await page.getByTestId("angles-generate").click();
  await page.getByTestId("angle-card").first().click();
  await expect(page.getByTestId("angle-selected")).toBeVisible();
};
const stubImages = async (page: Page) => {
  const calls: Array<{ aspect: string; purpose: string }> = [];
  await page.route("**/api/images", async (route) => { const body = route.request().postDataJSON(); calls.push(body); await route.fulfill({ json: { status: body.purpose === "concept" ? "AI CONCEPT VISUAL" : "AI PRODUCTION ASSET", cached: false, createdAt: "2026-10-30T06:10:00.000Z", base64: PNG, model: "test-image-model", prompt: body.prompt, size: "1024x1280" } }); });
  return calls;
};
const accept = (page: Page) => page.on("dialog", (dialog) => void dialog.accept());

test.describe("C7 Scenario B — Creative Collision → Studio → images → Workspace → Figma", () => {
  test("manual dual-trend draft is available without analyses, rejects duplicate trends, and keeps inputs while switching modes", async ({ page }) => {
    await seed(page, {});
    await page.goto("/studio");
    await expect(page.getByTestId("studio-tab-production")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("studio-mode-creative").click();
    await page.locator("details.manual").click();
    await page.getByTestId("manual-trend-a").fill("헤이세이 레트로");
    await page.getByTestId("manual-trend-b").fill("헤이세이 레트로");
    await page.getByTestId("manual-topic").fill("레트로 카메라 팝업");
    await expect(page.getByTestId("production-start-manual")).toBeDisabled();
    await page.getByTestId("manual-trend-b").fill("디지털카메라");
    await page.getByTestId("studio-mode-single").click();
    await page.getByTestId("studio-mode-creative").click();
    await expect(page.getByTestId("manual-topic")).toHaveValue("레트로 카메라 팝업");
    await page.locator("details.manual").click();
    await page.getByTestId("production-start-manual").click();
    await expect(page.getByTestId("production-mode")).toContainText("CREATIVE COLLISION MODE");
    await expect(page.getByTestId("production-mode")).toContainText("헤이세이 레트로 × 디지털카메라");
    await expect(page.getByTestId("custom-topic")).toHaveValue("레트로 카메라 팝업");
    await expect(page.getByTestId("production-concept")).toContainText("저장된 WHY·DNA 분석이나 Creative Collision 생성 결과가 아닙니다");
  });

  test("Content Studio offers both modes and reuses an existing dual-trend idea without an automatic paid API call", async ({ page }) => {
    const paid: string[] = [];
    page.on("request", (request) => { if (/\/api\/(creative-collision|studio\/angles|studio\/production|images)/.test(new URL(request.url()).pathname)) paid.push(request.url()); });
    await seed(page, { live: [heisei, camera], runs: [run] });
    await page.goto("/studio");
    await expect(page.getByTestId("studio-mode-single")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("studio-mode-creative").click();
    await expect(page.getByTestId("studio-dual-analysis")).toContainText(heisei.trendName);
    await expect(page.getByTestId("studio-dual-analysis")).toContainText(camera.trendName);
    await expect(page.getByTestId("studio-collision-ideas")).toBeVisible();
    const selected = page.getByTestId("studio-collision-idea").filter({ hasText: booth.title });
    await selected.click();
    await page.getByTestId("production-start-creative").click();
    await expect(page).toHaveURL(/\/studio\?project=studio-creative-cc-v2-/);
    await expect(page.getByTestId("production-mode")).toContainText(`${heisei.trendName} × ${camera.trendName}`);
    await expect(page.getByTestId("concept-title")).toHaveValue(booth.title);
    expect(paid).toEqual([]);
  });

  test("idea flows into Studio, card news is planned and edited, concept visual reused, new asset generated, saved once, restored after reload, exported", async ({ page }) => {
    accept(page);
    const production = await stubProduction(page);
    const images = await stubImages(page);
    await seed(page, { live: [heisei, camera], runs: [run] });
    await page.goto("/collision");
    await page.getByTestId("mode-creative").click();
    const creative = page.getByTestId("creative-collision");
    await creative.getByTestId("creative-idea").filter({ hasText: booth.title }).click();
    await creative.getByTestId("creative-image-run").click();
    await expect(creative.getByTestId("creative-visual").getByTestId("asset-image").first()).toContainText("AI CONCEPT VISUAL");
    await creative.getByTestId("creative-to-studio").click();
    await expect(page).toHaveURL(/\/studio\?project=studio-creative-cc-v2-/);
    await expect(page.getByTestId("production-mode")).toContainText("CREATIVE COLLISION MODE");
    await expect(page.getByTestId("concept-title")).toHaveValue(booth.title);
    // 콘셉트 이미지(AI CONCEPT VISUAL)와 실제 근거 이미지(REAL REFERENCE)가 프로젝트 이미지로 들어와 있다.
    const assets = page.getByTestId("production-assets");
    await expect(assets.locator('[data-status="AI CONCEPT VISUAL"]')).toHaveCount(1);
    await expect(assets.locator('[data-status="REAL REFERENCE"]').first()).toBeVisible();
    await page.getByTestId("concept-title").fill(`${booth.title} 2호점`);
    // Creative 아이디어로 들어오면 CREATIVE CONCEPT 모드가 기본이다.
    await expect(page.getByTestId("mode-concept")).toHaveAttribute("aria-checked", "true");
    await pickAngle(page);
    await page.getByTestId("production-generate").click();
    await expect(page.getByTestId("production-slide")).toHaveCount(6);
    expect(production[0].concept?.title).toBe(`${booth.title} 2호점`);
    expect(production[0].settings).toMatchObject({ format: "cardnews", aspect: "4:5", slideCount: 6 });
    expect(production[0].trends).toHaveLength(2);
    await expect(page.getByTestId("concept-notice")).toContainText("콘셉트 제안");
    // 사용자 수정 → 새로고침 후에도 유지
    await page.getByTestId("slide-headline").first().fill("직접 고친 표지 문구");
    // 기존 콘셉트 이미지를 표지에 연결, 3번 슬라이드에는 새 제작용 이미지 생성
    const cover = page.getByTestId("production-slide").first();
    await cover.getByTestId("slot-link").click();
    await cover.getByTestId("asset-picker").locator('[data-status="AI CONCEPT VISUAL"]').click();
    await expect(cover.locator('.slot [data-status="AI CONCEPT VISUAL"]')).toBeVisible();
    const third = page.getByTestId("production-slide").nth(2);
    await third.getByTestId("slot-generate").click();
    await third.getByTestId("slot-image-run").click();
    await expect(third.locator('.slot [data-status="AI PRODUCTION ASSET"]')).toBeVisible();
    expect(images.at(-1)).toMatchObject({ aspect: "4:5" });
    expect(["body", "background", "cover"]).toContain(images.at(-1)!.purpose);
    await page.reload();
    await expect(page.getByTestId("slide-headline").first()).toHaveValue("직접 고친 표지 문구");
    await expect(page.getByTestId("production-slide").nth(2).locator('.slot [data-status="AI PRODUCTION ASSET"]')).toBeVisible();
    // Workspace 저장(중복 없음)
    await page.getByTestId("production-save").click();
    await expect(page.getByTestId("cloud-save-status")).toBeVisible();
    await page.getByTestId("production-save").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-workspace") ?? "[]") as Array<{ id: string; payload?: { kind?: string } }>);
    expect(saved.filter((item) => item.payload?.kind === "studio-project")).toHaveLength(1);
    // Figma JSON 내보내기
    const download = page.waitForEvent("download");
    await page.getByTestId("production-figma").click();
    const file = await (await download).path();
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(json.schema).toBe(FIGMA_EXPORT_SCHEMA);
    expect(json.slides[0].elements.find((element: { role?: string }) => element.role === "headline").content).toBe("직접 고친 표지 문구");
    expect(json.assets.map((item: { status: string }) => item.status)).toEqual(expect.arrayContaining(["AI CONCEPT VISUAL", "AI PRODUCTION ASSET", "REAL REFERENCE"]));
    // V5 플러그인용: AI 이미지에는 figmaImage(축소본·서명 링크)가 붙고, 실제 근거 이미지에는 붙지 않는다.
    const exportedAssets = json.assets as Array<{ status: string; figmaImage?: { url: string } }>;
    expect(exportedAssets.filter((item) => item.status !== "REAL REFERENCE").some((item) => item.figmaImage?.url)).toBe(true);
    expect(exportedAssets.filter((item) => item.status === "REAL REFERENCE").every((item) => !item.figmaImage)).toBe(true);
    await page.goto("/workspace");
    await expect(page.getByTestId("saved-project")).toContainText("Creative Collision 아이디어 · 6장");
  });

  test("another browser with only the account copy continues the same project", async ({ page }) => {
    const item = studioSavedItem({ ...project(), assets: project().assets.filter((asset) => asset.status !== "AI CONCEPT VISUAL") });
    await seed(page, { live: [heisei, camera], workspace: [item] });
    await page.goto(`/studio?project=${item.id}`);
    await expect(page.getByTestId("production-mode")).toContainText("CREATIVE COLLISION MODE");
    await expect(page.getByTestId("production-slide")).toHaveCount(6);
  });

  test("a deleted or unknown idea/project shows a clear error instead of an empty studio", async ({ page }) => {
    await seed(page, { live: [heisei, camera] });
    await page.goto("/studio?creative=cc-gone&idea=nope");
    await expect(page.getByTestId("production-missing")).toContainText("찾지 못했습니다");
    await page.goto("/studio?project=studio-single-nope");
    await expect(page.getByTestId("production-missing")).toBeVisible();
  });
});

test.describe("C7 Scenario A — single trend → short-form", () => {
  test("WHY links to Studio in single-trend mode; a 30s storyboard is planned, a thumbnail generated, and the project saved", async ({ page }) => {
    accept(page);
    const plan: ProductionPlan = { ...prod.response.plan, slides: [], scenes: [
      { scene_id: "scene-1", time_range: "0-3s", description: "디카 셔터를 누르는 손", visual_direction: "클로즈업", on_screen_text: "그 시절 디카", voice_over: "요즘 다시 보이는 디카", transition: "cut", asset_ref: "", image_prompt: "close-up of a compact digital camera", evidence_ids: [] },
      { scene_id: "scene-2", time_range: "3-30s", description: "사진을 고르는 장면", visual_direction: "탑뷰", on_screen_text: "나만의 한 컷", voice_over: "스마트폰과 다른 질감", transition: "fade", asset_ref: "", image_prompt: "top view of printed photos", evidence_ids: [] },
    ] };
    const production = await stubProduction(page, plan);
    const images = await stubImages(page);
    await seed(page, { live: [camera] });
    await page.goto(`/trends/${encodeURIComponent(camera.trendId)}/why`);
    await page.getByTestId("why-to-studio").click();
    await expect(page.getByTestId("production-mode")).toContainText("SINGLE TREND MODE");
    await page.getByTestId("setting-format").selectOption("shortform");
    await page.getByTestId("setting-duration").fill("30");
    // 단일 트렌드는 TREND EDITORIAL이 기본이다.
    await expect(page.getByTestId("mode-editorial")).toHaveAttribute("aria-checked", "true");
    await pickAngle(page);
    await page.getByTestId("production-generate").click();
    await expect(page.getByTestId("production-scene")).toHaveCount(2);
    expect(production[0].settings).toMatchObject({ format: "shortform", aspect: "9:16", durationSec: 30 });
    expect(production[0].concept).toBeUndefined();
    const first = page.getByTestId("production-scene").first();
    await first.getByTestId("slot-generate").click();
    await first.getByTestId("slot-image-run").click();
    await expect(first.locator('.slot [data-status="AI PRODUCTION ASSET"]')).toBeVisible();
    expect(images[0]).toMatchObject({ aspect: "9:16", purpose: "thumbnail" });
    await page.getByTestId("production-save").click();
    await expect(page.getByTestId("cloud-save-status")).toBeVisible();
    await page.goto("/workspace");
    await expect(page.getByTestId("saved-project")).toContainText("단일 트렌드 · 장면 2개 · 이미지 1개");
  });

  test("image generation needs a click and confirmation; cancelling sends nothing", async ({ page }) => {
    const images = await stubImages(page);
    await seed(page, { live: [heisei, camera], runs: [run] });
    await page.goto("/collision");
    await page.getByTestId("mode-creative").click();
    page.once("dialog", (dialog) => void dialog.dismiss());
    await page.getByTestId("creative-image-run").click();
    await expect(page.getByTestId("creative-image-run")).toBeEnabled();
    expect(images).toHaveLength(0);
  });

  test("APIs validate before access checks", async ({ request }) => {
    expect((await request.post("/api/studio/production", { data: {} })).status()).toBe(400);
    expect((await request.post("/api/studio/production", { data: { trends: [], settings: defaultSettings("cardnews") } })).status()).toBe(400);
    expect((await request.post("/api/studio/production", { data: { trends: [], concept: conceptFromIdea(run, booth), settings: { ...defaultSettings("shortform"), aspect: "4:5" } } })).status()).toBe(400);
    // 방향 없이 만들 수 있는 것은 TREND REPORT뿐이다.
    expect((await request.post("/api/studio/production", { data: { trends: [], concept: conceptFromIdea(run, booth), settings: defaultSettings("cardnews") } })).status()).toBe(400);
    expect((await request.post("/api/studio/production", { data: { trends: [], concept: conceptFromIdea(run, booth), settings: defaultSettings("cardnews"), angle: STUB_ANGLE } })).status()).toBe(401);
    expect((await request.post("/api/studio/production", { data: { trends: [], concept: conceptFromIdea(run, booth), settings: defaultSettings("cardnews", "report") } })).status()).toBe(401);
    expect((await request.post("/api/studio/angles", { data: { trends: [], mode: "editorial", settings: { format: "cardnews" } } })).status()).toBe(400);
    expect((await request.post("/api/studio/angles", { data: { trends: [], concept: conceptFromIdea(run, booth), mode: "concept", settings: { format: "cardnews" } } })).status()).toBe(401);
    expect((await request.post("/api/images", { data: { prompt: "a".repeat(30), aspect: "3:2" } })).status()).toBe(400);
    expect((await request.post("/api/images", { data: { prompt: booth.image_prompt, aspect: "4:5", purpose: "cover" } })).status()).toBe(401);
  });
});
