import { expect, test, type Route } from "@playwright/test";
import fs from "node:fs";
import lockFixture from "./fixtures/context-lock-t6.json";
import recordedImages from "./fixtures/image-brief-t7.json";
import { briefBlock, EVIDENCE_GUARD, forbiddenMisinterpretations, slideImageBrief } from "../lib/image-brief";
import { composeImagePrompt, imageRequestSchema, type ImageAssetRef } from "../lib/image-assets";
import { AI_IMAGE_LABEL, buildCardDesign } from "../lib/card-design";
import { defaultSettings, emptySlideImage, withSlideImage, type ProductionPlan, type StudioProject } from "../lib/content-production";
import type { EditorialContextLock } from "../lib/editorial-lock";

/*
 * T7 SEMANTIC IMAGE ALIGNMENT. image-brief-t7.json: 2026-11-02 /api/images 실측 — 명세의 잘못된 예시 프롬프트("화장품 UI 앞의 로블록스풍 캐릭터")를
 * 의미 구조 없이(before) / 함께(after, after2) 보낸 최종 프롬프트와 모델 수정 프롬프트. 이미지 판정은 사람이 직접 보고 기록했다.
 */
const lock = (lockFixture as unknown as { lock: EditorialContextLock }).lock;
const plan = (lockFixture as unknown as { after: { production: { plan: ProductionPlan } } }).after.production.plan;
type Shot = { request: { prompt: string; brief?: unknown }; prompt: string; revisedPrompt: string | null; status: string };
const shots = recordedImages as unknown as Record<"before" | "after" | "after2", Shot>;
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

test.describe("T7 recorded images (same wrong prompt, with and without the semantic brief)", () => {
  test("before: the final prompt is only the wrong scene; the model planned a character in a makeover room with a UI", () => {
    expect(shots.before.prompt).not.toMatch(/SUBJECT:|DO NOT DEPICT/);
    expect(shots.before.revisedPrompt).toMatch(/makeover room|interface|UI/i);
  });

  test("after: the brief leads the prompt and the model planned the avatar-vs-real-life comparison instead", () => {
    for (const shot of [shots.after, shots.after2]) {
      expect(shot.prompt.startsWith("SCENE PURPOSE:")).toBe(true);
      expect(shot.prompt).toContain("DO NOT DEPICT");
      expect(shot.prompt).toContain("a game character simply standing in front of a cosmetics or makeup menu UI");
      expect(shot.prompt).toContain(`Editor's scene idea: ${shots.before.request.prompt}`);
      expect(shot.revisedPrompt).toMatch(/side-by-side|comparison/i);
      expect(shot.revisedPrompt).toMatch(/real[- ]life/i);
      expect(shot.status).toBe("AI PRODUCTION ASSET");
    }
    // after2: 사람을 사진처럼 그리지 말라는 지시가 프롬프트에 들어갔다.
    expect(shots.after2.prompt).toMatch(/never photorealistic/);
    expect(shots.after.prompt).not.toMatch(/never photorealistic/);
  });
});

test.describe("T7 brief rules (deterministic)", () => {
  test("each slide gets its own brief from its own copy and visual direction; shared parts come from the context lock", () => {
    const briefs = plan.slides.map((slide) => slideImageBrief(slide, { lock, title: plan.title }));
    plan.slides.forEach((slide, index) => {
      expect(briefs[index].visualDirection).toContain(slide.visual_direction.slice(0, 40));
      expect(briefs[index].scenePurpose).toContain(slide.headline.replace(/\s+/g, " ").slice(0, 10));
      expect(briefs[index]).toMatchObject({ subject: lock.subject, action: lock.coreBehavior, object: lock.object });
    });
    expect(new Set(briefs.map((brief) => brief.visualDirection)).size).toBe(plan.slides.length);
    expect(briefs[0].visualDirection).toMatch(/^Prefer an editorial comparison/);
  });

  test("forbidden misinterpretations follow the lock: direction-specific, drift-specific, and always the evidence guard", () => {
    const forbidden = forbiddenMisinterpretations(lock);
    expect(forbidden[0]).toBe(EVIDENCE_GUARD);
    expect(forbidden.join(" ")).toMatch(/cosmetics or makeup menu UI/);
    expect(forbidden.join(" ")).toMatch(/item shop, price tag/);
    expect(forbidden.join(" ")).toMatch(/historical imagery about the origin of 메이크업/);
    const inside = forbiddenMisinterpretations({ ...lock, direction: "A 안에서 B" });
    expect(inside.join(" ")).toMatch(/recreating the look in real life/);
    expect(inside.join(" ")).not.toMatch(/makeup menu UI/);
    expect(forbiddenMisinterpretations()).toEqual([EVIDENCE_GUARD, "official brand logos, platform logos or copyrighted characters"]);
    expect(forbiddenMisinterpretations({ ...lock, enabled: false })).toHaveLength(2);
  });

  test("without a brief the final prompt is exactly the previous format (same cache key, same behavior)", () => {
    const request = { prompt: "A clean editorial illustration of an eye makeup look", purpose: "body" as const, aspect: "4:5" as const };
    expect(composeImagePrompt(request).startsWith(request.prompt)).toBe(true);
    expect(composeImagePrompt(request)).not.toMatch(/SCENE PURPOSE|DO NOT DEPICT/);
    const withBrief = composeImagePrompt({ ...request, brief: slideImageBrief(plan.slides[1], { lock, title: plan.title }) });
    expect(withBrief.startsWith(briefBlock(slideImageBrief(plan.slides[1], { lock, title: plan.title })))).toBe(true);
    expect(withBrief).toMatch(/Do not render any text, letters or logos/);
  });

  test("the image request accepts a brief and rejects malformed ones before any paid access check", async ({ request }) => {
    expect(imageRequestSchema.safeParse({ prompt: "x".repeat(30), brief: slideImageBrief(plan.slides[0], { lock, title: plan.title }) }).success).toBe(true);
    const response = await request.post("/api/images", { data: { prompt: "x".repeat(30), brief: { forbidden: Array.from({ length: 20 }, () => "no") } } });
    expect(response.status()).toBe(400);
  });
});

const asset = (id: string, status: ImageAssetRef["status"]): ImageAssetRef => ({ id, status, title: id, prompt: "p", model: "m", aspect: "4:5", purpose: "body", createdAt: "2026-11-02T00:00:00.000Z", rights: "r", dataUrl: `data:image/png;base64,${PNG}`, ...(status === "REAL REFERENCE" ? { url: "https://example.com/a.jpg", sourceUrl: "https://example.com/a" } : {}) });
const lockedProject = (): StudioProject => ({
  id: "t7-brief", mode: "single", title: plan.title, source: { trendKeys: ["t"], trendNames: ["메이크업"] }, settings: { ...defaultSettings("cardnews"), slideCount: 6 },
  plan: { ...plan, slides: plan.slides.map((slide) => withSlideImage({ ...slide }, emptySlideImage(slide.image_prompt))) }, assets: [], edited: false, contextLock: lock,
  createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z",
});

test.describe("T7 AI label on cards", () => {
  test("an AI image on a card carries an on-card 'AI 생성 이미지' label; real references and empty slides do not", () => {
    const base = lockedProject();
    const slides = base.plan!.slides.map((slide, index) => index === 0 ? withSlideImage(slide, { ...slide.image!, assetId: "ai-1", status: "ready", source: "ai" }) : index === 1 ? withSlideImage(slide, { ...slide.image!, assetId: "real-1", status: "ready", source: "reference" }) : slide);
    const project = { ...base, plan: { ...base.plan!, slides }, assets: [asset("ai-1", "AI PRODUCTION ASSET"), asset("real-1", "REAL REFERENCE")] };
    const design = buildCardDesign({ project, plan: project.plan, controls: {}, visualDna: null });
    const labels = (index: number) => design.frames[index].elements.filter((element) => element.kind === "text" && element.text === AI_IMAGE_LABEL);
    expect(labels(0)).toHaveLength(1);
    expect(design.frames[0].notes.join(" ")).toMatch(/AI 생성 이미지/);
    expect(labels(1)).toHaveLength(0);
    for (let index = 2; index < design.frames.length; index += 1) expect(labels(index)).toHaveLength(0);
    // 표시는 이미지 영역 안에 있다.
    const image = design.frames[0].elements.find((element) => element.kind === "image")!;
    const label = labels(0)[0];
    expect(label.x).toBeGreaterThanOrEqual(image.x);
    expect(label.x + label.w).toBeLessThanOrEqual(image.x + image.w);
    expect(label.y).toBeGreaterThanOrEqual(image.y);
  });
});

test.describe("T7 Content Studio slide images", () => {
  test("parallel generation sends each slide's own brief, lands on the right slide, keeps the brief and shows the AI label", async ({ page }) => {
    const initial = lockedProject();
    await page.goto("/");
    await page.evaluate((value) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-studio-projects", JSON.stringify([value])); }, initial);
    const pending: Array<{ route: Route; body: { prompt: string; brief?: { visualDirection: string; scenePurpose: string; forbidden: string[]; action: string } } }> = [];
    await page.route("**/api/images", async (route) => { pending.push({ route, body: route.request().postDataJSON() }); });
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto(`/studio?project=${initial.id}`);
    const second = page.getByTestId("production-slide").nth(1);
    const fourth = page.getByTestId("production-slide").nth(3);
    await second.getByTestId("slot-generate").click();
    await expect(second.getByTestId("slot-image-brief")).toContainText(plan.slides[1].visual_direction.slice(0, 20));
    await second.getByTestId("slot-image-brief").locator("summary").click();
    await expect(second.getByTestId("slot-image-brief")).toContainText("FORBIDDEN MISINTERPRETATIONS");
    await second.getByTestId("slot-image-run").click();
    await expect.poll(() => pending.length).toBe(1);
    await fourth.getByTestId("slot-generate").click();
    await fourth.getByTestId("slot-image-run").click();
    await expect.poll(() => pending.length).toBe(2);
    expect(pending[0].body.brief?.visualDirection).toContain(plan.slides[1].visual_direction.slice(0, 30));
    expect(pending[1].body.brief?.visualDirection).toContain(plan.slides[3].visual_direction.slice(0, 30));
    expect(pending[0].body.brief?.scenePurpose).not.toBe(pending[1].body.brief?.scenePurpose);
    expect(pending[0].body.brief?.action).toBe(lock.coreBehavior);
    expect(pending[0].body.brief?.forbidden.join(" ")).toMatch(/makeup menu UI/);
    // 4번 응답이 먼저 끝나도 각 슬라이드에만 붙는다.
    for (const index of [1, 0]) await pending[index].route.fulfill({ json: { status: "AI PRODUCTION ASSET", cached: false, createdAt: `2026-11-02T01:00:0${index}.000Z`, base64: PNG, model: "test-image", prompt: pending[index].body.prompt, size: "1024x1280" } });
    await expect(second.locator('[data-status="AI PRODUCTION ASSET"]')).toBeVisible();
    await expect(fourth.locator('[data-status="AI PRODUCTION ASSET"]')).toBeVisible();
    await expect(second.getByTestId("asset-ai-label").first()).toContainText("AI 생성 이미지 · 실제 사례 아님");
    for (const index of [0, 2, 4, 5]) await expect(page.getByTestId("production-slide").nth(index).locator('[data-status="AI PRODUCTION ASSET"]')).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]")[0] as StudioProject);
    const ids = saved.plan!.slides.map((slide) => slide.image?.assetId ?? "");
    expect(ids.filter(Boolean)).toHaveLength(2);
    const byId = new Map(saved.assets.map((item) => [item.id, item]));
    expect(byId.get(ids[1])?.brief?.visualDirection).toContain(plan.slides[1].visual_direction.slice(0, 30));
    expect(byId.get(ids[3])?.brief?.visualDirection).toContain(plan.slides[3].visual_direction.slice(0, 30));
    // Figma JSON: 각 슬라이드 IMAGE는 자기 자산, AI 이미지는 "실제 사진 아님" 표기.
    const download = page.waitForEvent("download");
    await page.getByTestId("production-figma").click();
    const exported = JSON.parse(fs.readFileSync((await (await download).path())!, "utf8")) as { slides: Array<{ elements: Array<{ type: string; assetId?: string }> }>; assets: Array<{ id: string; attribution: string }> };
    const figmaIds = exported.slides.map((slide) => slide.elements.find((element) => element.type === "IMAGE")?.assetId ?? "");
    expect(figmaIds[1]).toBe(ids[1]);
    expect(figmaIds[3]).toBe(ids[3]);
    expect(figmaIds.filter(Boolean)).toHaveLength(2);
    for (const id of [ids[1], ids[3]]) expect(exported.assets.find((item) => item.id === id)?.attribution).toMatch(/AI 생성 이미지.*실제 사진 아님/);
    expect(JSON.stringify(exported)).toContain(AI_IMAGE_LABEL);
  });

  test("Creative Collision concept images keep their existing request (no brief)", async ({ page }) => {
    await page.goto("/");
    expect(composeImagePrompt({ prompt: "A concept visual for a pop-up store idea", purpose: "concept", aspect: "1:1" })).toMatch(/^A concept visual/);
  });
});
