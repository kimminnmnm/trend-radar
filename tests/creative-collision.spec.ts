import { expect, test, type Page } from "@playwright/test";
import base from "./fixtures/live-pipeline.json";
import extra from "./fixtures/culture-validation.json";
import vdna from "./fixtures/visual-dna.json";
import fixture from "./fixtures/creative-collision.json";
import {
  creativeResultSchema, creativeSavedItem, ideaTypes, inputReport, isCreativePayload, slideRoles, toCreativeTrendInput, validateCreative,
  type CreativeResult, type CreativeRun,
} from "../lib/creative-collision";
import { loadCloudSavedItems, pushSavedItem } from "../lib/saved-items-cloud";
import type { LiveAnalysisSnapshot } from "../lib/types";
import { createStore, fakeSupabase, rowCount } from "./helpers/fake-supabase";

/*
 * PHASE V4.5 Creative Collision.
 * 픽스처: 2026-10-30 실측 — 헤이세이 레트로(Visual DNA 포함) × 발레코어, /api/creative-collision 1회(OpenAI).
 * 화면 테스트는 이 응답을 재사용하고 API를 다시 부르지 않는다. 이미지 생성 API도 가짜 응답으로 대신한다.
 */
const all = [...base.snapshots, ...extra.snapshots] as unknown as LiveAnalysisSnapshot[];
const heisei = { ...all.find((item) => item.trendName === "헤이세이 레트로")!, visualDna: (vdna as unknown as { record: LiveAnalysisSnapshot["visualDna"] }).record };
const ballet = all.find((item) => item.trendName === "발레코어")!;
const response = fixture.response as unknown as { result: CreativeResult; validation: CreativeRun["validation"]; model: string; analyzedAt: string; promptVersion: string; inputs: CreativeRun["inputs"] };
const run: CreativeRun = { id: "cc-fixture", trendKeys: [heisei.trendId, ballet.trendId], trendNames: [heisei.trendName, ballet.trendName], analyzedAt: response.analyzedAt, updatedAt: response.analyzedAt, model: response.model, promptVersion: response.promptVersion, result: response.result, inputs: response.inputs, validation: response.validation, selectedIdeaId: response.result.ideas[0].id, visuals: [] };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

test.describe("creative collision rules (no browser)", () => {
  test("the recorded real v1 result covers 9 distinct output types and 3 levels with briefs, prompts and 6-slide card news", () => {
    expect(creativeResultSchema.safeParse(response.result).success).toBe(true);
    const ideas = response.result.ideas;
    expect(new Set(ideas.map((item) => item.idea_type)).size).toBe(9);
    expect(ideas.every((item) => (ideaTypes as readonly string[]).includes(item.idea_type))).toBe(true);
    expect(new Set(ideas.map((item) => item.creativity_level))).toEqual(new Set(["SAFE", "BOLD", "WILD"]));
    expect(new Set(ideas.map((item) => item.title)).size).toBe(ideas.length);
    for (const idea of ideas) {
      expect(idea.image_prompt.length).toBeGreaterThan(80);
      expect(Object.values(idea.visual_brief).every((value) => value.trim().length > 0)).toBe(true);
      expect(idea.cardnews_slides.map((slide) => slide.role)).toEqual([...slideRoles]);
      expect(idea.title).not.toMatch(/감성을 결합|새로운 경험$/);
    }
    expect(response.validation.genericTitles).toEqual([]);
    expect(response.validation.levelCounts).toEqual({ SAFE: 4, BOLD: 3, WILD: 2 });
  });

  test("validation removes invented refs, downgrades uncited evidence claims, and flags generic titles", () => {
    const idea = response.result.ideas[0];
    const raw: CreativeResult = { ...response.result, ideas: [
      { ...idea, evidence_mode: "evidence_based", evidence_refs: ["A:GHOST-01"] },
      { ...idea, title: "A와 B의 감성을 결합한 콘텐츠", concept_line: "두 흐름을 섞은 특별한 무드의 시리즈", evidence_refs: ["B:WEB-01"] },
    ] };
    // 실측 결과가 인용한 근거 ID는 모두 허용하고, 만들어 낸 ID 하나만 섞는다.
    const real = [...Object.values(response.result.structure).flat().flatMap((item) => item.refs), ...response.result.ideas.flatMap((item) => item.evidence_refs), "B:WEB-01"];
    const { result, validation } = validateCreative(raw, real, ["A", "B"]);
    expect(result.ideas[0]).toMatchObject({ evidence_mode: "hybrid_inference", evidence_refs: [] });
    expect(result.ideas[1].evidence_refs).toEqual(["B:WEB-01"]);
    expect(validation).toMatchObject({ removedRefs: ["A:GHOST-01"], downgradedModes: 1, genericTitles: ["A와 B의 감성을 결합한 콘텐츠"] });
    expect(new Set(result.ideas.map((item) => item.id)).size).toBe(2);
  });

  test("missing inputs are reported instead of being invented", () => {
    const report = inputReport(toCreativeTrendInput(heisei, "A"), toCreativeTrendInput(ballet, "B"), null, null);
    expect(report.used).toContain("헤이세이 레트로 Visual DNA");
    expect(report.missing).toEqual(expect.arrayContaining(["발레코어 Visual DNA", "Culture Map 관계", "기존 Culture Collision"]));
  });

  test("Workspace saves reuse saved_items: one row per run, restorable, isolated by account", async () => {
    const store = createStore();
    const a = fakeSupabase(store, { id: "user-a" }), b = fakeSupabase(store, { id: "user-b" });
    const item = creativeSavedItem(run, "2026-10-30T01:00:00.000Z");
    expect(item.type).toBe("insight");
    expect((await pushSavedItem(a, "user-a", item)).ok).toBe(true);
    expect((await pushSavedItem(a, "user-a", creativeSavedItem({ ...run, selectedIdeaId: run.result.ideas[3].id }, "2026-10-30T02:00:00.000Z"))).ok).toBe(true);
    expect(rowCount(store, "saved_items", "user-a")).toBe(1);
    const loaded = await loadCloudSavedItems(a, "user-a");
    const restored = loaded.ok ? loaded.items[0].item : null;
    expect(isCreativePayload(restored?.payload)).toBe(true);
    expect(isCreativePayload(restored?.payload) && restored!.payload.run.selectedIdeaId).toBe(run.result.ideas[3].id);
    const other = await loadCloudSavedItems(b, "user-b");
    expect(other.ok && other.items).toEqual([]);
  });
});

async function seed(page: Page, data: { live?: unknown[]; workspace?: unknown[]; runs?: unknown[] }) {
  await page.goto("/");
  await page.evaluate((d) => {
    localStorage.clear();
    localStorage.setItem("trend-radar-onboarded", "1");
    localStorage.setItem("trend-radar-live-analyses", JSON.stringify(d.live ?? []));
    if (d.workspace) localStorage.setItem("trend-radar-workspace", JSON.stringify(d.workspace));
    if (d.runs) localStorage.setItem("trend-radar-creative-collisions", JSON.stringify(d.runs));
  }, data);
}
const openCreative = async (page: Page) => { await page.goto("/collision"); await page.getByTestId("mode-creative").click(); return page.getByTestId("creative-collision"); };
const stored = (page: Page) => page.evaluate(() => ({ runs: JSON.parse(localStorage.getItem("trend-radar-creative-collisions") ?? "[]"), workspace: JSON.parse(localStorage.getItem("trend-radar-workspace") ?? "[]") }));

test.describe("creative collision UI", () => {
  test("pick A/B, see input gaps and signals, generate SAFE/BOLD/WILD cards, inspect the detail panel", async ({ page }) => {
    let sent: { a: { name: string; visualDna: unknown }; b: { name: string; visualDna: unknown } } | null = null;
    await page.route("**/api/creative-collision", async (route) => { sent = route.request().postDataJSON(); await route.fulfill({ json: { mode: "live", cached: false, ...response } }); });
    await seed(page, { live: [heisei, ballet] });
    const view = await openCreative(page);
    await view.getByTestId("creative-a").selectOption(heisei.trendId);
    await view.getByTestId("creative-b").selectOption(ballet.trendId);
    await expect(view.getByTestId("creative-inputs")).toContainText("발레코어 Visual DNA");
    await expect(view.getByTestId("creative-shared")).toBeVisible();
    page.once("dialog", (dialog) => void dialog.accept());
    await view.getByTestId("creative-generate").click();
    await expect(view.getByTestId("creative-idea")).toHaveCount(9);
    expect(sent!.a.name).toBe("헤이세이 레트로");
    expect(sent!.a.visualDna).not.toBeNull();
    expect(sent!.b.visualDna).toBeNull();
    for (const level of ["SAFE", "BOLD", "WILD"]) await expect(view.getByTestId(`creative-level-${level}`).getByTestId("creative-idea").first()).toBeVisible();
    await expect(view.getByTestId("creative-level-balance")).toContainText("SAFE 4");
    const wild = response.result.ideas.find((item) => item.creativity_level === "WILD")!;
    await view.getByTestId("creative-idea").filter({ hasText: wild.title }).click();
    const detail = view.getByTestId("creative-detail");
    await expect(detail.locator("h3")).toHaveText(wild.title);
    await expect(detail.getByTestId("creative-brief")).toContainText(wild.visual_brief.core_subject);
    await expect(detail.getByTestId("creative-prompt")).toContainText(wild.image_prompt.slice(0, 40));
    await expect(detail.getByTestId("creative-visual")).toContainText("AI CONCEPT VISUAL · 실제 증거 이미지가 아님");
    const saved = await stored(page);
    expect(saved.runs).toHaveLength(1);
    expect(saved.runs[0].selectedIdeaId).toBe(wild.id);
  });

  test("a concept visual is generated only on request, labelled as AI, downscaled, and kept with the run", async ({ page }) => {
    let calls = 0;
    let sent: { aspect: string; purpose: string; prompt: string } | null = null;
    await page.route("**/api/images", (route) => { calls += 1; sent = route.request().postDataJSON(); return route.fulfill({ json: { kind: "AI CONCEPT VISUAL", status: "AI CONCEPT VISUAL", cached: false, createdAt: "2026-10-30T03:00:00.000Z", mimeType: "image/jpeg", base64: PNG, model: "test-image-model", size: "1024x1024" } }); });
    await seed(page, { live: [heisei, ballet], runs: [run] });
    const view = await openCreative(page);
    expect(calls).toBe(0);
    page.once("dialog", (dialog) => void dialog.accept());
    await view.getByTestId("creative-image-prompt").fill(`${run.result.ideas[0].image_prompt} Soft morning light.`);
    await view.getByTestId("creative-image-run").click();
    await expect(view.getByTestId("creative-visual").getByTestId("asset-image").first().locator("img")).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
    await expect(view.getByTestId("creative-visual").getByTestId("asset-image").first()).toContainText("AI CONCEPT VISUAL");
    await expect(view.getByTestId("creative-visual")).toContainText("test-image-model");
    expect(calls).toBe(1);
    expect(sent!).toMatchObject({ aspect: "1:1", purpose: "concept" });
    expect(sent!.prompt).toContain("Soft morning light.");
    const saved = await stored(page);
    expect(saved.runs[0].visuals[0]).toMatchObject({ kind: "AI CONCEPT VISUAL", ideaId: run.selectedIdeaId, model: "test-image-model" });
  });

  test("Workspace saves the run once; Content Studio opens the idea in Creative Collision mode with editable concept", async ({ page }) => {
    await seed(page, { live: [heisei, ballet], runs: [run] });
    const view = await openCreative(page);
    await view.getByTestId("creative-save").click();
    await expect(view.getByTestId("cloud-save-status")).toBeVisible();
    await view.getByTestId("creative-save").click();
    let saved = await stored(page);
    expect(saved.workspace.filter((item: { id: string }) => item.id === "creative-cc-fixture")).toHaveLength(1);
    const idea = run.result.ideas[0];
    await view.getByTestId("creative-to-studio").click();
    await expect(page).toHaveURL(/\/studio\?project=studio-creative-cc-fixture/);
    await expect(page.getByTestId("production-mode")).toContainText("CREATIVE COLLISION MODE");
    await expect(page.getByTestId("concept-title")).toHaveValue(idea.title);
    await page.goto("/workspace");
    await expect(page.getByTestId("saved-creative")).toContainText(idea.concept_line.slice(0, 20));
    saved = await stored(page);
    expect(saved.workspace).toHaveLength(1);
  });

  test("another browser restores the run from the account copy in Workspace (no local run)", async ({ page }) => {
    await seed(page, { live: [heisei, ballet], workspace: [creativeSavedItem(run, "2026-10-30T01:00:00.000Z")] });
    const view = await openCreative(page);
    await expect(view.getByTestId("creative-idea")).toHaveCount(9);
    await page.goto(`/studio?creative=cc-fixture&idea=${encodeURIComponent(run.result.ideas[2].id)}`);
    await expect(page.getByTestId("concept-title")).toHaveValue(run.result.ideas[2].title);
  });

  test("with fewer than 2 analysed trends nothing is generated", async ({ page }) => {
    await seed(page, { live: [heisei] });
    const view = await openCreative(page);
    await expect(view).toHaveCount(0);
    await expect(page.getByTestId("creative-not-ready")).toBeVisible();
  });

  test("the APIs validate input before access checks and never run without access", async ({ request }) => {
    const a = toCreativeTrendInput(heisei, "A"), b = toCreativeTrendInput(ballet, "B");
    expect((await request.post("/api/creative-collision", { data: {} })).status()).toBe(400);
    expect((await request.post("/api/creative-collision", { data: { a, b: { ...a, ref: "B" } } })).status()).toBe(400);
    expect((await request.post("/api/creative-collision", { data: { a, b } })).status()).toBe(401);
    expect((await request.post("/api/creative-collision/image", { data: { prompt: "short" } })).status()).toBe(400);
    expect((await request.post("/api/creative-collision/image", { data: { prompt: run.result.ideas[0].image_prompt } })).status()).toBe(401);
  });
});
