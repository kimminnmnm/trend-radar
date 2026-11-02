import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import v2 from "./fixtures/editorial-engine-v2.json";
import v21 from "./fixtures/editorial-engine-v21.json";
import vdna from "./fixtures/visual-dna.json";
import { balanceBreaks, buildCardDesign, chooseStyle, colorUnder, contrast, designStyleIds, paletteModes, type CardDesign, type SceneElement } from "../lib/card-design";
import { defaultSettings, type ProductionPlan, type StudioProject } from "../lib/content-production";
import { toFigmaExport } from "../lib/figma-export";
import type { ImageAssetRef } from "../lib/image-assets";
import type { VisualDnaRecord } from "../lib/visual-dna";

/*
 * FIGMA DESIGN ENGINE V2 (D1~D6) 규칙 검사. 실측 카드뉴스(기아타이거즈·헤이세이 레트로·디지털카메라)로 디자인을 계산하고,
 * 플러그인 장면 렌더링은 가짜 figma API로 확인한다. 실제 Figma 앱의 렌더링·글꼴·PNG 품질은 여기서 확인하지 않는다.
 */
const plugin = createRequire(__filename)("../figma-plugin/code.js") as {
  buildFigmaPlan: (data: unknown) => { mode: string; errors: string[]; frames: Array<{ scene?: SceneElement[] }>; notes: { text: string } };
  renderPlan: (api: unknown, plan: unknown, images: Record<string, Uint8Array>, options?: unknown) => Promise<{ frames: number; texts: number; images: number; overflows: string[]; fitted: number; mode: string; failedFrames: unknown[] }>;
};
type Produced = { plan: ProductionPlan; angle: StudioProject["angle"] };
const kia = (v2 as unknown as { productions: Record<string, Produced> }).productions.kiaA3;
const heisei = (v21 as unknown as { productions: Record<string, Produced> }).productions.heisei;
const camera = (v21 as unknown as { productions: Record<string, Produced> }).productions.camera;
const visual = (vdna as unknown as { record: VisualDnaRecord }).record;
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const project = (name: string, p: Produced, extra: Partial<StudioProject> = {}): StudioProject => ({ id: `studio-${name}`, mode: "single", title: p.plan.title, source: { trendKeys: [`live-${name}`], trendNames: [name] }, settings: { ...defaultSettings("cardnews"), tone: "친구에게 말하듯 가볍게, 구체적으로, 과장 없이" }, plan: p.plan, angle: p.angle, assets: [], edited: false, createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z", ...extra });
const design = (name: string, p: Produced, extra: Partial<StudioProject> = {}, visualDna: VisualDnaRecord | null = null) => { const item = project(name, p, extra); return buildCardDesign({ project: item, plan: item.plan!, controls: item.design, visualDna }); };
const texts = (d: CardDesign) => d.frames.flatMap((frame) => frame.elements.filter((element): element is Extract<SceneElement, { kind: "text" }> => element.kind === "text"));
const flat = (value: string) => value.replace(/\s+/g, "");
const cases: Array<[string, Produced, VisualDnaRecord | null]> = [["기아타이거즈", kia, null], ["헤이세이 레트로", heisei, visual], ["디지털카메라", camera, null]];

test.describe("D1·D3 design system and trend-aware style", () => {
  test("each trend gets a different style and motif; changing the tone can change the style", () => {
    const styles = cases.map(([name, p, dna]) => design(name, p, {}, dna));
    expect(styles.map((item) => `${item.style}/${item.motif}`)).toEqual(["bold-typography/stripes", "kitsch-pop/stickers", "contemporary-magazine/camera"]);
    expect(chooseStyle({ subject: "발레코어", angle: "", tone: "에세이처럼 차분하게", dnaText: "" }).style).toBe("minimal-editorial");
    expect(chooseStyle({ subject: "발레코어", angle: "", tone: "팬의 마음으로 유쾌하게", dnaText: "" }).style).toBe("playful-graphic");
  });

  test("Visual DNA colors are marked as observed and role assignment as interpretation; text contrast stays readable in every style and palette", () => {
    const withDna = design("헤이세이 레트로", heisei, {}, visual);
    expect(withDna.colorSources.some((item) => item.source === "observed")).toBe(true);
    expect(withDna.notes.join(" ")).toMatch(/관찰한 색.*해석/);
    for (const style of designStyleIds) for (const palette of paletteModes) {
      const item = design("헤이세이 레트로", heisei, { design: { style, palette } }, visual);
      expect(contrast(item.colors.textPrimary, item.colors.background), `${style}/${palette}`).toBeGreaterThanOrEqual(4.5);
      // 모든 텍스트는 바로 아래 칠(카드·버튼·컬러 블록·배경) 대비 — 큰 글자 3, 작은 글자 4.5 이상. 이미지 위 글자는 오버레이가 맡는다.
      for (const frame of item.frames) frame.elements.forEach((element, index) => {
        if (element.kind !== "text") return;
        const under = colorUnder(frame.elements, index, frame.background);
        if (under) expect(contrast(element.color, under), `${style}/${palette}/${frame.name}/${element.name}`).toBeGreaterThanOrEqual(element.size >= 48 ? 3 : 4.5);
      });
    }
  });

  test("typography has clear hierarchy and readable minimums at 1080×1350", () => {
    for (const [name, p, dna] of cases) {
      const d = design(name, p, {}, dna);
      expect(d.canvas).toEqual({ width: 1080, height: 1350 });
      const all = texts(d);
      const cover = all.find((element) => element.name === "headline · 표지 제목")!;
      expect(cover.size, name).toBeGreaterThanOrEqual(92);
      expect(all.filter((element) => element.role === "body").every((element) => element.size >= 34), name).toBe(true);
      const bodySize = Math.max(...all.filter((element) => element.role === "body").map((element) => element.size));
      expect(cover.size / bodySize, name).toBeGreaterThanOrEqual(2);
    }
  });
});

test.describe("D2 layout engine", () => {
  test("cover first, closing last, no two identical layouts in a row, and no copy is dropped to fit a layout", () => {
    for (const [name, p, dna] of cases) {
      const d = design(name, p, {}, dna);
      const layouts = d.frames.map((frame) => frame.layout);
      expect(layouts[0], name).toBe("L01");
      expect(layouts.at(-1), name).toBe("L08");
      expect(layouts.every((layout, i) => i === 0 || layout !== layouts[i - 1]), `${name} ${layouts.join(" ")}`).toBe(true);
      expect(new Set(layouts).size, name).toBeGreaterThanOrEqual(4);
      p.plan.slides.forEach((slide, i) => {
        const frameText = flat(d.frames[i].elements.map((element) => (element.kind === "text" ? element.text : "")).join(""));
        expect(frameText.includes(flat(slide.headline)), `${name} ${i + 1} headline`).toBe(true);
        if (slide.body.trim()) expect(frameText.includes(flat(slide.body)) || flat(slide.body).split(/(?<=[.!?])/).every((sentence) => frameText.includes(sentence)), `${name} ${i + 1} body`).toBe(true);
      });
    }
  });

  test("text boxes stay inside the frame and the estimated fit does not overflow for the recorded copy", () => {
    for (const [name, p, dna] of cases) {
      const d = design(name, p, {}, dna);
      for (const frame of d.frames) {
        for (const element of frame.elements) if (element.kind === "text") {
          expect(element.x >= 0 && element.y >= 0 && element.x + element.w <= frame.width + 1 && element.y + element.h <= frame.height + 1, `${name} ${frame.name} ${element.name}`).toBe(true);
        }
        expect(frame.notes.join(" "), `${name} ${frame.name}`).not.toMatch(/최소 글자 크기에서도/);
      }
    }
  });

  test("headline line breaks are balanced and never end a line with a one-syllable word", () => {
    expect(balanceBreaks("같은 연못, 두 가지 거리", 96, 900)).toBe("같은 연못,\n두 가지 거리");
    const result = balanceBreaks("마음에 드는 한 장을 나눠요", 96, 900);
    expect(result.split("\n").every((line) => [...(line.split(" ").at(-1) ?? "")].length > 1 || !line.includes(" "))).toBe(true);
    expect(balanceBreaks("짧은 제목", 96, 900)).toBe("짧은 제목");
  });
});

test.describe("D4 image-driven design", () => {
  const assets: ImageAssetRef[] = [
    { id: "ai-cover", status: "AI PRODUCTION ASSET", title: "표지", dataUrl: `data:image/jpeg;base64,${PNG}`, createdAt: "2026-11-02T00:00:00.000Z", rights: "AI" },
    { id: "ai-2", status: "AI PRODUCTION ASSET", title: "2장", dataUrl: `data:image/jpeg;base64,${PNG}`, createdAt: "2026-11-02T00:00:00.000Z", rights: "AI" },
    { id: "real-1", status: "REAL REFERENCE", title: "근거", url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", createdAt: "2026-11-02T00:00:00.000Z", rights: "link" },
  ];
  test("only slide-linked AI images drive layouts; spare and real-reference assets never leak into another slide", () => {
    const plan = { ...camera.plan, slides: camera.plan.slides.map((slide, i) => i === 1 ? { ...slide, image_ref: "ai-2" } : i === 2 ? { ...slide, image_ref: "real-1" } : { ...slide, image_ref: "" }) };
    const d = design("디지털카메라", { ...camera, plan }, { assets });
    const images = d.frames.flatMap((frame) => frame.elements.filter((element) => element.kind === "image").map((element) => ({ frame: frame.number, layout: frame.layout, assetId: (element as { assetId: string }).assetId })));
    expect(images.find((item) => item.frame === 1)).toBeUndefined();
    expect(images.find((item) => item.frame === 2)?.assetId).toBe("ai-2");
    expect(["L03", "L04", "L02"]).toContain(d.frames[1].layout);
    expect(images.some((item) => item.assetId === "real-1")).toBe(false);
    expect(d.frames[2].elements.some((element) => element.name.startsWith("참고 이미지"))).toBe(true);
    // 이미지 위 글자에는 그라데이션 오버레이가 있다.
    expect(d.frames[1].elements.some((element) => element.kind === "gradient")).toBe(true);
  });

  test("with no images the design still uses color blocks, graphics and large type (no plain white text pages)", () => {
    const d = design("디지털카메라", camera);
    expect(d.frames.every((frame) => frame.elements.some((element) => element.kind !== "text"))).toBe(true);
    expect(new Set(d.frames.map((frame) => frame.background)).size).toBeGreaterThanOrEqual(2);
    expect(d.notes.join(" ")).toMatch(/자동 생성 안 함/);
  });
});

/* ---------- D6 플러그인: 장면 → 편집 가능한 노드 ---------- */

function fakeFigma() {
  const make = (type: string) => {
    const item: Record<string, unknown> & { children: unknown[]; data: Record<string, string> } = { type, children: [], width: 0, height: 0, x: 0, y: 0, data: {} };
    item.resize = (w: number, h: number) => { item.width = w; if (type !== "TEXT") item.height = h; };
    item.appendChild = (child: unknown) => item.children.push(child);
    item.setPluginData = (key: string, value: string) => { item.data[key] = value; };
    item.getPluginData = (key: string) => item.data[key] ?? "";
    // 텍스트 높이: 글자 수 × 크기로 대충 잰다(줄바꿈 포함).
    const measure = () => { const size = (item.fontSize as number) || 16; const width = (item.width as number) || 1000; const lines = String(item._chars ?? "").split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(([...line].length * size * 0.95) / width)), 0); item.height = lines * size * 1.3; };
    if (type === "TEXT") {
      Object.defineProperty(item, "characters", { set(value: string) { item._chars = value; measure(); }, get() { return item._chars; } });
      let font = 16;
      Object.defineProperty(item, "fontSize", { set(value: number) { font = value; measure(); }, get() { return font; } });
    }
    return item;
  };
  const page = { children: [] as Array<Record<string, unknown>>, selection: [] as unknown[], appendChild(child: Record<string, unknown>) { this.children.push(child); } };
  const fonts = new Set(["Noto Sans KR Regular", "Noto Sans KR Medium", "Noto Sans KR Bold", "Noto Sans KR Black", "Black Han Sans Regular", "Noto Serif KR Bold", "Noto Serif KR Black"]);
  const api = {
    currentPage: page, root: { setRelaunchData: () => {} }, viewport: { center: { x: 0, y: 0 }, scrollAndZoomIntoView: () => {} },
    createFrame: () => make("FRAME"), createText: () => make("TEXT"), createRectangle: () => make("RECTANGLE"), createEllipse: () => make("ELLIPSE"),
    createImage: (bytes: Uint8Array) => ({ hash: `hash-${bytes.length}` }),
    loadFontAsync: async (font: { family: string; style: string }) => { if (!fonts.has(`${font.family} ${font.style}`)) throw new Error("missing font"); },
  };
  return { api, page };
}

test.describe("D5·D6 export and editable Figma generation (fake figma API, not the Figma app)", () => {
  test("the export carries the design; the plugin draws every scene element as its own editable layer and keeps old JSON working", async () => {
    const base = project("기아타이거즈", kia, { assets: [{ id: "ai-cover", status: "AI PRODUCTION ASSET", title: "표지", dataUrl: `data:image/jpeg;base64,${PNG}`, createdAt: "2026-11-02T00:00:00.000Z", rights: "AI" }] });
    const item = { ...base, plan: { ...base.plan!, slides: base.plan!.slides.map((slide, index) => index === 0 ? { ...slide, image_ref: "ai-cover" } : slide) } };
    const d = buildCardDesign({ project: item, plan: item.plan!, controls: { imageEmphasis: "high" } });
    const exported = toFigmaExport(item, "2026-11-02T00:00:00.000Z", { "ai-cover": { url: `data:image/jpeg;base64,${PNG}`, expiresAt: null, kind: "inline" } }, { design: d });
    expect(exported.design?.frames).toHaveLength(6);
    const plan = plugin.buildFigmaPlan(exported);
    expect(plan.mode).toBe("scene");
    expect(plan.notes.text).toContain("디자인: Bold Typography");
    const { api, page } = fakeFigma();
    const report = await plugin.renderPlan(api, plan, { "ai-cover": new Uint8Array([1, 2, 3]) });
    expect(report).toMatchObject({ frames: 6, mode: "scene", failedFrames: [] });
    expect(report.images).toBe(1);
    const frames = page.children.filter((node) => node.type === "FRAME" && (node.data as Record<string, string>)["trend-radar"]?.includes("layout")) as Array<{ children: Array<{ type: string; name: string; fills?: Array<{ type: string }> }>; width: number; height: number }>;
    expect(frames).toHaveLength(6);
    for (const [i, frame] of frames.entries()) {
      expect(frame.width).toBe(1080);
      expect(frame.height).toBe(1350);
      expect(frame.children.length, `frame ${i + 1}`).toBe(d.frames[i].elements.length);
      expect(frame.children.some((node) => node.type === "TEXT")).toBe(true);
      expect(frame.children.some((node) => node.type !== "TEXT")).toBe(true);
    }
    expect(frames[0].children.some((node) => node.fills?.[0]?.type === "IMAGE")).toBe(true);
    expect(frames.flatMap((frame) => frame.children).filter((node) => node.type === "TEXT").length).toBe(report.texts);
    // 이전 형식(design 없음)은 기존 방식으로 그린다.
    expect(plugin.buildFigmaPlan({ ...exported, design: undefined }).mode).toBe("legacy");
  });

  test("text that is taller than its box in the real font is shrunk down to the minimum, then reported", async () => {
    const element = { kind: "text", name: "headline · 테스트", role: "section", x: 80, y: 80, w: 400, h: 120, text: "아주 긴 제목이 상자보다 길어서 줄여야 하는 경우를 확인해요", font: { family: "Black Han Sans", style: "Regular" }, size: 96, minSize: 64, lineHeight: 1.18, tracking: 0, color: "#111111", align: "LEFT", valign: "TOP" };
    const scene = { schema: "trend-radar.figma-export/v1", project: { title: "t", canvas: { width: 1080, height: 1350 } }, slides: [{ id: "s1", elements: [] }], assets: [], design: { style: "bold-typography", styleLabel: "Bold Typography", styleReason: "test", colorSources: [], notes: [], frames: [{ id: "s1", number: 1, name: "01 · TEST", layout: "L02", width: 1080, height: 1350, background: "#FFFFFF", elements: [element], notes: [] }] } };
    const { api } = fakeFigma();
    const report = await plugin.renderPlan(api, plugin.buildFigmaPlan(scene), {});
    expect(report.fitted).toBe(1);
    expect(report.overflows).toEqual(["headline · 테스트"]);
  });
});

/* ---------- D5 Content Studio 디자인 설정(화면) ---------- */

test.describe("D5 Content Studio design controls", () => {
  test("auto style is recommended, a different style changes the preview, and the JSON export carries the design", async ({ page }) => {
    const item = project("헤이세이 레트로", heisei);
    await page.goto("/");
    await page.evaluate((p) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-studio-projects", JSON.stringify([p])); }, item);
    await page.goto(`/studio?project=${item.id}`);
    await expect(page.getByTestId("design-preview")).toHaveAttribute("data-style", "kitsch-pop");
    await expect(page.getByTestId("design-style")).toContainText("자동 추천 (Kitsch Pop)");
    await expect(page.getByTestId("preview-frame")).toHaveCount(6);
    await page.getByTestId("design-style").selectOption("minimal-editorial");
    await expect(page.getByTestId("design-preview")).toHaveAttribute("data-style", "minimal-editorial");
    const download = page.waitForEvent("download");
    await page.getByTestId("production-figma").click();
    const json = JSON.parse(await (await (await download).createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString("utf8")));
    expect(json.design.style).toBe("minimal-editorial");
    expect(json.design.frames).toHaveLength(6);
    // 웹사이트 UI(XP 스타일)는 그대로: 디자인 설정 패널도 기존 settings 스타일을 쓴다.
    await expect(page.getByTestId("design-controls")).toHaveClass(/settings/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});
