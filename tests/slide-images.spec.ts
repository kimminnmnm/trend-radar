import { expect, test, type Route } from "@playwright/test";
import fs from "node:fs";
import fixture from "./fixtures/studio-production.json";
import {
  beginSlideImageRequest, defaultSettings, deleteProductionSlide, duplicateProductionSlide, emptySlideImage,
  failSlideImageRequest, reorderProductionSlide, resolveSlideImageRequest, slideImageAssetId,
  resolvedSlideImageAssetId, syncProjectSlideImages, validateProduction, withSlideImage,
  type ProductionPlan, type StudioProject,
} from "../lib/content-production";
import { toFigmaExport } from "../lib/figma-export";
import { studioSavedItem } from "../lib/studio-cloud";
import type { ImageAssetRef } from "../lib/image-assets";

const recorded = fixture as unknown as { response: { plan: ProductionPlan } };
const asset = (id: string, extra: Partial<ImageAssetRef> = {}): ImageAssetRef => ({
  id, status: "AI PRODUCTION ASSET", title: id, prompt: `prompt ${id}`, model: "test-image", aspect: "4:5", purpose: "body",
  createdAt: "2026-11-02T00:00:00.000Z", rights: "AI test asset", dataUrl: `data:image/jpeg;base64,${id}`,
  ...extra,
});
const project = (): StudioProject => {
  const slides = recorded.response.plan.slides.map((slide, index) => withSlideImage({ ...slide, slide_id: `slide-${index + 1}`, number: index + 1 }, emptySlideImage(slide.image_prompt)));
  return {
    id: "slide-image-test", mode: "single", title: "slide image test", source: { trendKeys: ["t"], trendNames: ["T"] },
    settings: { ...defaultSettings("cardnews"), slideCount: 6 }, plan: { ...recorded.response.plan, slides }, assets: [], edited: false,
    createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z",
  };
};
const ids = (value: StudioProject) => value.plan!.slides.map(slideImageAssetId);
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

test.describe("slide-scoped image state", () => {
  test("generating and resolving slide 1 leaves the other five slides untouched", () => {
    const before = project();
    const generating = beginSlideImageRequest(before, "slide-1", "req-1", "first prompt")!;
    expect(generating.plan!.slides[0].image).toMatchObject({ status: "generating", requestId: "req-1" });
    expect(generating.plan!.slides.slice(1).every((slide) => slide.image?.status === "idle" && !slide.image?.assetId)).toBe(true);
    const ready = resolveSlideImageRequest(generating, "slide-1", "req-1", asset("asset-1"))!;
    expect(ids(ready)).toEqual(["asset-1", "", "", "", "", ""]);
  });

  test("regenerating slide 3 changes only slide 3 and rejects an older response", () => {
    let value = beginSlideImageRequest(project(), "slide-1", "r1", "one")!;
    value = resolveSlideImageRequest(value, "slide-1", "r1", asset("asset-1"))!;
    value = beginSlideImageRequest(value, "slide-3", "r3-old", "old")!;
    value = beginSlideImageRequest(value, "slide-3", "r3-new", "new")!;
    expect(resolveSlideImageRequest(value, "slide-3", "r3-old", asset("stale"))).toBeNull();
    value = resolveSlideImageRequest(value, "slide-3", "r3-new", asset("asset-3"))!;
    expect(ids(value)).toEqual(["asset-1", "", "asset-3", "", "", ""]);
  });

  test("two parallel requests may finish out of order and still land on their own slides", () => {
    let value = beginSlideImageRequest(project(), "slide-2", "parallel-2", "two")!;
    value = beginSlideImageRequest(value, "slide-5", "parallel-5", "five")!;
    value = resolveSlideImageRequest(value, "slide-5", "parallel-5", asset("asset-5"))!;
    value = resolveSlideImageRequest(value, "slide-2", "parallel-2", asset("asset-2"))!;
    expect(ids(value)).toEqual(["", "asset-2", "", "", "asset-5", ""]);
    expect(value.assets.map((item) => item.id).sort()).toEqual(["asset-2", "asset-5"]);
  });

  test("failure and removal are scoped to one slide", () => {
    let value = beginSlideImageRequest(project(), "slide-1", "r1", "one")!;
    value = resolveSlideImageRequest(value, "slide-1", "r1", asset("asset-1"))!;
    value = beginSlideImageRequest(value, "slide-4", "r4", "four")!;
    value = failSlideImageRequest(value, "slide-4", "r4", "quota")!;
    expect(value.plan!.slides[3].image).toMatchObject({ status: "error", errorMessage: "quota" });
    value = { ...value, plan: { ...value.plan!, slides: value.plan!.slides.map((slide) => slide.slide_id === "slide-4" ? withSlideImage(slide, emptySlideImage(slide.image_prompt)) : slide) } };
    expect(ids(value)).toEqual(["asset-1", "", "", "", "", ""]);
    expect(value.plan!.slides[0].image?.status).toBe("ready");
  });

  test("workspace JSON and cloud metadata restore every slide's own asset", () => {
    let value = beginSlideImageRequest(project(), "slide-1", "r1", "one")!;
    value = resolveSlideImageRequest(value, "slide-1", "r1", asset("asset-1"))!;
    value = beginSlideImageRequest(value, "slide-3", "r3", "three")!;
    value = resolveSlideImageRequest(value, "slide-3", "r3", asset("asset-3"))!;
    const cloudAssets = value.assets.map((item) => ({ ...item, dataUrl: undefined, storagePath: `user/project/${item.id}.jpg` }));
    const cloud = syncProjectSlideImages(value, cloudAssets);
    const restored = JSON.parse(JSON.stringify(studioSavedItem(cloud))).payload.project as StudioProject;
    expect(ids(restored)).toEqual(["asset-1", "", "asset-3", "", "", ""]);
    expect(restored.plan!.slides[0].image?.storagePath).toContain("asset-1.jpg");
    expect(restored.plan!.slides[2].image?.storagePath).toContain("asset-3.jpg");
    expect(restored.plan!.slides[0].image?.previewUrl).toBeUndefined();
  });

  test("restore repairs stale image state from a valid legacy link and clears missing links", () => {
    const a = asset("asset-a");
    const b = asset("asset-b");
    const base = project();
    const slides = base.plan!.slides.map((slide, index) => index === 0
      ? { ...slide, image_ref: "asset-b", image: { ...emptySlideImage(), assetId: "deleted-asset", status: "ready" as const, source: "ai" as const } }
      : index === 1
        ? { ...slide, image_ref: "also-missing", image: { ...emptySlideImage(), assetId: "missing", status: "ready" as const, source: "ai" as const } }
        : slide);
    const restored = syncProjectSlideImages({ ...base, assets: [a, b], plan: { ...base.plan!, slides } });
    expect(resolvedSlideImageAssetId(slides[0], [a, b])).toBe("asset-b");
    expect(ids(restored).slice(0, 2)).toEqual(["asset-b", ""]);
    expect(restored.plan!.slides[0].image).toMatchObject({ assetId: "asset-b", status: "ready" });
    expect(restored.plan!.slides[1].image).toMatchObject({ status: "idle", source: null });
    const exported = toFigmaExport({ ...base, assets: [a, b], plan: { ...base.plan!, slides } });
    expect(exported.slides[0].elements.find((element) => element.type === "IMAGE")).toMatchObject({ assetId: "asset-b" });
    expect(exported.slides[1].elements.find((element) => element.type === "IMAGE")).toBeUndefined();
  });

  test("Figma export uses the asset id from each slide image, not a shared last image", () => {
    let value = beginSlideImageRequest(project(), "slide-1", "r1", "one")!;
    value = resolveSlideImageRequest(value, "slide-1", "r1", asset("asset-1"))!;
    value = beginSlideImageRequest(value, "slide-3", "r3", "three")!;
    value = resolveSlideImageRequest(value, "slide-3", "r3", asset("asset-3"))!;
    const exported = toFigmaExport(value);
    const imageIds = exported.slides.map((slide) => slide.elements.find((element) => element.type === "IMAGE" && "assetId" in element)?.assetId ?? "");
    expect(imageIds).toEqual(["asset-1", "", "asset-3", "", "", ""]);
  });

  test("reorder keeps image with its stable slide id; duplicate starts with no shared image; delete does not disturb others", () => {
    let value = beginSlideImageRequest(project(), "slide-1", "r1", "one")!;
    value = resolveSlideImageRequest(value, "slide-1", "r1", asset("asset-1"))!;
    const reordered = reorderProductionSlide(value.plan!, "slide-1", 4);
    expect(reordered.slides[4]).toMatchObject({ slide_id: "slide-1", image_ref: "asset-1" });
    const duplicated = duplicateProductionSlide(reordered, "slide-1");
    expect(duplicated.slides[5].slide_id).not.toBe("slide-1");
    expect(slideImageAssetId(duplicated.slides[5])).toBe("");
    expect(slideImageAssetId(duplicated.slides[4])).toBe("asset-1");
    const deleted = deleteProductionSlide(duplicated, duplicated.slides[5].slide_id);
    expect(deleted.slides.find((slide) => slide.slide_id === "slide-1")).toMatchObject({ image_ref: "asset-1" });
  });

  test("server validation preserves valid ids and repairs duplicate slide ids", () => {
    const raw = project().plan!;
    const duplicate = { ...raw, slides: raw.slides.map((slide) => ({ ...slide, slide_id: "same" })) };
    const result = validateProduction(duplicate, { ...defaultSettings("cardnews"), slideCount: 6 }, [], []);
    expect(new Set(result.plan.slides.map((slide) => slide.slide_id)).size).toBe(6);
  });
});

test.describe("Content Studio slide image integration", () => {
  test("manual link, relink, unlink and reload stay scoped to the selected slide", async ({ page }) => {
    const initial = { ...project(), assets: [asset("asset-a", { dataUrl: `data:image/png;base64,${PNG}` }), asset("asset-b", { dataUrl: `data:image/png;base64,${PNG}` })] };
    await page.goto("/");
    await page.evaluate((value) => {
      localStorage.clear();
      localStorage.setItem("trend-radar-onboarded", "1");
      localStorage.setItem("trend-radar-studio-projects", JSON.stringify([value]));
    }, initial);
    await page.goto(`/studio?project=${initial.id}`);
    const first = page.getByTestId("production-slide").nth(0);
    const third = page.getByTestId("production-slide").nth(2);

    await first.getByTestId("slot-link").click();
    await first.getByTestId("asset-picker").locator('[data-asset-id="asset-a"]').click();
    await third.getByTestId("slot-link").click();
    await third.getByTestId("asset-picker").locator('[data-asset-id="asset-b"]').click();
    await expect(first.getByTestId("slide-image-state")).toHaveAttribute("data-state", "ready");
    await expect(third.getByTestId("slide-image-state")).toHaveAttribute("data-state", "ready");

    await first.getByTestId("slot-link").click();
    await first.getByTestId("asset-picker").locator('[data-asset-id="asset-b"]').click();
    await first.getByTestId("slot-unlink").click();
    const linked = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]") as StudioProject[];
      return saved[0].plan!.slides.map((slide) => slide.image?.assetId ?? slide.image_ref ?? "");
    });
    expect(linked).toEqual(["", "", "asset-b", "", "", ""]);

    await page.reload();
    await expect(page.getByTestId("production-slide").nth(0).getByTestId("slot-unlink")).toHaveCount(0);
    await expect(page.getByTestId("production-slide").nth(2).getByTestId("slot-unlink")).toBeVisible();
    const restored = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]") as StudioProject[];
      return saved[0].plan!.slides.map((slide) => ({ current: slide.image?.assetId ?? "", legacy: slide.image_ref }));
    });
    expect(restored[0]).toEqual({ current: "", legacy: "" });
    expect(restored[2]).toEqual({ current: "asset-b", legacy: "asset-b" });
  });

  test("parallel UI generation, reload and Figma JSON keep images on the requested slides", async ({ page }) => {
    const initial = project();
    await page.goto("/");
    await page.evaluate((value) => {
      localStorage.clear();
      localStorage.setItem("trend-radar-onboarded", "1");
      localStorage.setItem("trend-radar-studio-projects", JSON.stringify([value]));
    }, initial);
    const pending: Array<{ route: Route; body: { prompt: string } }> = [];
    await page.route("**/api/images", async (route) => { pending.push({ route, body: route.request().postDataJSON() }); });
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto(`/studio?project=${initial.id}`);
    const first = page.getByTestId("production-slide").nth(0);
    const third = page.getByTestId("production-slide").nth(2);
    await first.getByTestId("slot-generate").click();
    await first.getByTestId("slot-image-run").click();
    await expect.poll(() => pending.length).toBe(1);
    await third.getByTestId("slot-generate").click();
    await third.getByTestId("slot-image-run").click();
    await expect.poll(() => pending.length).toBe(2);
    // 3번 응답이 먼저 끝나도 각 requestId/slideId에만 적용된다.
    await pending[1].route.fulfill({ json: { status: "AI PRODUCTION ASSET", cached: false, createdAt: "2026-11-02T01:00:03.000Z", base64: PNG, model: "test-image", prompt: pending[1].body.prompt, size: "1024x1280" } });
    await expect(third.locator('[data-status="AI PRODUCTION ASSET"]')).toBeVisible();
    await pending[0].route.fulfill({ json: { status: "AI PRODUCTION ASSET", cached: false, createdAt: "2026-11-02T01:00:01.000Z", base64: PNG, model: "test-image", prompt: pending[0].body.prompt, size: "1024x1280" } });
    await expect(first.locator('[data-status="AI PRODUCTION ASSET"]')).toBeVisible();
    await expect(page.getByTestId("production-slide").nth(1).locator('[data-status="AI PRODUCTION ASSET"]')).toHaveCount(0);
    const savedIds = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]") as StudioProject[];
      return saved[0].plan!.slides.map((slide) => slide.image?.assetId ?? slide.image_ref);
    });
    expect(savedIds[0]).toBeTruthy();
    expect(savedIds[2]).toBeTruthy();
    expect(savedIds[0]).not.toBe(savedIds[2]);
    expect(savedIds.filter(Boolean)).toHaveLength(2);
    await page.reload();
    await expect(page.getByTestId("production-slide").nth(0).locator('[data-status="AI PRODUCTION ASSET"]')).toBeVisible();
    await expect(page.getByTestId("production-slide").nth(2).locator('[data-status="AI PRODUCTION ASSET"]')).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByTestId("production-figma").click();
    const path = await (await download).path();
    const exported = JSON.parse(fs.readFileSync(path, "utf8")) as { slides: Array<{ elements: Array<{ type: string; assetId?: string }> }> };
    const figmaIds = exported.slides.map((slide) => slide.elements.find((element) => element.type === "IMAGE")?.assetId ?? "");
    expect(figmaIds[0]).toBe(savedIds[0]);
    expect(figmaIds[2]).toBe(savedIds[2]);
    expect(figmaIds.filter(Boolean)).toHaveLength(2);
  });
});
