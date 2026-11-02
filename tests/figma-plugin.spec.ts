import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import production from "./fixtures/studio-production.json";
import { defaultSettings, type ProductionPlan, type StudioProject } from "../lib/content-production";
import { figmaImageSources } from "../lib/asset-storage";
import { toFigmaExport } from "../lib/figma-export";
import type { ImageAssetRef } from "../lib/image-assets";
import { createStore, fakeSupabase } from "./helpers/fake-supabase";

/*
 * V5 Figma 플러그인(figma-plugin/code.js). 실측 제작 기획(카드뉴스 6장, 2026-10-30)을 내보내
 * 계획 생성과 렌더링을 가짜 figma API로 검사한다. 실제 Figma 앱 실행은 여기서 확인하지 않는다.
 */
const plugin = createRequire(__filename)("../figma-plugin/code.js") as {
  SCHEMA: string;
  buildFigmaPlan: (data: unknown) => { errors: string[]; frames: Array<{ name: string; width: number; height: number; backgroundAssetId: string | null; imageBox: { assetId: string } | null; textBlock: { items: Array<{ role: string; content: string; family: string; size: number }> }; pluginData: { sourceAttribution: string[] } }>; notes: { text: string } | null };
  imageRequests: (data: unknown) => Array<{ id: string; url: string }>;
  renderPlan: (api: unknown, plan: unknown, images: Record<string, Uint8Array>) => Promise<{ frames: number; texts: number; images: number; references: number; missing: number; fontFallbacks: Record<string, string> }>;
};
const prod = production as unknown as { response: { plan: ProductionPlan } };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const asset = (id: string, status: ImageAssetRef["status"], extra: Partial<ImageAssetRef>): ImageAssetRef => ({ id, status, title: id, createdAt: "2026-10-30T00:00:00.000Z", rights: "test", ...extra });
const project = (): StudioProject => ({
  id: "studio-figma-test", mode: "single", title: "테스트 프로젝트", source: { trendKeys: ["t"], trendNames: ["T"] },
  settings: { ...defaultSettings("cardnews"), slideCount: 6 },
  plan: { ...prod.response.plan, slides: prod.response.plan.slides.map((slide, index) => index === 0 ? { ...slide, image_ref: "img-cover" } : index === 2 ? { ...slide, image_ref: "real-1" } : index === 3 ? { ...slide, image_ref: "stored-1" } : { ...slide, image_ref: "" }) },
  assets: [asset("img-cover", "AI PRODUCTION ASSET", { dataUrl: `data:image/jpeg;base64,${PNG}`, model: "m" }), asset("real-1", "REAL REFERENCE", { url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk" }), asset("stored-1", "AI PRODUCTION ASSET", { storagePath: "user-a/studio-figma-test/stored-1.jpg" })],
  edited: false, createdAt: "2026-10-30T00:00:00.000Z", updatedAt: "2026-10-30T00:00:00.000Z",
} as StudioProject);

/** 최소한의 가짜 figma API: 만든 노드를 기록하고, 없는 글꼴은 거부한다. */
function fakeFigma(fonts: string[]) {
  const nodes: Array<Record<string, unknown>> = [];
  const node = (type: string) => {
    const item: Record<string, unknown> & { children: unknown[] } = { type, children: [], width: 0, height: 0, pluginData: {} as Record<string, string> };
    item.resize = (w: number, h: number) => { item.width = w; item.height = type === "TEXT" ? Math.max(h, item.height as number) : h; };
    item.appendChild = (child: unknown) => item.children.push(child);
    item.setPluginData = (key: string, value: string) => { (item.pluginData as Record<string, string>)[key] = value; };
    if (type === "TEXT") Object.defineProperty(item, "characters", { set(value: string) { item._chars = value; item.height = Math.ceil(value.length / 30) * ((item.fontSize as number) || 16) * 1.4; }, get() { return item._chars; } });
    nodes.push(item);
    return item;
  };
  const page = { children: [] as unknown[], selection: [] as unknown[], appendChild(child: unknown) { this.children.push(child); } };
  const api = {
    currentPage: page, viewport: { center: { x: 0, y: 0 }, scrollAndZoomIntoView: () => {} },
    createFrame: () => node("FRAME"), createText: () => node("TEXT"), createRectangle: () => node("RECTANGLE"),
    createImage: (bytes: Uint8Array) => ({ hash: `hash-${bytes.length}` }),
    loadFontAsync: async (font: { family: string; style: string }) => { if (!fonts.includes(`${font.family} ${font.style}`)) throw new Error("missing font"); },
  };
  return { api, nodes, page };
}

test.describe("Figma plugin (no browser, no Figma app)", () => {
  test("export carries AI image sources only: inline thumbnails and 1h signed links, never real references", async () => {
    const store = createStore();
    const supabase = fakeSupabase(store, { id: "user-a" });
    await supabase.storage.from("creative-assets").upload("user-a/studio-figma-test/stored-1.jpg", new Blob([new Uint8Array([1])], { type: "image/jpeg" }), { upsert: true, contentType: "image/jpeg" });
    const { images, unsigned } = await figmaImageSources(project().assets, supabase);
    expect(Object.keys(images).sort()).toEqual(["img-cover", "stored-1"]);
    expect(images["img-cover"]).toMatchObject({ kind: "inline", expiresAt: null });
    expect(images["stored-1"].kind).toBe("signed");
    expect(Date.parse(images["stored-1"].expiresAt!) - Date.now()).toBeGreaterThan(55 * 60 * 1000);
    expect(unsigned).toBe(0);
    const exported = toFigmaExport(project(), "2026-11-02T00:00:00.000Z", images);
    expect(exported.assets.find((item) => item.id === "real-1")).not.toHaveProperty("figmaImage");
    expect(plugin.imageRequests(exported).map((item) => item.id).sort()).toEqual(["img-cover", "stored-1"]);
  });

  test("the plan has one frame per slide at canvas size with separate text items, background and image boxes, and evidence ids", () => {
    const exported = toFigmaExport(project(), "2026-11-02T00:00:00.000Z");
    const plan = plugin.buildFigmaPlan(exported);
    expect(plan.errors).toEqual([]);
    expect(plan.frames).toHaveLength(6);
    expect(plan.frames.every((frame) => frame.width === 1080 && frame.height === 1350)).toBe(true);
    expect(plan.frames[0].name).toMatch(/^01 · cover/);
    expect(plan.frames[0].backgroundAssetId).toBe("img-cover");
    expect(plan.frames[2].imageBox?.assetId).toBe("real-1");
    const headline = prod.response.plan.slides[1].headline;
    expect(plan.frames[1].textBlock.items.find((item) => item.role === "headline")?.content).toBe(headline);
    expect(plan.frames[1].pluginData.sourceAttribution).toEqual(prod.response.plan.slides[1].evidence_ids);
    expect(plan.notes?.text).toContain("이미지 출처·권리");
  });

  test("wrong or empty files are rejected with a reason", () => {
    expect(plugin.buildFigmaPlan({ schema: "other/v1" }).errors[0]).toContain("지원하지 않는 형식");
    const exported = toFigmaExport({ ...project(), plan: undefined }, "2026-11-02T00:00:00.000Z");
    expect(plugin.buildFigmaPlan(exported).errors.join(" ")).toContain("슬라이드·장면이 없습니다");
  });

  test("rendering puts AI images as IMAGE fills, real references as link placeholders, and falls back to Inter when fonts are missing", async () => {
    const exported = toFigmaExport(project(), "2026-11-02T00:00:00.000Z", { "img-cover": { url: "data:", expiresAt: null, kind: "inline" } });
    const plan = plugin.buildFigmaPlan(exported);
    const { api, nodes, page } = fakeFigma(["Inter Regular", "Inter Bold", "Inter Medium", "Inter Extra Bold"]);
    const report = await plugin.renderPlan(api, plan, { "img-cover": new Uint8Array([1, 2, 3]) });
    expect(report).toMatchObject({ frames: 6, images: 1, references: 1, missing: 1 });
    expect(Object.values(report.fontFallbacks).every((font) => font.startsWith("Inter"))).toBe(true);
    const imageFill = nodes.find((item) => Array.isArray(item.fills) && (item.fills as Array<{ type: string }>)[0]?.type === "IMAGE");
    expect(imageFill?.name).toContain("AI 생성 이미지 — 실제 사진 아님");
    expect(nodes.some((item) => String(item.name).startsWith("REFERENCE · 원본 링크"))).toBe(true);
    expect(nodes.some((item) => item.type === "TEXT" && String(item._chars).includes("youtube.com/watch?v=abcdefghijk"))).toBe(true);
    // 프레임 6 + 게시용 캡션 프레임 + EDITOR NOTES 프레임(E6에서 분리)
    expect(page.children).toHaveLength(8);
    const frames = page.children.slice(0, 6) as Array<{ children: Array<{ type: string; y: number; height: number }>; height: number; pluginData: Record<string, string> }>;
    for (const frame of frames) {
      expect(JSON.parse(frame.pluginData["trend-radar"]).slideId).toBeTruthy();
      for (const child of frame.children.filter((item) => item.type === "TEXT")) { expect(child.y).toBeGreaterThanOrEqual(0); expect(child.y + child.height).toBeLessThanOrEqual(frame.height); }
    }
    expect(page.selection).toHaveLength(8);
  });

  test("the plugin manifest only allows Supabase for network access and points at existing files", async () => {
    const fs = await import("node:fs");
    const manifest = JSON.parse(fs.readFileSync("figma-plugin/manifest.json", "utf8"));
    expect(manifest).toMatchObject({ api: "1.0.0", main: "code.js", ui: "ui.html", editorType: ["figma"] });
    expect(manifest.networkAccess.allowedDomains).toEqual(["https://*.supabase.co"]);
    expect(fs.existsSync("figma-plugin/code.js") && fs.existsSync("figma-plugin/ui.html")).toBe(true);
    expect(fs.readFileSync("figma-plugin/code.js", "utf8")).not.toMatch(/\?\.|\?\?/);
  });
});
