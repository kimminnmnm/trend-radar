import { createRequire } from "node:module";
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import lockRun from "./fixtures/context-lock-t6.json";
import { defaultSettings, emptySlideImage, withSlideImage, type ProductionPlan, type SlideImageRef, type StudioProject } from "../lib/content-production";
import { toFigmaExport } from "../lib/figma-export";
import type { ImageAssetRef } from "../lib/image-assets";

/*
 * MY TEMPLATES(figma-plugin/code.js). 실제 Figma 앱이 아니라, Figma 플러그인 API 규칙을 흉내 낸 가짜 API로 검사한다:
 * dynamic-page(페이지 loadAsync 전에는 자식 없음) · clone은 같은 부모에 붙음 · 텍스트는 글꼴을 불러온 뒤에만 고칠 수 있음(아니면 오류) ·
 * mixed 글꼴 · hasMissingFont · 높이 자동일 때만 높이가 다시 계산됨. 실제 앱 렌더링(글꼴 모양·이미지 크롭)은 여기서 확인하지 않는다.
 */
type Report = { backgroundFallbacks: string[]; frameBackgrounds: string[]; imagesUnused: string[]; fontReplaced: string[]; imageCovered: string[]; assignmentNote: string; frames: number; texts: number; images: number; missing: number; references: number; fitted: number; overflows: string[]; templatesUsed: string[]; hiddenSlots: string[]; fontMissing: string[]; imageNeeded: string[]; fallbackSlides: string[]; failedFrames: Array<{ name: string; error: string }>; outputPage: string | null; problems: string[] };
type Inventory = { page: string | null; templates: Record<string, { kind: string; slots: string[]; imageSlots: number; background: string | null; fallback: { hex: string | null; source: string }; summary: string; fonts: string[]; missingFonts: Array<{ slot: string; fonts: string[] }>; unrecognizedTexts: Array<{ layer: string; preview: string }>; warnings: string[] }>; missing: string[]; problems: string[] };
const plugin = createRequire(__filename)("../figma-plugin/code.js") as {
  TEMPLATE_NAMES: string[];
  buildFigmaPlan: (data: unknown) => { errors: string[]; frames: unknown[] };
  scanTemplates: (api: unknown) => Promise<Inventory>;
  autoAssignTemplates: (slides: unknown[], inventory: Inventory) => Record<string, string | null>;
  explainAssignment: (slides: unknown[], inventory: Inventory, assignments: Record<string, string | null>) => string;
  renderTemplates: (api: unknown, data: unknown, plan: unknown, images: Record<string, Uint8Array>, options?: Record<string, unknown>) => Promise<Report>;
  renderPlan: (api: unknown, plan: unknown, images: Record<string, Uint8Array>) => Promise<{ frames: number }>;
  resolveAssignments: (slides: unknown[], inventory: Inventory, chosen: Record<string, string>) => Record<string, string | null>;
};

/* ---------- 가짜 Figma API ---------- */
type FNode = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const MIXED = Symbol("mixed");
function makeApi(availableFonts: string[]) {
  let seq = 0;
  const loaded = new Set<string>();
  const loadCalls: string[] = [];
  const exports: Array<{ name: string; width: number }> = [];
  const fontKey = (font: { family: string; style: string }) => `${font.family} ${font.style}`;
  const measure = (node: FNode) => {
    if (node._mode !== "HEIGHT" && node._mode !== "WIDTH_AND_HEIGHT") return;
    const perLine = Math.max(1, Math.floor(node.width / (node._size * 0.95)));
    const lines = String(node._chars).split("\n").reduce((sum: number, line: string) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
    node.height = Math.round(lines * node._size * 1.3);
  };
  const create = (type: string, props: FNode = {}): FNode => {
    const node: FNode = { id: `n${(seq += 1)}`, type, name: type, x: 0, y: 0, width: 100, height: 100, visible: true, parent: null, children: [], pluginData: {}, ...props };
    node.children = [];
    node.appendChild = (child: FNode) => { if (child.parent) child.parent.children = child.parent.children.filter((item: FNode) => item !== child); child.parent = node; node.children.push(child); };
    node.remove = () => { if (node.parent) node.parent.children = node.parent.children.filter((item: FNode) => item !== node); node.parent = null; };
    node.setPluginData = (key: string, value: string) => { node.pluginData[key] = value; };
    node.getPluginData = (key: string) => node.pluginData[key] ?? "";
    node.findAll = (match: (item: FNode) => boolean) => { const out: FNode[] = []; const walk = (item: FNode) => item.children.forEach((child: FNode) => { if (match(child)) out.push(child); walk(child); }); walk(node); return out; };
    node.resize = (w: number, h: number) => { node.width = w; node.height = h; if (type === "TEXT") measure(node); };
    node.clone = () => { const copy = cloneTree(node); node.parent?.appendChild(copy); return copy; };
    // PNG 내보내기: 원본을 바꾸지 않고 바이트만 돌려준다(가짜 PNG 서명 + 크기). _exportFails면 실패.
    node.exportAsync = async (options: { constraint?: { value: number } }) => { exports.push({ name: node.name, width: options?.constraint?.value ?? 0 }); if (node._exportFails) throw new Error("export failed"); return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, (options?.constraint?.value ?? 0) % 256]); };
    if (type !== "TEXT" && type !== "GROUP" && !("fills" in node)) node.fills = [];
    if (type === "TEXT") {
      node._chars = props._chars ?? ""; node._size = props._size ?? 32; node._mode = props._mode ?? "NONE";
      node.fontName = props.fontName ?? { family: "Pretendard", style: "Regular" };
      node.hasMissingFont = props.hasMissingFont ?? false;
      node.ranges = props.ranges ?? null;
      node.getRangeAllFontNames = () => node.ranges ?? [node.fontName];
      const requireFonts = () => { for (const font of node.fontName === MIXED ? node.ranges : [node.fontName]) if (!loaded.has(fontKey(font))) throw new Error(`Cannot write to node with unloaded font "${fontKey(font)}"`); };
      Object.defineProperty(node, "characters", { get: () => node._chars, set: (value: string) => { requireFonts(); node._chars = value; measure(node); } });
      Object.defineProperty(node, "fontSize", { get: () => node._size, set: (value: number) => { requireFonts(); node._size = value; measure(node); } });
      Object.defineProperty(node, "textAutoResize", { get: () => node._mode, set: (value: string) => { node._mode = value; measure(node); } });
    }
    return node;
  };
  const data = (node: FNode) => Object.fromEntries(Object.entries(node).filter(([key, value]) => typeof value !== "function" && !["children", "parent", "id"].includes(key)).map(([key, value]) => [key, typeof value === "object" && value !== null && value !== MIXED ? JSON.parse(JSON.stringify(value)) : value]));
  const cloneTree = (node: FNode): FNode => { const copy = create(node.type, data(node)); node.children.forEach((child: FNode) => copy.appendChild(cloneTree(child))); return copy; };
  // dynamic-page: 불러오기 전에는 자식이 보이지 않는다(내부 목록은 따로 유지).
  const page = (name: string, isLoaded = true) => {
    const item = create("PAGE", { name });
    item._loaded = isLoaded; item._kids = [] as FNode[];
    Object.defineProperty(item, "children", { get: () => (item._loaded ? item._kids : []), set: (value: FNode[]) => { if (item._loaded) item._kids = value; } });
    item.appendChild = (child: FNode) => { if (child.parent) child.parent.children = child.parent.children.filter((other: FNode) => other !== child); child.parent = item; item._kids.push(child); };
    item.loadAsync = async () => { item._loaded = true; };
    item.remove = () => { root.children = root.children.filter((other: FNode) => other !== item); };
    return item;
  };
  const root: FNode = { name: "My Templates File", children: [] as FNode[], setRelaunchData: () => {} };
  const api: FNode = {
    mixed: MIXED, root, currentPage: null as FNode | null,
    viewport: { center: { x: 0, y: 0 }, scrollAndZoomIntoView: () => {} },
    createFrame: () => create("FRAME"), createText: () => create("TEXT", { _mode: "WIDTH_AND_HEIGHT" }), createRectangle: () => create("RECTANGLE"), createEllipse: () => create("ELLIPSE"),
    createPage: () => { const item = page("Page"); root.children.push(item); return item; },
    setCurrentPageAsync: async (item: FNode) => { api.currentPage = item; },
    createImage: (bytes: Uint8Array) => ({ hash: `hash-${Array.from(bytes).join(".")}` }),
    loadFontAsync: async (font: { family: string; style: string }) => { loadCalls.push(fontKey(font)); if (!availableFonts.includes(fontKey(font))) throw new Error("missing font"); loaded.add(fontKey(font)); },
  };
  return { api, create, page, root, loadCalls, exports };
}

/* ---------- 템플릿 8종(플레이스홀더 구성이 서로 다름) ---------- */
const BOLD = { family: "Pretendard", style: "Bold" }, REG = { family: "Pretendard", style: "Regular" };
function buildTemplates(env: ReturnType<typeof makeApi>, options: { rename?: Record<string, string>; skip?: string[]; missingFont?: string; mutate?: (name: string, frame: FNode, create: ReturnType<typeof makeApi>["create"]) => void } = {}) {
  const { create } = env;
  const text = (name: string, chars: string, w: number, h: number, size: number, extra: FNode = {}) => create("TEXT", { name, _chars: chars, width: w, height: h, _size: size, _mode: "NONE", fontName: BOLD, ...extra });
  const image = (name: string, w: number, h: number) => create("RECTANGLE", { name, width: w, height: h, fills: [{ type: "IMAGE", imageHash: `sample-${name}`, scaleMode: "FILL" }, { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.1 }] });
  const frame = (name: string, kids: FNode[], extra: FNode = {}) => { const node = create("FRAME", { name, width: 1080, height: 1350, fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }], ...extra }); kids.forEach((kid) => node.appendChild(kid)); return node; };
  const deco = () => create("ELLIPSE", { name: "deco · 원", width: 200, height: 200, fills: [{ type: "SOLID", color: { r: 1, g: 0.3, b: 0.6 } }] });
  const specs: Record<string, () => FNode> = {
    TEMPLATE_COVER_01: () => frame("TEMPLATE_COVER_01", [image("IMAGE_MAIN", 1080, 1350), text("CATEGORY", "카테고리", 400, 40, 28, { fontName: REG }), text("TITLE", "표지 제목 견본", 900, 260, 72), text("SUBTITLE", "보조 문구 견본", 900, 80, 32, { fontName: REG }), text("PAGE_NUMBER", "01 / 06", 160, 40, 24, { fontName: REG })]),
    TEMPLATE_COVER_02: () => frame("TEMPLATE_COVER_02", [deco(), text("TITLE", "글자만 표지", 900, 300, 80), text("SUBTITLE", "견본", 900, 80, 32, { fontName: REG })]),
    TEMPLATE_COVER_03: () => frame("TEMPLATE_COVER_03", [image("IMAGE_MAIN", 1080, 700), text("TITLE", "자동 레이아웃 표지", 900, 260, 64)], { layoutMode: "VERTICAL" }),
    TEMPLATE_BODY_01: () => frame("TEMPLATE_BODY_01", [text("TITLE", "본문 제목", 900, 160, 56), text("BODY", "본문 견본", 900, 300, 34, { fontName: REG }), image("IMAGE_MAIN", 900, 560), text("PAGE_NUMBER", "02", 160, 40, 24, { fontName: REG })]),
    TEMPLATE_BODY_02: () => frame("TEMPLATE_BODY_02", [deco(), text("TITLE", "글자 본문", 900, 160, 56, { fontName: MIXED, ranges: [BOLD, REG] }), text("BODY", "본문 견본", 900, 500, 34, { fontName: REG }), text("PAGE_NUMBER", "03", 160, 40, 24, { fontName: REG })]),
    TEMPLATE_BODY_03: () => frame("TEMPLATE_BODY_03", [text("TITLE", "두 장 본문", 900, 160, 56), image("IMAGE_1", 430, 520), image("IMAGE_2", 430, 520), text("BODY", "본문 견본", 900, 260, 34, { fontName: REG })]),
    TEMPLATE_CTA_01: () => frame("TEMPLATE_CTA_01", [text("TITLE", "마무리 제목", 900, 200, 60), text("BODY", "마무리 견본", 900, 200, 34, { fontName: REG }), text("CTA", "저장하기", 600, 80, 40)]),
    TEMPLATE_CTA_02: () => frame("TEMPLATE_CTA_02", [image("IMAGE_MAIN", 1080, 900), text("CTA", "공유하기", 600, 80, 40)]),
  };
  const templatesPage = env.page("Templates", false);
  Object.entries(specs).forEach(([name, make]) => { if (options.skip?.includes(name)) return; const node = make(); if (options.rename?.[name]) node.name = options.rename[name]; if (options.missingFont && name === options.missingFont) node.findAll((item: FNode) => item.type === "TEXT").forEach((item: FNode) => { item.hasMissingFont = true; item.fontName = { family: "Galmuri11", style: "Bold" }; }); options.mutate?.(name, node, create); templatesPage.appendChild(node); });
  const work = env.page("Work");
  env.root.children.push(templatesPage, work);
  env.api.currentPage = work;
  return { templatesPage, work };
}

/* ---------- 실측 카드뉴스 6장(표지·본문 4·CTA), 슬라이드마다 다른 AI 이미지 ---------- */
const plan = (lockRun as unknown as { after: { production: { plan: ProductionPlan } } }).after.production.plan;
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const asset = (id: string, status: ImageAssetRef["status"] = "AI PRODUCTION ASSET"): ImageAssetRef => ({ id, status, title: id, createdAt: "2026-11-03T00:00:00.000Z", rights: "test", model: "m", dataUrl: `data:image/png;base64,${PNG}`, ...(status === "REAL REFERENCE" ? { url: "https://example.com/a.jpg", sourceUrl: "https://example.com/a" } : {}) });
function exportData(withImages: Record<number, string> = { 0: "img-1", 1: "img-2", 2: "img-3", 4: "img-5" }, extra: Partial<StudioProject> = {}) {
  const slides = plan.slides.map((slide, index) => { const base = withSlideImage({ ...slide }, emptySlideImage(slide.image_prompt)); return withImages[index] ? withSlideImage(base, { ...base.image!, assetId: withImages[index], status: "ready", source: "ai" }) : base; });
  const project: StudioProject = { id: "tpl-test", mode: "single", title: plan.title, source: { trendKeys: ["t"], trendNames: ["메이크업"] }, settings: { ...defaultSettings("cardnews"), slideCount: 6, cta: "저장해 두고 따라 해 봐요" }, plan: { ...plan, slides }, assets: Object.values(withImages).map((id) => asset(id)), edited: false, createdAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z", ...extra };
  return toFigmaExport(project, "2026-11-03T00:00:00.000Z") as unknown as { slides: Array<{ id: string; type: string; template: { kind: string; fields: Record<string, string>; images: Record<string, string | null> } }> };
}
const bytesFor = (ids: string[]) => Object.fromEntries(ids.map((id, index) => [id, new Uint8Array([index + 1, 7])]));
const hashOf = (id: string, ids: string[]) => `hash-${ids.indexOf(id) + 1}.7`;
const snapshot = (node: FNode): unknown => ({ name: node.name, type: node.type, chars: node._chars, size: node._size, mode: node._mode, visible: node.visible, fills: JSON.stringify(node.fills ?? null), w: node.width, h: node.height, data: JSON.stringify(node.pluginData), kids: node.children.map(snapshot) });
const named = (frame: FNode, name: string) => frame.findAll((item: FNode) => item.name === name || item.name.startsWith(`${name} ⚠`));
async function run(options: { env?: ReturnType<typeof makeApi>; data?: ReturnType<typeof exportData>; assignments?: Record<string, string>; images?: Record<string, Uint8Array>; templates?: Parameters<typeof buildTemplates>[1]; fontFallback?: { family: string; style: string }; failedImages?: Record<string, string> } = {}) {
  const env = options.env ?? makeApi(["Pretendard Bold", "Pretendard Regular", "Noto Sans KR Bold", "Noto Sans KR Regular"]);
  const pages = buildTemplates(env, options.templates);
  const data = options.data ?? exportData();
  const figmaPlan = plugin.buildFigmaPlan(data);
  const ids = ["img-1", "img-2", "img-3", "img-5"];
  const report = await plugin.renderTemplates(env.api, data, figmaPlan, options.images ?? bytesFor(ids), { assignments: options.assignments ?? {}, fontFallback: options.fontFallback, failedImages: options.failedImages });
  const clones = (env.api.currentPage as FNode).children.filter((node: FNode) => /TEMPLATE_/.test(node.name));
  return { env, pages, data, report, clones, ids };
}

test.describe("MY TEMPLATES — recognition (P1·P2)", () => {
  test("1. all 8 templates are found on the Templates page (loaded on demand) with their placeholders", async () => {
    const env = makeApi(["Pretendard Bold"]);
    buildTemplates(env);
    const inventory = await plugin.scanTemplates(env.api);
    expect(Object.keys(inventory.templates).sort()).toEqual([...plugin.TEMPLATE_NAMES].sort());
    expect(inventory.missing).toEqual([]);
    expect(inventory.templates.TEMPLATE_BODY_03).toMatchObject({ kind: "BODY", imageSlots: 2 });
    expect(inventory.templates.TEMPLATE_COVER_02).toMatchObject({ kind: "COVER", imageSlots: 0 });
    expect(inventory.templates.TEMPLATE_CTA_01.slots).toEqual(["TITLE", "BODY", "CTA"]);
  });

  test("wrong names, missing templates and a missing page are explained to the user", async () => {
    const env = makeApi(["Pretendard Bold"]);
    buildTemplates(env, { rename: { TEMPLATE_BODY_02: "Template_Body_2" }, skip: ["TEMPLATE_CTA_02"] });
    const inventory = await plugin.scanTemplates(env.api);
    expect(inventory.missing).toEqual(["TEMPLATE_BODY_02", "TEMPLATE_CTA_02"]);
    expect(inventory.problems.join(" ")).toContain("\"Template_Body_2\" → 이름을 \"TEMPLATE_BODY_02\"로 바꾸면");
    const empty = makeApi([]);
    empty.root.children.push(empty.page("Page 1"));
    expect((await plugin.scanTemplates(empty.api)).problems[0]).toContain("\"Templates\" 페이지가 없습니다");
  });
});

test.describe("MY TEMPLATES — selection and insertion (P3·P4·P5)", () => {
  test("auto selection follows slide type and image, and does not repeat the same body template back to back", async () => {
    const env = makeApi(["Pretendard Bold"]);
    buildTemplates(env);
    const data = exportData();
    const auto = plugin.autoAssignTemplates(data.slides, await plugin.scanTemplates(env.api));
    const picks = data.slides.map((slide) => auto[slide.id]!);
    expect(picks[0]).toMatch(/^TEMPLATE_COVER_0(1|3)$/); // 표지에 이미지 있음 → 이미지 슬롯 있는 표지
    expect(picks.at(-1)).toMatch(/^TEMPLATE_CTA_/);
    for (let index = 1; index < picks.length; index += 1) expect(picks[index]).not.toBe(picks[index - 1]);
    expect(picks[3]).toBe("TEMPLATE_BODY_02"); // 4번 슬라이드는 이미지 없음 → 글자 본문
  });

  test("2·3·5. cover, body and CTA templates can be swapped per slide; fields go into same-named layers only", async () => {
    const data = exportData();
    const assignments = { [data.slides[0].id]: "TEMPLATE_COVER_02", [data.slides[1].id]: "TEMPLATE_BODY_02", [data.slides[5].id]: "TEMPLATE_CTA_01" };
    const { report, clones } = await run({ data, assignments });
    expect(clones.map((clone: FNode) => clone.name.replace(/^\d+ · /, ""))).toEqual(expect.arrayContaining(["TEMPLATE_COVER_02", "TEMPLATE_BODY_02", "TEMPLATE_CTA_01"]));
    expect(clones[0].name).toBe("01 · TEMPLATE_COVER_02");
    expect(named(clones[0], "TITLE")[0]._chars).toBe(data.slides[0].template.fields.TITLE);
    expect(named(clones[1], "BODY")[0]._chars).toBe(data.slides[1].template.fields.BODY);
    const cta = clones[5];
    expect(cta.name).toBe("06 · TEMPLATE_CTA_01");
    expect(named(cta, "CTA")[0]._chars).toBe(data.slides[5].template.fields.CTA || "저장해 두고 따라 해 봐요");
    expect(report.frames).toBe(6);
    expect(report.failedFrames).toEqual([]);
    // 장식·배경은 그대로 복제된다.
    expect(clones[0].findAll((item: FNode) => item.name === "deco · 원")).toHaveLength(1);
  });

  test("4·8. each slide's own image fills its slots; a two-image template gets a placeholder for the missing second image, never another slide's image", async () => {
    const data = exportData();
    const { report, clones, ids } = await run({ data, assignments: { [data.slides[2].id]: "TEMPLATE_BODY_03" } });
    const slideImages = data.slides.map((slide) => slide.template.images.IMAGE_MAIN);
    clones.forEach((clone: FNode, index: number) => {
      for (const slot of ["IMAGE_MAIN", "IMAGE_1"]) for (const node of named(clone, slot)) {
        const image = node.fills.find((paint: FNode) => paint.type === "IMAGE");
        if (slideImages[index]) expect(image?.imageHash).toBe(hashOf(slideImages[index]!, ids));
        else expect(image).toBeUndefined();
      }
    });
    const two = clones[2];
    expect(named(two, "IMAGE_1")[0].fills[0].imageHash).toBe(hashOf("img-3", ids));
    expect(named(two, "IMAGE_2")[0].fills.some((paint: FNode) => paint.type === "IMAGE")).toBe(false);
    expect(report.imageNeeded).toContain("03 IMAGE_2: 이 슬라이드에 연결된 이미지가 없음(Studio에서 이미지를 연결하거나 생성)");
    // 템플릿의 다른 채우기(어두운 오버레이)는 그대로, 이미지는 비율 유지 FILL.
    expect(named(two, "IMAGE_1")[0].fills).toEqual([{ type: "IMAGE", imageHash: hashOf("img-3", ids), scaleMode: "FILL" }, { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.1 }]);
    // AI 이미지 표시가 복제본에만 붙는다.
    expect(two.findAll((item: FNode) => item.name === "AI 생성 표시 · 글자")[0]._chars).toBe("AI 생성 이미지");
  });

  test("8. regenerating one slide's image changes only that slide in the next export", async () => {
    const first = await run();
    const second = await run({ data: exportData({ 0: "img-1", 1: "img-2", 2: "img-3b", 4: "img-5" }), images: { ...bytesFor(["img-1", "img-2", "img-3", "img-5"]), "img-3b": new Uint8Array([9, 9]) } });
    const hashes = (clones: FNode[]) => clones.map((clone) => (named(clone, "IMAGE_MAIN")[0] ?? named(clone, "IMAGE_1")[0])?.fills.find((paint: FNode) => paint.type === "IMAGE")?.imageHash ?? null);
    const a = hashes(first.clones), b = hashes(second.clones);
    expect(b[2]).toBe("hash-9.9");
    b.forEach((hash, index) => { if (index !== 2) expect(hash).toBe(a[index]); });
  });

  test("6. Korean template fonts are kept: every font is loaded before editing (mixed fonts too) and a missing font is reported, not replaced", async () => {
    const env = makeApi(["Pretendard Bold", "Pretendard Regular", "Noto Sans KR Bold", "Noto Sans KR Regular"]);
    const data = exportData();
    const { clones, report } = await run({ env, data, assignments: { [data.slides[1].id]: "TEMPLATE_BODY_02" } });
    const mixedTitle = named(clones[1], "TITLE")[0];
    expect(mixedTitle.fontName).toBe(MIXED);
    expect(env.loadCalls).toEqual(expect.arrayContaining(["Pretendard Bold", "Pretendard Regular"]));
    for (const clone of clones) for (const node of clone.findAll((item: FNode) => item.type === "TEXT" && !/^(AI 생성|이미지 없음) 표시/.test(item.name))) expect([MIXED, "Pretendard"]).toContain(node.fontName === MIXED ? MIXED : node.fontName.family);
    expect(report.fontMissing).toEqual([]);

    const missingEnv = makeApi(["Pretendard Bold", "Pretendard Regular", "Noto Sans KR Bold", "Noto Sans KR Regular"]);
    const missing = await run({ env: missingEnv, templates: { missingFont: "TEMPLATE_CTA_01" }, data, assignments: { [data.slides[5].id]: "TEMPLATE_CTA_01" } });
    expect(missing.report.fontMissing).toContain("06 CTA (Galmuri11 Bold)");
    const untouched = named(missing.clones[5], "CTA")[0];
    expect(untouched.name).toBe("CTA"); // 레이어 이름을 바꾸지 않는다
    expect(untouched.fontName).toEqual({ family: "Galmuri11", style: "Bold" }); // 템플릿 글꼴을 바꾸지 않는다
    expect(untouched.visible).toBe(false); // 견본 문구 "저장하기"가 결과물에 보이지 않게
    // 사용자가 대체 글꼴을 고른 경우에만 그 레이어를 바꿔 넣는다.
    const chosenEnv = makeApi(["Pretendard Bold", "Pretendard Regular", "Noto Sans KR Bold", "Noto Sans KR Regular"]);
    const replaced = await run({ env: chosenEnv, templates: { missingFont: "TEMPLATE_CTA_01" }, data, assignments: { [data.slides[5].id]: "TEMPLATE_CTA_01" }, fontFallback: { family: "Noto Sans KR", style: "Bold" } });
    const cta = named(replaced.clones[5], "CTA")[0];
    expect(cta.visible).toBe(true);
    expect(cta.fontName).toEqual({ family: "Noto Sans KR", style: "Bold" });
    expect(replaced.report.fontReplaced).toContain("06 CTA (Galmuri11 Bold → Noto Sans KR Bold)");
  });

  test("7. long text: shrink to at most 85% of the template size, keep the box, never cut the words; still too long → warning", async () => {
    const long = "아바타의 과장된 속눈썹과 네온 섀도를 현실 얼굴에 옮기는 과정을 한 장에 담으려니 문장이 아주 길어졌어요. ".repeat(6);
    const data = exportData();
    data.slides[1].template.fields.BODY = long;
    data.slides[3].template.fields.BODY = "조금 긴 본문이지만 살짝만 줄이면 상자에 들어가는 길이의 문장입니다. 한 줄 더 있어요. 두 줄 더 있어요.";
    const { clones, report } = await run({ data, assignments: { [data.slides[1].id]: "TEMPLATE_BODY_01", [data.slides[3].id]: "TEMPLATE_BODY_02" } });
    const body = named(clones[1], "BODY")[0];
    expect(body._chars).toBe(long);
    expect(body._size).toBeGreaterThanOrEqual(Math.round(34 * 0.85));
    expect(body.height).toBe(300);
    expect(body._mode).toBe("NONE");
    expect(report.overflows).toContain("02 BODY");
    expect(body.name).toBe("BODY"); // 레이어 이름은 바꾸지 않고 plugin data와 결과 메시지로 알린다
    expect(JSON.parse(body.pluginData["trend-radar-template"])).toEqual({ overflow: true });
    const fits = named(clones[3], "BODY")[0];
    expect(report.overflows).not.toContain("04 BODY");
    expect(fits._size).toBeLessThanOrEqual(34);
  });

  test("empty fields hide their layer so template sample text never ships as content", async () => {
    const data = exportData();
    data.slides[0].template.fields.SUBTITLE = "";
    const { clones, report } = await run({ data, assignments: { [data.slides[0].id]: "TEMPLATE_COVER_01" } });
    expect(named(clones[0], "SUBTITLE")[0].visible).toBe(false);
    expect(report.hiddenSlots).toContain("01 SUBTITLE");
  });

  test("a slide whose template kind is missing falls back to AUTO DESIGN for that slide only, in order", async () => {
    const { report, env } = await run({ templates: { skip: ["TEMPLATE_CTA_01", "TEMPLATE_CTA_02"] } });
    expect(report.fallbackSlides).toEqual(["06 (CTA 템플릿 없음 → AUTO DESIGN)"]);
    const frames = (env.api.currentPage as FNode).children.filter((node: FNode) => /^\d{2} · /.test(node.name));
    expect(frames.map((node: FNode) => node.name.slice(0, 2))).toEqual(["01", "02", "03", "04", "05", "06"]);
    expect(frames.map((node: FNode) => node.x)).toEqual([...frames.map((node: FNode) => node.x)].sort((x, y) => x - y));
  });
});

test.describe("MY TEMPLATES — protection and compatibility (P7·P8)", () => {
  test("9. the original templates are unchanged; running on the Templates page writes to a new page", async () => {
    const env = makeApi(["Pretendard Bold", "Pretendard Regular", "Noto Sans KR Bold", "Noto Sans KR Regular"]);
    const { templatesPage } = buildTemplates(env);
    await templatesPage.loadAsync();
    const before = templatesPage.children.map(snapshot);
    env.api.currentPage = templatesPage;
    const data = exportData();
    const report = await plugin.renderTemplates(env.api, data, plugin.buildFigmaPlan(data), bytesFor(["img-1", "img-2", "img-3", "img-5"]), {});
    expect(templatesPage.children.map(snapshot)).toEqual(before);
    expect(report.outputPage).toBe(`TREND RADAR · ${plan.title}`);
    expect(env.api.currentPage).not.toBe(templatesPage);
    expect((env.api.currentPage as FNode).children.filter((node: FNode) => /TEMPLATE_/.test(node.name))).toHaveLength(6);
  });

  test("10. AUTO DESIGN (existing Figma Direct Export rendering) is unchanged and old JSON without template fields still works in MY TEMPLATES", async () => {
    const env = makeApi(["Pretendard Bold", "Pretendard Regular", "Noto Sans KR Bold", "Noto Sans KR Regular", "Inter Regular", "Inter Bold"]);
    buildTemplates(env);
    const data = exportData();
    const report = await plugin.renderPlan(env.api, plugin.buildFigmaPlan(data), bytesFor(["img-1", "img-2", "img-3", "img-5"]));
    expect(report.frames).toBe(6);
    const legacy = JSON.parse(JSON.stringify(data)) as typeof data;
    legacy.slides.forEach((slide) => { delete (slide as Partial<typeof slide>).template; });
    const { clones } = await run({ data: legacy });
    expect(named(clones[0], "TITLE")[0]._chars).toBe(data.slides[0].template.fields.TITLE);
    expect(named(clones[0], "IMAGE_MAIN")[0].fills[0].imageHash).toBe(hashOf("img-1", ["img-1", "img-2", "img-3", "img-5"]));
  });

  test("the plugin UI offers AUTO DESIGN / MY TEMPLATES and per-slide template choices that are sent with the build", () => {
    const html = fs.readFileSync("figma-plugin/ui.html", "utf8");
    expect(html).toContain('value="auto" checked><b>AUTO DESIGN</b>');
    expect(html).toContain('value="templates"><b>MY TEMPLATES</b>');
    expect(html).toContain('send({ type: "scan-templates" })');
    expect(html).toMatch(/mode: exportMode, assignments: exportMode === "templates" \? chosen : \{\}/);
    const script = html.split("<script>")[1].split("</script>")[0];
    expect(() => new Function(script)).not.toThrow();
  });

  test("the web export carries per-slide template content with only that slide's image", () => {
    const data = exportData({ 0: "img-1", 2: "img-3" });
    expect(data.slides[0].template).toMatchObject({ kind: "COVER", images: { IMAGE_MAIN: "img-1", IMAGE_1: null, IMAGE_2: null } });
    expect(data.slides[1].template.images.IMAGE_MAIN).toBeNull();
    expect(data.slides[5].template.kind).toBe("CTA");
    expect(data.slides[2].template.fields.PAGE_NUMBER).toBe("03 / 06");
    expect(data.slides[0].template.fields.CATEGORY).toBe("메이크업");
  });
});

test.describe("MY TEMPLATES — issues found in the real Figma run", () => {
  const gray = { type: "GRADIENT_LINEAR", gradientStops: [{ position: 0, color: { r: 0.5, g: 0.5, b: 0.5, a: 0.6 } }, { position: 1, color: { r: 0.5, g: 0.5, b: 0.5, a: 0 } }] };
  const ids = ["img-1", "img-2", "img-3", "img-5"];

  test("image slots drawn as a group, a frame holding a sample photo, or a loosely named layer still receive the slide image; the gray gradient stays above it", async () => {
    const mutate = (name: string, frame: FNode, create: ReturnType<typeof makeApi>["create"]) => {
      if (name === "TEMPLATE_COVER_01") {
        // 실제 템플릿처럼: IMAGE_MAIN이 그룹(견본 사진 + 회색 그라데이션 레이어)
        const old = frame.children.find((item: FNode) => item.name === "IMAGE_MAIN"); old.remove();
        const group = create("GROUP", { name: "IMAGE_MAIN", width: 1080, height: 1350 });
        group.appendChild(create("RECTANGLE", { name: "photo", width: 1080, height: 1350, fills: [{ type: "IMAGE", imageHash: "sample", scaleMode: "FILL" }] }));
        group.appendChild(create("RECTANGLE", { name: "gradient", width: 1080, height: 600, fills: [gray] }));
        frame.children.unshift(group); group.parent = frame;
      }
      if (name === "TEMPLATE_BODY_01") {
        // 이름 철자 차이 + 이미지 채우기 없이 회색 그라데이션만 있는 사각형
        const slot = frame.children.find((item: FNode) => item.name === "IMAGE_MAIN");
        slot.name = "Image Main"; slot.fills = [gray];
      }
    };
    const data = exportData();
    const { report, clones } = await run({ data, templates: { mutate }, assignments: { [data.slides[0].id]: "TEMPLATE_COVER_01", [data.slides[1].id]: "TEMPLATE_BODY_01" } });
    const coverPhoto = clones[0].findAll((item: FNode) => item.name === "photo")[0];
    expect(coverPhoto.fills).toEqual([{ type: "IMAGE", imageHash: hashOf("img-1", ids), scaleMode: "FILL" }]);
    expect(clones[0].findAll((item: FNode) => item.name === "gradient")[0].fills).toEqual([gray]);
    const bodySlot = clones[1].findAll((item: FNode) => item.name === "Image Main")[0];
    expect(bodySlot.fills).toEqual([{ type: "IMAGE", imageHash: hashOf("img-2", ids), scaleMode: "FILL" }, gray]); // 이미지가 맨 아래, 그라데이션은 위에 그대로
    expect(report.imageNeeded.filter((line) => /^0[12] /.test(line))).toEqual([]);
  });

  test("image slot with an opaque gray base + gradient (found in a real Figma run): the base becomes the image, the gradient stays above", async () => {
    const base = { type: "SOLID", color: { r: 0.85, g: 0.86, b: 0.9 } };
    const shade = { type: "GRADIENT_LINEAR", gradientStops: [{ position: 0, color: { r: 0, g: 0, b: 0, a: 0 } }, { position: 1, color: { r: 0, g: 0, b: 0, a: 0.5 } }] };
    const templates = { mutate: (name: string, frame: FNode) => { if (name === "TEMPLATE_BODY_01") frame.children.find((item: FNode) => item.name === "IMAGE_MAIN").fills = [base, shade]; } };
    const env = makeApi(["Pretendard Bold", "Pretendard Regular", "Noto Sans KR Bold", "Noto Sans KR Regular"]);
    buildTemplates(env, templates);
    expect((await plugin.scanTemplates(env.api)).templates.TEMPLATE_BODY_01.warnings.join(" ")).toContain("맨 아래 단색 바탕을 이미지로 바꿉니다");
    const { report, clones, ids } = await run({ templates, assignments: { [exportData().slides[1].id]: "TEMPLATE_BODY_01" } });
    const slot = clones[1].findAll((item: FNode) => item.name === "IMAGE_MAIN")[0];
    expect(slot.fills).toEqual([{ type: "IMAGE", imageHash: hashOf("img-2", ids), scaleMode: "FILL" }, shade]);
    expect((report as Report & { imageBase: string[] }).imageBase).toContain("02 IMAGE_MAIN");
    expect(report.imageCovered).not.toContain("02 IMAGE_MAIN");
  });

  test("the pre-check names layers it will treat loosely, image slots that would be hidden by an opaque fill, and unrecognized sample text", async () => {
    const env = makeApi(["Pretendard Bold", "Pretendard Regular"]);
    buildTemplates(env, { mutate: (name, frame, create) => {
      if (name === "TEMPLATE_BODY_02") { const body = frame.children.find((item: FNode) => item.name === "BODY"); body.name = "Body Text"; frame.appendChild(create("TEXT", { name: "STATIC_LOGO", _chars: "TREND RADAR", fontName: BOLD })); }
      if (name === "TEMPLATE_CTA_02") frame.children.find((item: FNode) => item.name === "IMAGE_MAIN").fills.push({ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } });
      if (name === "TEMPLATE_BODY_01") frame.children.find((item: FNode) => item.name === "IMAGE_MAIN").name = "image-main";
    } });
    const inventory = await plugin.scanTemplates(env.api);
    expect(inventory.templates.TEMPLATE_BODY_02.unrecognizedTexts).toEqual([{ layer: "Body Text", preview: "본문 견본" }]); // STATIC_ 접두어는 경고하지 않음
    expect(inventory.templates.TEMPLATE_BODY_02.slots).not.toContain("BODY");
    expect(inventory.templates.TEMPLATE_BODY_02.warnings.join(" ")).toContain("슬롯으로 인식되지 않은 텍스트");
    expect(inventory.templates.TEMPLATE_CTA_02.warnings.join(" ")).toContain("불투명한 채우기");
    expect(inventory.templates.TEMPLATE_BODY_01.warnings.join(" ")).toContain("\"image-main\" → \"IMAGE_MAIN\"");
    expect(inventory.templates.TEMPLATE_BODY_01.slots).toContain("IMAGE_MAIN");
  });

  test("the pre-check finds templates whose fonts are not installed and names the fonts", async () => {
    const env = makeApi(["Pretendard Regular"]); // Pretendard Bold 없음
    buildTemplates(env);
    const inventory = await plugin.scanTemplates(env.api);
    const body02 = inventory.templates.TEMPLATE_BODY_02;
    expect(body02.missingFonts.map((item) => item.slot)).toEqual(expect.arrayContaining(["TITLE"]));
    expect(body02.missingFonts.find((item) => item.slot === "TITLE")?.fonts).toEqual(["Pretendard Bold"]);
    expect(body02.warnings.join(" ")).toContain("글꼴 없음: TITLE(Pretendard Bold)");
    expect(body02.missingFonts.some((item) => item.slot === "BODY")).toBe(false);
  });

  test("every slot that cannot get an image says why: no linked image, file not received, or real reference", async () => {
    const data = exportData({ 0: "img-1", 2: "img-3" });
    (data as unknown as { assets: Array<{ id: string; status: string }> }).assets.push({ id: "real-9", status: "REAL REFERENCE" } as never);
    data.slides[4].template.images = { IMAGE_MAIN: "real-9", IMAGE_1: "real-9", IMAGE_2: null };
    (data.slides[4].template as unknown as { imageList: unknown[] }).imageList = [{ assetId: "real-9", role: "main" }];
    const { report, clones } = await run({ data, images: { "img-1": new Uint8Array([1, 7]) }, failedImages: { "img-3": "링크 만료" }, assignments: { [data.slides[1].id]: "TEMPLATE_BODY_01", [data.slides[2].id]: "TEMPLATE_BODY_03", [data.slides[4].id]: "TEMPLATE_BODY_01" } });
    expect(report.imageNeeded).toEqual(expect.arrayContaining([
      expect.stringMatching(/^02 IMAGE_MAIN: 이 슬라이드에 연결된 이미지가 없음/),
      expect.stringMatching(/^03 IMAGE_1: 이미지 파일을 받지 못함 · 링크 만료$/),
      expect.stringMatching(/^05 IMAGE_MAIN: 실제 근거 이미지라 Figma에 복제하지 않음/),
    ]));
    expect(clones[1].findAll((item: FNode) => item.name === "이미지 없음 표시 · 글자")[0]._chars).toContain("이 슬라이드에 연결된 이미지가 없음");
    // 견본 사진은 회색으로 바뀌고 오버레이는 남는다.
    expect(named(clones[1], "IMAGE_MAIN")[0].fills).toEqual([{ type: "SOLID", color: { r: 233 / 255, g: 235 / 255, b: 242 / 255 } }, { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.1 }]);
  });

  test("using only some of the 8 templates is expected: one cover, four bodies and one CTA can use at most five kinds", async () => {
    const env = makeApi(["Pretendard Bold"]);
    buildTemplates(env);
    const inventory = await plugin.scanTemplates(env.api);
    const data = exportData();
    const auto = plugin.autoAssignTemplates(data.slides, inventory);
    const note = plugin.explainAssignment(data.slides, inventory, auto);
    expect(note).toContain("표지 1 · 본문 4 · CTA 1");
    expect(note).toContain("최대 5종");
    expect(new Set(Object.values(auto)).size).toBe(5);
  });
});

/* ---------- 배경 이미지 슬롯 · 슬라이드당 여러 이미지 · 배경 단색 대체 ---------- */
/** slide.images를 붙인 실측 6장. extra: 슬라이드 순번(0부터) → 추가 이미지 목록. 자산은 프로젝트에 함께 넣는다. */
function exportWithImages(main: Record<number, string>, extra: Record<number, SlideImageRef[]>, design?: { colors: { primary: string } }) {
  const slides = plan.slides.map((slide, index) => {
    const base = withSlideImage({ ...slide }, emptySlideImage(slide.image_prompt));
    const linked = main[index] ? withSlideImage(base, { ...base.image!, assetId: main[index], status: "ready", source: "ai" }) : base;
    return extra[index] ? { ...linked, images: extra[index] } : linked;
  });
  const ids = [...new Set([...Object.values(main), ...Object.values(extra).flat().map((item) => item.assetId)])];
  const project: StudioProject = { id: "tpl-multi", mode: "single", title: plan.title, source: { trendKeys: ["t"], trendNames: ["메이크업"] }, settings: { ...defaultSettings("cardnews"), slideCount: 6, cta: "저장" }, plan: { ...plan, slides }, assets: ids.map((id) => asset(id)), edited: false, createdAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z" };
  return { data: toFigmaExport(project, "2026-11-03T00:00:00.000Z", {}, design ? { design: design as never } : {}) as unknown as ReturnType<typeof exportData>, ids };
}
const ALL_FONTS = ["Pretendard Bold", "Pretendard Regular", "Noto Sans KR Bold", "Noto Sans KR Regular"];
const hex = (value: string) => ({ r: parseInt(value.slice(1, 3), 16) / 255, g: parseInt(value.slice(3, 5), 16) / 255, b: parseInt(value.slice(5, 7), 16) / 255 });
/** 프레임 맨 아래에 레이어를 깐다(가짜 API에는 insertChild가 없다). */
const underlay = (frame: FNode, node: FNode) => { frame.children.unshift(node); node.parent = frame; };

test.describe("MY TEMPLATES — background image slots, multiple images per slide, background fallback", () => {
  test("1. a cover template with only BG_IMAGE (or IMAGE_BG / BACKGROUND_IMAGE) is a valid template and gets the slide image full-bleed, text stays above", async () => {
    for (const alias of ["BG_IMAGE", "IMAGE_BG", "BACKGROUND_IMAGE"]) {
      const templates = { mutate: (name: string, frame: FNode, create: ReturnType<typeof makeApi>["create"]) => {
        if (name === "TEMPLATE_COVER_02") underlay(frame, create("RECTANGLE", { name: alias, width: 1080, height: 1350, fills: [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }, { type: "GRADIENT_LINEAR", gradientStops: [{ position: 0, color: { r: 0, g: 0, b: 0, a: 0 } }, { position: 1, color: { r: 0, g: 0, b: 0, a: 0.6 } }] }] }));
      } };
      const env = makeApi(ALL_FONTS);
      buildTemplates(env, templates);
      const cover = (await plugin.scanTemplates(env.api)).templates.TEMPLATE_COVER_02;
      expect(cover.slots).toEqual(expect.arrayContaining(["BG_IMAGE", "TITLE"]));
      expect(cover.background).toBe(alias);
      expect(cover.imageSlots).toBe(0);
      expect(cover.summary).toContain("배경 이미지 슬롯 있음");
      expect(cover.warnings.join(" ")).not.toContain("인식했습니다"); // 별칭은 정확한 이름으로 본다
      const data = exportData();
      const { clones, ids } = await run({ templates, data, assignments: { [data.slides[0].id]: "TEMPLATE_COVER_02" } });
      const slot = clones[0].findAll((item: FNode) => item.name === alias)[0];
      expect(slot.fills[0]).toEqual({ type: "IMAGE", imageHash: hashOf("img-1", ids), scaleMode: "FILL" }); // 꽉 채움(cover)
      expect(slot.fills[1].type).toBe("GRADIENT_LINEAR"); // 오버레이 유지
      expect(clones[0].children.indexOf(slot)).toBe(0); // 텍스트는 그대로 위
      expect(clones[0].findAll((item: FNode) => item.name === "TITLE")[0]._chars).toBe(data.slides[0].template.fields.TITLE);
    }
  });

  test("2. a body template with one IMAGE_MAIN gets the representative image; extra images without a slot are reported", async () => {
    const { data, ids } = exportWithImages({ 1: "img-2" }, { 1: [{ assetId: "img-7", role: "detail" }] });
    const { report, clones } = await run({ data, images: bytesFor(ids), assignments: { [data.slides[1].id]: "TEMPLATE_BODY_01" } });
    expect(named(clones[1], "IMAGE_MAIN")[0].fills[0]).toEqual({ type: "IMAGE", imageHash: hashOf("img-2", ids), scaleMode: "FILL" });
    expect(report.imagesUnused).toEqual([expect.stringContaining("02 TEMPLATE_BODY_01: 이미지 2장 중 1장(img-7)을 넣을 이미지 슬롯이 없음")]);
  });

  test("3. IMAGE_MAIN + IMAGE_2: two images per slide go to different slots in order, and auto picks the two-image body template", async () => {
    const { data, ids } = exportWithImages({ 0: "img-1", 2: "img-3" }, { 2: [{ assetId: "img-8", role: "detail" }] });
    const slide = data.slides[2] as unknown as { template: { images: Record<string, string | null>; imageList: SlideImageRef[] } };
    expect(slide.template.imageList).toEqual([{ assetId: "img-3", role: "main" }, { assetId: "img-8", role: "detail" }]);
    expect(slide.template.images).toMatchObject({ IMAGE_MAIN: "img-3", IMAGE_1: "img-8", BG_IMAGE: null });
    const env = makeApi(ALL_FONTS);
    buildTemplates(env);
    expect(plugin.autoAssignTemplates(data.slides, await plugin.scanTemplates(env.api))[data.slides[2].id]).toBe("TEMPLATE_BODY_03");
    const { report, clones } = await run({ data, images: bytesFor(ids), assignments: { [data.slides[2].id]: "TEMPLATE_BODY_03" } });
    expect(named(clones[2], "IMAGE_1")[0].fills[0].imageHash).toBe(hashOf("img-3", ids));
    expect(named(clones[2], "IMAGE_2")[0].fills[0].imageHash).toBe(hashOf("img-8", ids));
    expect(report.imageNeeded.filter((line) => line.startsWith("03 "))).toEqual([]);
  });

  test("a background-role image goes to BG_IMAGE and the main image to IMAGE_MAIN; without a background image, BG_IMAGE uses the main image", async () => {
    const templates = { mutate: (name: string, frame: FNode, create: ReturnType<typeof makeApi>["create"]) => {
      if (name !== "TEMPLATE_COVER_01") return;
      underlay(frame, create("RECTANGLE", { name: "BG_IMAGE", width: 1080, height: 1350, fills: [] }));
      const main = frame.children.find((item: FNode) => item.name === "IMAGE_MAIN"); main.width = 600; main.height = 600;
    } };
    const withBg = exportWithImages({ 0: "img-1" }, { 0: [{ assetId: "img-9", role: "background" }] });
    let result = await run({ templates, data: withBg.data, images: bytesFor(withBg.ids), assignments: { [withBg.data.slides[0].id]: "TEMPLATE_COVER_01" } });
    expect(named(result.clones[0], "BG_IMAGE")[0].fills[0].imageHash).toBe(hashOf("img-9", withBg.ids));
    expect(named(result.clones[0], "IMAGE_MAIN")[0].fills[0].imageHash).toBe(hashOf("img-1", withBg.ids));
    const single = exportWithImages({ 0: "img-1" }, {});
    result = await run({ templates, data: single.data, images: bytesFor(single.ids), assignments: { [single.data.slides[0].id]: "TEMPLATE_COVER_01" } });
    expect(named(result.clones[0], "IMAGE_MAIN")[0].fills[0].imageHash).toBe(hashOf("img-1", single.ids));
    expect(named(result.clones[0], "BG_IMAGE")[0].fills[0]).toEqual({ type: "IMAGE", imageHash: hashOf("img-1", single.ids), scaleMode: "FILL" }); // BACKGROUND 없음 → MAIN 이미지
  });

  test("4. no image: background slots get a solid color (BG_COLOR layer → frame background → project palette → #F5F5F5), normal slots keep the gray placeholder, transparent frames get a color", async () => {
    const bgOnly = (bgColor?: string, frameFill = true) => ({ mutate: (name: string, frame: FNode, create: ReturnType<typeof makeApi>["create"]) => {
      if (name === "TEMPLATE_COVER_02") {
        underlay(frame, create("RECTANGLE", { name: "BG_IMAGE", width: 1080, height: 1350, fills: [{ type: "IMAGE", imageHash: "sample", scaleMode: "FILL" }] }));
        if (bgColor) frame.appendChild(create("RECTANGLE", { name: "BG_COLOR", width: 10, height: 10, visible: false, fills: [{ type: "SOLID", color: hex(bgColor) }] }));
        if (!frameFill) frame.fills = [];
      }
      if (name === "TEMPLATE_CTA_01" && !frameFill) frame.fills = [];
    } });
    const none = exportWithImages({}, {});
    const cases: Array<[ReturnType<typeof bgOnly>, { colors: { primary: string } } | undefined, string, string]> = [
      [bgOnly("#112233"), undefined, "#112233", "BG_COLOR 레이어"],
      [bgOnly(), undefined, "#FFFFFF", "템플릿 프레임 배경"],
      [bgOnly(undefined, false), { colors: { primary: "#FF4FA3" } }, "#FF4FA3", "프로젝트 팔레트 대표색"],
    ];
    for (const [templates, design, color, source] of cases) {
      const { data } = design ? exportWithImages({}, {}, design) : none;
      const env = makeApi(ALL_FONTS);
      buildTemplates(env, templates);
      expect((await plugin.scanTemplates(env.api)).templates.TEMPLATE_COVER_02.summary).toContain(source === "프로젝트 팔레트 대표색" ? "프로젝트 팔레트 대표색(없으면 #F5F5F5)" : `${color}(${source})`);
      const { report, clones } = await run({ templates, data, assignments: { [data.slides[0].id]: "TEMPLATE_COVER_02", [data.slides[5].id]: "TEMPLATE_CTA_01" } });
      expect(named(clones[0], "BG_IMAGE")[0].fills).toEqual([{ type: "SOLID", color: hex(color) }]);
      expect(report.backgroundFallbacks).toEqual([`01 BG_IMAGE: 단색 ${color}(${source}) · 배경에 쓸 이미지 없음`]);
      expect(clones[0].findAll((item: FNode) => /이미지 없음 표시/.test(item.name))).toEqual([]); // 배경 슬롯에는 회색·안내 표시 없음
      if (source === "프로젝트 팔레트 대표색") expect(report.frameBackgrounds).toEqual(expect.arrayContaining([`06 TEMPLATE_CTA_01: 단색 ${color}(${source})`]));
      expect(clones.every((clone: FNode) => clone.fills.some((paint: FNode) => paint.type === "SOLID" && paint.visible !== false && (paint.opacity ?? 1) >= 0.99))).toBe(true); // 투명(체크보드) 프레임 없음
    }
    // 팔레트도 없는 이전 JSON → 기본값
    const legacy = exportWithImages({}, {}).data as unknown as { project: { palette?: unknown } };
    delete legacy.project.palette;
    const { report } = await run({ templates: bgOnly(undefined, false), data: legacy as never, assignments: { [none.data.slides[0].id]: "TEMPLATE_COVER_02" } });
    expect(report.backgroundFallbacks[0]).toContain("단색 #F5F5F5(기본값)");
    // 일반 이미지 슬롯은 기존 회색 자리표시 + 이유 유지
    const body = await run({ data: none.data, assignments: { [none.data.slides[1].id]: "TEMPLATE_BODY_01" } });
    expect(named(body.clones[1], "IMAGE_MAIN")[0].fills[0]).toEqual({ type: "SOLID", color: { r: 233 / 255, g: 235 / 255, b: 242 / 255 } });
    expect(body.report.imageNeeded).toEqual(expect.arrayContaining([expect.stringMatching(/^02 IMAGE_MAIN: 이 슬라이드에 연결된 이미지가 없음/)]));
  });

  test("an IMAGE_MAIN that covers the whole frame is treated as a background slot: solid fallback instead of a gray placeholder", async () => {
    const none = exportWithImages({}, {});
    const env = makeApi(ALL_FONTS);
    buildTemplates(env);
    expect((await plugin.scanTemplates(env.api)).templates.TEMPLATE_COVER_01.background).toContain("IMAGE_MAIN(프레임 크기와 비슷해 배경으로 처리)");
    const { report, clones } = await run({ data: none.data, assignments: { [none.data.slides[0].id]: "TEMPLATE_COVER_01" } });
    expect(named(clones[0], "IMAGE_MAIN")[0].fills[0]).toEqual({ type: "SOLID", color: hex("#FFFFFF") });
    expect(report.backgroundFallbacks[0]).toMatch(/^01 IMAGE_MAIN: 단색 #FFFFFF\(템플릿 프레임 배경\)/);
  });

  test("5. old data with only slide.image (no slide.images, no imageList in the JSON) still works", async () => {
    const data = exportData();
    expect((data.slides[0].template as unknown as { imageList: SlideImageRef[] }).imageList).toEqual([{ assetId: "img-1", role: "main" }]);
    data.slides.forEach((slide) => { delete (slide.template as unknown as { imageList?: unknown }).imageList; });
    const { report, clones, ids } = await run({ data, assignments: { [data.slides[1].id]: "TEMPLATE_BODY_01" } });
    expect(named(clones[1], "IMAGE_MAIN")[0].fills[0].imageHash).toBe(hashOf("img-2", ids));
    expect(report.images).toBeGreaterThanOrEqual(2);
  });

  test("6. the export keeps the AUTO DESIGN input unchanged: one IMAGE element per slide (the representative image) even with extra images", async () => {
    const { data } = exportWithImages({ 2: "img-3" }, { 2: [{ assetId: "img-8", role: "detail" }, { assetId: "img-9", role: "background" }] });
    const slide = data.slides[2] as unknown as { elements: Array<{ type: string; assetId?: string }>; template: { images: Record<string, string | null> } };
    expect(slide.elements.filter((item) => item.type === "IMAGE")).toEqual([expect.objectContaining({ assetId: "img-3" })]);
    expect(slide.template.images).toMatchObject({ IMAGE_MAIN: "img-3", IMAGE_1: "img-8", BG_IMAGE: "img-9" });
  });
});

/* ---------- P10·P13·P15: 템플릿 동기화(썸네일)·변경 감지·임시 복제본 렌더링 ---------- */
const sync = createRequire(__filename)("../figma-plugin/code.js") as {
  designHash: (api: unknown, node: unknown) => string;
  exportTemplateThumbnails: (api: unknown, inventory: Inventory) => Promise<Array<{ ok: boolean; template: { templateId: string; name: string; width: number; height: number; fileKey: string | null; fileName: string; nodeId: string; designHash: string; placeholders: { slots: string[]; imageSlots: number; background: string | null; summary: string } }; bytes?: Uint8Array; error?: string }>>;
  renderTemplatePreviews: (api: unknown, data: unknown, plan: unknown, images: Record<string, Uint8Array>, options?: Record<string, unknown>) => Promise<{ items: Array<{ slideId: string; templateId: string; previewKey: string; bytes: Uint8Array }>; skipped: string[] }>;
};

test.describe("MY TEMPLATES SYNC — plugin side (fake Figma API, not the Figma app)", () => {
  test("SYNC exports all 8 templates as PNG with metadata, without changing the originals", async () => {
    const env = makeApi(ALL_FONTS);
    const { templatesPage } = buildTemplates(env);
    const before = templatesPage._kids.map(snapshot);
    const inventory = await plugin.scanTemplates(env.api);
    const items = await sync.exportTemplateThumbnails(env.api, inventory);
    expect(items.map((item) => item.template.templateId).sort()).toEqual([...plugin.TEMPLATE_NAMES].sort());
    expect(items.every((item) => item.ok && item.bytes && item.bytes[0] === 137)).toBe(true);
    const body03 = items.find((item) => item.template.templateId === "TEMPLATE_BODY_03")!.template;
    expect(body03).toMatchObject({ name: "TEMPLATE_BODY_03", width: 1080, height: 1350, fileName: "My Templates File", fileKey: null });
    expect(body03.nodeId).toMatch(/^n\d+$/);
    expect(body03.placeholders).toMatchObject({ imageSlots: 2, slots: expect.arrayContaining(["TITLE", "IMAGE_1", "IMAGE_2", "BODY"]) });
    expect(body03.designHash).toMatch(/^[0-9a-f]{16}$/);
    expect(env.exports.every((item) => item.width === 480)).toBe(true);
    expect(templatesPage._kids.map(snapshot)).toEqual(before); // 원본 그대로
  });

  test("a template that cannot be exported is reported as failed (the others still sync)", async () => {
    const env = makeApi(ALL_FONTS);
    buildTemplates(env, { mutate: (name, frame) => { if (name === "TEMPLATE_CTA_02") frame._exportFails = true; } });
    const items = await sync.exportTemplateThumbnails(env.api, await plugin.scanTemplates(env.api));
    expect(items.filter((item) => !item.ok)).toEqual([expect.objectContaining({ ok: false, error: "export failed", template: expect.objectContaining({ templateId: "TEMPLATE_CTA_02" }) })]);
    expect(items.filter((item) => item.ok)).toHaveLength(7);
  });

  test("the design fingerprint is stable and changes when the template design changes (for UPDATE AVAILABLE)", async () => {
    const env = makeApi(ALL_FONTS);
    buildTemplates(env);
    const first = await plugin.scanTemplates(env.api);
    const again = await plugin.scanTemplates(env.api);
    expect(again.templates.TEMPLATE_BODY_01).toMatchObject({ designHash: (first.templates.TEMPLATE_BODY_01 as unknown as { designHash: string }).designHash });
    const changed = makeApi(ALL_FONTS);
    buildTemplates(changed, { mutate: (name, frame) => { if (name === "TEMPLATE_BODY_01") frame.children.find((item: FNode) => item.name === "TITLE")._chars = "바뀐 견본"; } });
    const after = await plugin.scanTemplates(changed.api);
    expect((after.templates.TEMPLATE_BODY_01 as unknown as { designHash: string }).designHash).not.toBe((first.templates.TEMPLATE_BODY_01 as unknown as { designHash: string }).designHash);
    expect((after.templates.TEMPLATE_BODY_02 as unknown as { designHash: string }).designHash).toBe((first.templates.TEMPLATE_BODY_02 as unknown as { designHash: string }).designHash);
  });

  test("rendered content preview: temporary clones on a temporary page → PNG per slide, then the page is removed and the user is back on their page", async () => {
    const env = makeApi(ALL_FONTS);
    const { templatesPage, work } = buildTemplates(env);
    const before = templatesPage._kids.map(snapshot);
    work.appendChild(env.create("FRAME", { name: "사용자 작업" }));
    const data = exportData();
    // Content Studio에서 고른 템플릿(slide.template.templateId)이 기본 선택이 된다.
    (data.slides[1].template as unknown as { templateId: string }).templateId = "TEMPLATE_BODY_03";
    data.slides.forEach((slide, index) => { (slide.template as unknown as { previewKey: string }).previewKey = `key-${index}`; });
    const pagesBefore = env.root.children.length;
    const result = await sync.renderTemplatePreviews(env.api, data, plugin.buildFigmaPlan(data), bytesFor(["img-1", "img-2", "img-3", "img-5"]), {});
    expect(result.items).toHaveLength(6);
    expect(result.items[1]).toMatchObject({ slideId: data.slides[1].id, templateId: "TEMPLATE_BODY_03", previewKey: "key-1" });
    expect(result.items.every((item) => item.bytes[0] === 137)).toBe(true);
    expect(env.root.children.length).toBe(pagesBefore); // 임시 페이지 삭제
    expect(env.api.currentPage).toBe(work); // 원래 페이지로
    expect(work.children.map((node: FNode) => node.name)).toEqual(["사용자 작업"]); // 사용자 페이지에 아무것도 남기지 않음
    expect(templatesPage._kids.map(snapshot)).toEqual(before);
  });

  test("the plugin pre-selects the template chosen in Content Studio, but a choice made in the plugin wins", async () => {
    const env = makeApi(ALL_FONTS);
    buildTemplates(env);
    const inventory = await plugin.scanTemplates(env.api);
    const data = exportData();
    (data.slides[2].template as unknown as { templateId: string }).templateId = "TEMPLATE_BODY_02";
    expect(plugin.resolveAssignments(data.slides, inventory, {})[data.slides[2].id]).toBe("TEMPLATE_BODY_02");
    expect(plugin.resolveAssignments(data.slides, inventory, { [data.slides[2].id]: "TEMPLATE_BODY_01" })[data.slides[2].id]).toBe("TEMPLATE_BODY_01");
    const ui = fs.readFileSync("figma-plugin/ui.html", "utf8");
    expect(ui).toContain('id="sync-templates"');
    expect(ui).toContain('id="render-previews"');
    expect(ui).toMatch(/if \(unit\.template && unit\.template\.templateId\) chosen\[unit\.id\] = unit\.template\.templateId/);
    expect(ui).toMatch(/if \(!auth\.token\) \{ setStatus\("템플릿을 동기화하려면 먼저 TREND RADAR에 연결하세요/);
  });
});

test.describe("BG_IMAGE rectangle (explicit background slot)", () => {
  const withBg = { mutate: (name: string, frame: FNode, create: ReturnType<typeof makeApi>["create"]) => {
    if (name !== "TEMPLATE_COVER_01") return;
    // 사용자가 추가한 맨 아래 BG_IMAGE 사각형(회색) + 그 위 그라데이션은 기존 IMAGE_MAIN 그룹/텍스트가 그대로 위에 있다.
    underlay(frame, create("RECTANGLE", { name: "BG_IMAGE", width: 1080, height: 1350, fills: [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }, { type: "GRADIENT_LINEAR", gradientStops: [{ position: 0, color: { r: 0, g: 0, b: 0, a: 0 } }, { position: 1, color: { r: 0, g: 0, b: 0, a: 0.6 } }] }] }));
  } };

  test("the slide's MAIN image fills BG_IMAGE (FILL) when there is no background image; gradient and title stay above; the original is untouched", async () => {
    const data = exportData();
    const result = await run({ templates: withBg, data, assignments: { [data.slides[0].id]: "TEMPLATE_COVER_01" } });
    const templatesPage = result.pages.templatesPage;
    const before = buildTemplates(makeApi(ALL_FONTS), withBg).templatesPage._kids.map(snapshot);
    const bg = named(result.clones[0], "BG_IMAGE")[0];
    expect(bg.fills[0]).toEqual({ type: "IMAGE", imageHash: hashOf("img-1", result.ids), scaleMode: "FILL" });
    expect(bg.fills[1].type).toBe("GRADIENT_LINEAR");
    expect(result.clones[0].children.indexOf(bg)).toBe(0);
    expect(result.clones[0].findAll((item: FNode) => item.name === "TITLE")[0]._chars).toBe(data.slides[0].template.fields.TITLE);
    expect(result.report.backgroundFallbacks).toEqual([]);
    expect(templatesPage._kids.map(snapshot)).toEqual(before);
  });

  test("when the image could not be fetched, BG_IMAGE becomes a solid color (no checkerboard) and the reason is reported", async () => {
    const data = exportData();
    const result = await run({ templates: withBg, data, images: {}, failedImages: { "img-1": "HTTP 403 · 링크 만료 가능" }, assignments: { [data.slides[0].id]: "TEMPLATE_COVER_01" } });
    expect(named(result.clones[0], "BG_IMAGE")[0].fills[0]).toEqual({ type: "SOLID", color: hex("#FFFFFF") });
    expect(result.report.backgroundFallbacks).toEqual(expect.arrayContaining([expect.stringContaining("01 BG_IMAGE: 단색 #FFFFFF(템플릿 프레임 배경) · 이미지 파일을 받지 못함 · HTTP 403 · 링크 만료 가능")]));
  });

  test("the plugin UI records why an image could not be loaded (no address in the job, expired link, network) and logs it", () => {
    const ui = fs.readFileSync("figma-plugin/ui.html", "utf8");
    expect(ui).toContain("이미지 주소가 작업에 없음");
    expect(ui).toContain("링크 만료");
    expect(ui).toMatch(/console\.warn\("\[TREND RADAR\] 이미지 "/);
    expect(ui).toContain("이미지 로딩 실패: ");
  });
});

test.describe("numbered image slot names (IMAGE_1 in TEMPLATE_BODY_03)", () => {
  test("IMAGE1 / IMAGE_01 / img-1 are filled as IMAGE_1 with a rename hint; unknown photo-like names, masks and hidden slots are flagged before building", async () => {
    for (const variant of ["IMAGE1", "IMAGE_01", "img-1"]) {
      const templates = { mutate: (name: string, frame: FNode) => { if (name === "TEMPLATE_BODY_03") frame.children.find((item: FNode) => item.name === "IMAGE_1").name = variant; } };
      const env = makeApi(ALL_FONTS);
      buildTemplates(env, templates);
      const body03 = (await plugin.scanTemplates(env.api)).templates.TEMPLATE_BODY_03;
      expect(body03.slots).toContain("IMAGE_1");
      expect(body03.warnings.join(" ")).toContain(`"${variant}" → "IMAGE_1"`);
      const data = exportData();
      const result = await run({ templates, data, assignments: { [data.slides[2].id]: "TEMPLATE_BODY_03" } });
      expect(result.clones[2].findAll((item: FNode) => item.name === variant)[0].fills[0].imageHash).toBe(hashOf("img-3", result.ids));
    }
    const env = makeApi(ALL_FONTS);
    buildTemplates(env, { mutate: (name, frame, create) => {
      if (name === "TEMPLATE_BODY_03") { frame.children.find((item: FNode) => item.name === "IMAGE_1").isMask = true; frame.children.find((item: FNode) => item.name === "IMAGE_2").visible = false; }
      if (name === "TEMPLATE_BODY_01") frame.appendChild(create("RECTANGLE", { name: "Photo 1", width: 100, height: 100, fills: [] }));
    } });
    const inventory = await plugin.scanTemplates(env.api);
    const warnings = inventory.templates.TEMPLATE_BODY_03.warnings.join(" ");
    expect(warnings).toContain("IMAGE_1: \"IMAGE_1\"은(는) 마스크 레이어라");
    expect(warnings).toContain("IMAGE_2: \"IMAGE_2\" 레이어(또는 상위 레이어)가 숨겨져");
    expect(inventory.templates.TEMPLATE_BODY_01.warnings.join(" ")).toContain("\"Photo 1\": 이미지 자리처럼 보이지만");
    // IMAGE_MAIN 그룹 안의 사진 레이어(photo)는 경고하지 않는다.
    const grouped = makeApi(ALL_FONTS);
    buildTemplates(grouped, { mutate: (name, frame, create) => { if (name === "TEMPLATE_COVER_01") { const slot = frame.children.find((item: FNode) => item.name === "IMAGE_MAIN"); const group = create("GROUP", { name: "IMAGE_MAIN" }); slot.name = "photo"; frame.children.splice(frame.children.indexOf(slot), 1); slot.parent = null; group.appendChild(slot); frame.appendChild(group); } } });
    expect((await plugin.scanTemplates(grouped.api)).templates.TEMPLATE_COVER_01.warnings.join(" ")).not.toContain("이미지 자리처럼 보이지만");
  });
});

test.describe("IMAGE_1 is its own photo slot (like IMAGE_2)", () => {
  test("with IMAGE_MAIN + IMAGE_1 + IMAGE_2 each slot gets a different image; without IMAGE_MAIN the main image starts at IMAGE_1; old JSON still works", () => {
    const list = [{ assetId: "m", role: "main" }, { assetId: "d1", role: "detail" }, { assetId: "d2", role: "detail" }, { assetId: "bg", role: "background" }];
    const map = (sync as unknown as { mapTemplateImages: (l: unknown[], s: string[]) => Record<string, string | null> }).mapTemplateImages;
    expect(map(list, ["BG_IMAGE", "IMAGE_MAIN", "IMAGE_1", "IMAGE_2"])).toEqual({ BG_IMAGE: "bg", IMAGE_MAIN: "m", IMAGE_1: "d1", IMAGE_2: "d2" });
    expect(map(list, ["IMAGE_1", "IMAGE_2"])).toEqual({ IMAGE_1: "m", IMAGE_2: "d1" });
    expect(map(list.slice(0, 1), ["IMAGE_MAIN", "IMAGE_1"])).toEqual({ IMAGE_MAIN: "m", IMAGE_1: null }); // 같은 사진을 IMAGE_1에 반복하지 않음
    const old = { template: { fields: {}, images: { IMAGE_MAIN: "m", IMAGE_1: "m", IMAGE_2: "d1" } } };
    expect((sync as unknown as { slideImageList: (c: unknown) => unknown[] }).slideImageList(old.template)).toEqual([{ assetId: "m", role: "main" }, { assetId: "d1", role: "detail" }]);
  });

  test("a template with IMAGE_MAIN + IMAGE_1 gets the main image and the first extra image in separate slots", async () => {
    const templates = { mutate: (name: string, frame: FNode, create: ReturnType<typeof makeApi>["create"]) => { if (name === "TEMPLATE_BODY_01") frame.appendChild(create("RECTANGLE", { name: "IMAGE_1", width: 400, height: 300, fills: [{ type: "IMAGE", imageHash: "sample", scaleMode: "FILL" }] })); } };
    const { data, ids } = exportWithImages({ 1: "img-2" }, { 1: [{ assetId: "img-7", role: "detail" }] });
    const result = await run({ templates, data, images: bytesFor(ids), assignments: { [data.slides[1].id]: "TEMPLATE_BODY_01" } });
    expect(named(result.clones[1], "IMAGE_MAIN")[0].fills[0].imageHash).toBe(hashOf("img-2", ids));
    expect(named(result.clones[1], "IMAGE_1")[0].fills[0].imageHash).toBe(hashOf("img-7", ids));
    expect(result.report.imagesUnused).toEqual([]);
  });
});
