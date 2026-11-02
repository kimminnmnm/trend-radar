import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page, type Route } from "@playwright/test";
import production from "./fixtures/studio-production.json";
import { defaultSettings, type ProductionPlan, type StudioProject } from "../lib/content-production";
import { toFigmaExport } from "../lib/figma-export";
import { handoffContentHash, handoffExportSchema } from "../lib/figma-handoff";
import type { ImageAssetRef } from "../lib/image-assets";

/*
 * FIGMA DIRECT EXPORT F1~F5.
 * - 웹: Studio → "Figma로 보내기"(로그인 상태는 Supabase 인증·REST·Storage 응답을 브라우저에서 가짜로 돌려 흉내 낸다)
 * - 서버: 실제 Next API 라우트의 인증·CORS·입력 검사(Supabase에 닿기 전 단계). DB 권한은 PGlite(0009)로 따로 검증했다.
 * - 플러그인: 실제 figma-plugin/ui.html + code.js를 가짜 figma 환경(harness)에서 실행. 실제 Figma 앱이 아니다.
 * 유료 API 호출 없음. 제작 기획은 실측 픽스처(카드뉴스 6장)를 쓴다.
 */
const plugin = createRequire(__filename)("../figma-plugin/code.js") as {
  HANDOFF_KEY: string;
  buildFigmaPlan: (data: unknown) => { errors: string[]; frames: unknown[]; notes: unknown };
  renderPlan: (api: unknown, plan: unknown, images: Record<string, Uint8Array>, options?: { handoffId?: string; code?: string }) => Promise<{ frames: number; images: number; references: number; missing: number; fontFallbacks: Record<string, string>; failedFrames: Array<{ name: string }> }>;
  existingImports: (api: unknown, id: string) => number;
};
const prod = production as unknown as { response: { plan: ProductionPlan } };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const PROJECT_ID = "studio-figma-direct";
const asset = (id: string, status: ImageAssetRef["status"], extra: Partial<ImageAssetRef>): ImageAssetRef => ({ id, status, title: id, createdAt: "2026-10-30T00:00:00.000Z", rights: "test", ...extra });
const project = (): StudioProject => ({
  id: PROJECT_ID, mode: "single", title: "네 컷 사진 부스", source: { trendKeys: ["t"], trendNames: ["헤이세이 레트로"] },
  settings: { ...defaultSettings("cardnews"), slideCount: 6 },
  plan: { ...prod.response.plan, slides: prod.response.plan.slides.map((slide, index) => index === 0 ? { ...slide, image_ref: "img-cover" } : index === 2 ? { ...slide, image_ref: "real-1" } : { ...slide, image_ref: "" }) },
  assets: [asset("img-cover", "AI PRODUCTION ASSET", { dataUrl: `data:image/jpeg;base64,${PNG}`, model: "m", aspect: "4:5" }), asset("real-1", "REAL REFERENCE", { url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk" })],
  edited: false, createdAt: "2026-10-30T00:00:00.000Z", updatedAt: "2026-10-30T00:00:00.000Z",
} as StudioProject);

/** 가짜 figma API(노드 기록, 없는 글꼴 거부). harness에서도 같은 구조를 쓴다. */
function fakeFigma(fonts: string[], existing: Array<Record<string, unknown>> = []) {
  const make = (type: string) => {
    const item: Record<string, unknown> & { children: unknown[]; data: Record<string, string> } = { type, children: [], width: 0, height: 0, x: 0, y: 0, data: {} };
    item.resize = (w: number, h: number) => { item.width = w; item.height = type === "TEXT" ? Math.max(h, item.height as number) : h; };
    item.appendChild = (child: unknown) => item.children.push(child);
    item.setPluginData = (key: string, value: string) => { item.data[key] = value; };
    item.getPluginData = (key: string) => item.data[key] ?? "";
    item.remove = () => { const index = page.children.indexOf(item); if (index >= 0) page.children.splice(index, 1); };
    if (type === "TEXT") Object.defineProperty(item, "characters", { set(value: string) { item._chars = value; item.height = Math.ceil(value.length / 30) * ((item.fontSize as number) || 16) * 1.4; }, get() { return item._chars; } });
    return item;
  };
  const page = { children: [...existing] as Array<Record<string, unknown>>, selection: [] as unknown[], appendChild(child: Record<string, unknown>) { this.children.push(child); } };
  let relaunch: unknown = null;
  const api = {
    currentPage: page, root: { setRelaunchData: (data: unknown) => { relaunch = data; } }, viewport: { center: { x: 0, y: 0 }, scrollAndZoomIntoView: () => {} },
    createFrame: () => make("FRAME"), createText: () => make("TEXT"), createRectangle: () => make("RECTANGLE"),
    createImage: (bytes: Uint8Array) => ({ hash: `hash-${bytes.length}` }),
    loadFontAsync: async (font: { family: string; style: string }) => { if (!fonts.includes(`${font.family} ${font.style}`)) throw new Error("missing font"); },
  };
  return { api, page, relaunch: () => relaunch };
}
const KOREAN = ["Noto Sans KR Regular", "Noto Sans KR Medium", "Noto Sans KR Bold", "Noto Sans KR ExtraBold"];

test.describe("F1·F3 rules (no browser)", () => {
  test("the server schema accepts the real export and rejects copied real references, foreign image hosts and empty plans", () => {
    const images = { "img-cover": { url: `data:image/jpeg;base64,${PNG}`, expiresAt: null, kind: "inline" as const } };
    expect(handoffExportSchema.safeParse(toFigmaExport(project(), undefined, images)).success).toBe(true);
    const exported = toFigmaExport(project(), undefined, images);
    const foreign = { ...exported, assets: exported.assets.map((item) => item.id === "img-cover" ? { ...item, figmaImage: { url: "https://evil.example.com/x.png", expiresAt: null, kind: "signed" } } : item) };
    expect(handoffExportSchema.safeParse(foreign).success).toBe(false);
    const copied = { ...exported, assets: exported.assets.map((item) => item.id === "real-1" ? { ...item, figmaImage: { url: `data:image/jpeg;base64,${PNG}`, expiresAt: null, kind: "inline" } } : item) };
    expect(handoffExportSchema.safeParse(copied).success).toBe(false);
    expect(handoffExportSchema.safeParse(toFigmaExport({ ...project(), plan: undefined })).success).toBe(false);
  });

  test("duplicate detection ignores new signed links and export time, but not edited copy", () => {
    const h = (value: string) => createHash("sha256").update(value).digest("hex");
    const a = handoffExportSchema.parse(toFigmaExport(project(), "2026-11-02T00:00:00.000Z", { "img-cover": { url: "https://abc.supabase.co/storage/v1/object/sign/creative-assets/u/p/a.jpg?token=1", expiresAt: "2026-11-03T00:00:00.000Z", kind: "signed" } }));
    const b = handoffExportSchema.parse(toFigmaExport(project(), "2026-11-02T05:00:00.000Z", { "img-cover": { url: "https://abc.supabase.co/storage/v1/object/sign/creative-assets/u/p/a.jpg?token=2", expiresAt: "2026-11-03T05:00:00.000Z", kind: "signed" } }));
    expect(handoffContentHash(a, h)).toBe(handoffContentHash(b, h));
    const edited = { ...project(), plan: { ...project().plan!, slides: project().plan!.slides.map((slide, index) => index === 1 ? { ...slide, headline: "직접 고친 문구" } : slide) } };
    expect(handoffContentHash(handoffExportSchema.parse(toFigmaExport(edited, "2026-11-02T00:00:00.000Z")), h)).not.toBe(handoffContentHash(a, h));
  });

  test("frames go to the right of existing work, existing nodes are untouched, Korean fonts fall back to Noto Sans KR, and relaunch is set", async () => {
    const existing = { type: "FRAME", name: "기존 작업", x: 100, y: 50, width: 800, height: 600, getPluginData: () => "" };
    const { api, page, relaunch } = fakeFigma(KOREAN, [existing]);
    const plan = plugin.buildFigmaPlan({ ...toFigmaExport(project()), handoff: { id: "h".repeat(64) } });
    const report = await plugin.renderPlan(api, plan, { "img-cover": new Uint8Array([1, 2]) }, { handoffId: "a".repeat(64), code: "AAAAAA" });
    expect(report).toMatchObject({ frames: 6, images: 1, references: 1, failedFrames: [] });
    expect(page.children[0]).toBe(existing);
    expect(existing).toMatchObject({ x: 100, y: 50, width: 800 });
    const created = page.children.slice(1);
    expect(created.every((node) => (node.x as number) >= 900)).toBe(true);
    expect(created.every((node) => String(node.name).startsWith("TR AAAAAA · "))).toBe(true);
    expect(Object.values(report.fontFallbacks).every((font) => font.startsWith("Noto Sans KR"))).toBe(true);
    expect(report.fontFallbacks["Galmuri11 Bold"]).toBe("Noto Sans KR Bold");
    expect(plugin.existingImports(api, "a".repeat(64))).toBe(8);
    expect(relaunch()).toEqual({ open: "TREND RADAR에서 보낸 작업 가져오기" });
  });

  test("one failing slide does not stop the rest, and its partial frame is removed", async () => {
    const { api, page } = fakeFigma(KOREAN);
    const original = api.createImage;
    api.createImage = () => { throw new Error("image decode failed"); };
    const plan = plugin.buildFigmaPlan(toFigmaExport(project()));
    const report = await plugin.renderPlan(api, plan, { "img-cover": new Uint8Array([1]) }, { handoffId: "b".repeat(64) });
    api.createImage = original;
    expect(report.frames).toBe(5);
    expect(report.failedFrames).toHaveLength(1);
    expect(report.failedFrames[0].name).toMatch(/^01 · cover/);
    expect(page.children).toHaveLength(7);
  });
});

test.describe("F1 API routes (real server, before any Supabase call)", () => {
  test("plugin endpoints answer CORS preflight and reject missing or malformed plugin tokens", async ({ request }) => {
    const preflight = await request.fetch("/api/figma/handoffs", { method: "OPTIONS" });
    expect(preflight.status()).toBe(204);
    expect(preflight.headers()["access-control-allow-origin"]).toBe("*");
    expect(preflight.headers()["access-control-allow-headers"]).toContain("Authorization");
    const none = await request.get("/api/figma/handoffs");
    expect(none.status()).toBe(401);
    expect((await none.json()).error).toBe("PLUGIN_AUTH_REQUIRED");
    expect(none.headers()["access-control-allow-origin"]).toBe("*");
    expect((await request.get("/api/figma/handoffs", { headers: { Authorization: "Bearer not-a-plugin-token" } })).status()).toBe(401);
    // 토큰 모양이 맞아도 ID가 형식에 맞지 않으면 DB에 묻지 않고 404.
    const bad = await request.get("/api/figma/handoffs/guess", { headers: { Authorization: `Bearer trp_${"x".repeat(43)}` } });
    expect(bad.status()).toBe(404);
  });

  test("web endpoints require a Supabase login, and pairing keys are validated", async ({ request }) => {
    const create = await request.post("/api/figma/handoffs", { data: { export: toFigmaExport(project()) } });
    expect(create.status()).toBe(401);
    expect((await create.json()).error).toBe("AUTH_REQUIRED");
    expect((await request.post("/api/figma/pair/approve", { data: { writeKey: "x".repeat(32) } })).status()).toBe(401);
    expect((await request.post("/api/figma/pair/poll", { data: { readKey: "short" } })).status()).toBe(400);
  });
});

/* ---------- 웹 Studio(로그인 흉내) ---------- */

const envUrl = (() => { try { return fs.readFileSync(".env.local", "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim() ?? null; } catch { return null; } })();
const supabaseOrigin = envUrl ? new URL(envUrl).origin : null;
const USER = "33333333-3333-4333-8333-333333333333";

async function signedInStudio(page: Page) {
  test.skip(!supabaseOrigin, "Supabase URL 설정이 없어 로그인 흉내를 낼 수 없음");
  const ref = new URL(supabaseOrigin!).hostname.split(".")[0];
  const user = { id: USER, aud: "authenticated", role: "authenticated", email: "figma-test@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" };
  const uploads: string[] = [];
  await page.route(`${supabaseOrigin}/**`, async (route: Route) => {
    const url = new URL(route.request().url()), method = route.request().method();
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
    if (url.pathname.startsWith("/storage/v1/object/sign/")) return route.fulfill({ json: { signedURL: `${url.pathname.replace("/storage/v1", "")}?token=signed-test` } });
    if (url.pathname.startsWith("/storage/v1/object/")) { uploads.push(url.pathname); return route.fulfill({ json: { Key: url.pathname, Id: "obj-1" } }); }
    if (url.pathname.startsWith("/rest/v1/")) return route.fulfill({ json: method === "GET" || method === "HEAD" ? [] : [{ id: "00000000-0000-4000-8000-000000000001", updated_at: new Date().toISOString(), created_at: new Date().toISOString() }] });
    return route.fulfill({ json: {} });
  });
  await page.goto("/");
  await page.evaluate(({ key, session, project: item }) => {
    localStorage.clear();
    localStorage.setItem("trend-radar-onboarded", "1");
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem("trend-radar-studio-projects", JSON.stringify([item]));
  }, { key: `sb-${ref}-auth-token`, session: { access_token: "test-access-token", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "test-refresh", user }, project: project() });
  return { uploads };
}

test.describe("F1·F4 Content Studio → Figma로 보내기", () => {
  test("signed in: saves the project, uploads the AI image, sends validated design data once, and shows code + Figma steps", async ({ page }) => {
    const { uploads } = await signedInStudio(page);
    const sent: unknown[] = [];
    await page.route("**/api/figma/handoffs", async (route) => {
      expect(route.request().headers().authorization).toBe("Bearer test-access-token");
      const body = route.request().postDataJSON() as { export: unknown };
      sent.push(body.export);
      return route.fulfill({ status: 201, json: { handoffId: "c".repeat(64), code: "CCCCCC", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), duplicate: sent.length > 1, images: { included: 1, signed: 1, inline: 0 } } });
    });
    const paid: string[] = [];
    page.on("request", (request) => { if (/\/api\/(analyze|dna|collision|lab|studio\/production|images|creative-collision|visual-dna)/.test(new URL(request.url()).pathname)) paid.push(request.url()); });
    await page.goto(`/studio?project=${PROJECT_ID}`);
    await expect(page.getByTestId("production-slide")).toHaveCount(6);
    await page.getByTestId("production-figma-send").click();
    await expect(page.getByTestId("figma-handoff")).toHaveAttribute("data-state", "sent");
    await expect(page.getByTestId("figma-handoff-code")).toHaveText("CCCCCC");
    await expect(page.getByTestId("figma-handoff")).toContainText("TREND RADAR Studio Import");
    await expect(page.getByTestId("figma-open")).toHaveAttribute("href", /figma\.com/);
    expect(uploads.some((path) => path.includes(`/creative-assets/${USER}/`))).toBe(true);
    expect(sent).toHaveLength(1);
    const parsed = handoffExportSchema.safeParse(sent[0]);
    expect(parsed.success).toBe(true);
    const cover = parsed.data!.assets.find((item) => item.id === "img-cover")!;
    expect(cover.figmaImage?.kind).toBe("signed");
    expect(cover.figmaImage?.url).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/sign\//);
    expect(Date.parse(cover.figmaImage!.expiresAt!) - Date.now()).toBeGreaterThan(23 * 3600_000);
    expect(parsed.data!.assets.find((item) => item.id === "real-1")!.figmaImage).toBeUndefined();
    // 기존 JSON 내보내기는 그대로 있다.
    await expect(page.getByTestId("production-figma")).toBeVisible();
    expect(paid).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test("signed out: explains that login is needed and keeps the JSON export", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((item) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-studio-projects", JSON.stringify([item])); }, project());
    let called = 0;
    await page.route("**/api/figma/handoffs", (route) => { called += 1; return route.fulfill({ status: 500, json: {} }); });
    await page.goto(`/studio?project=${PROJECT_ID}`);
    await page.getByTestId("production-figma-send").click();
    await expect(page.getByTestId("figma-handoff-error")).toContainText("로그인이 필요합니다");
    expect(called).toBe(0);
    await expect(page.getByTestId("production-figma")).toBeEnabled();
  });

  test("server errors (expired table, auth) are shown as-is", async ({ page }) => {
    await signedInStudio(page);
    await page.route("**/api/figma/handoffs", (route) => route.fulfill({ status: 503, json: { error: "HANDOFF_NOT_CONFIGURED", message: "Figma 전송 저장소가 준비되지 않았습니다. Supabase SQL Editor에서 202611020009_figma_handoffs.sql을 실행해야 합니다." } }));
    await page.goto(`/studio?project=${PROJECT_ID}`);
    await page.getByTestId("production-figma-send").click();
    await expect(page.getByTestId("figma-handoff-error")).toContainText("202611020009");
  });
});

/* ---------- 플러그인(실제 ui.html + code.js, 가짜 figma) ---------- */

const harness = (store: unknown) => `<!doctype html><html><body><iframe id="ui" src="http://plugin.test/ui.html" style="width:400px;height:600px"></iframe><script>
  var fonts = ${JSON.stringify(KOREAN)};
  var page = { children: [], selection: [], appendChild: function (n) { this.children.push(n); } };
  function make(type) {
    var item = { type: type, children: [], width: 0, height: 0, x: 0, y: 0, data: {} };
    item.resize = function (w, h) { item.width = w; item.height = type === "TEXT" ? Math.max(h, item.height) : h; };
    item.appendChild = function (c) { item.children.push(c); };
    item.setPluginData = function (k, v) { item.data[k] = v; }; item.getPluginData = function (k) { return item.data[k] || ""; };
    item.remove = function () { var i = page.children.indexOf(item); if (i >= 0) page.children.splice(i, 1); };
    if (type === "TEXT") Object.defineProperty(item, "characters", { set: function (v) { item._chars = v; item.height = Math.ceil(v.length / 30) * (item.fontSize || 16) * 1.4; }, get: function () { return item._chars; } });
    return item;
  }
  var frame = document.getElementById("ui");
  window.store = ${JSON.stringify(store)};
  window.__html__ = "";
  window.figma = {
    command: "", currentPage: page, root: { setRelaunchData: function (d) { window.relaunch = d; } }, viewport: { center: { x: 0, y: 0 }, scrollAndZoomIntoView: function () {} },
    showUI: function () {}, notify: function (m) { window.notified = m; },
    ui: { postMessage: function (m) { frame.contentWindow.postMessage({ pluginMessage: m }, "*"); }, onmessage: null },
    clientStorage: { getAsync: async function (k) { return window.store[k]; }, setAsync: async function (k, v) { window.store[k] = v; } },
    createFrame: function () { return make("FRAME"); }, createText: function () { return make("TEXT"); }, createRectangle: function () { return make("RECTANGLE"); },
    createImage: function (b) { return { hash: "hash-" + b.length }; },
    loadFontAsync: async function (f) { if (fonts.indexOf(f.family + " " + f.style) < 0) throw new Error("missing font"); }
  };
  window.addEventListener("message", function (e) { if (e.source === frame.contentWindow && e.data && e.data.pluginMessage && figma.ui.onmessage) figma.ui.onmessage(e.data.pluginMessage); });
  frame.onload = function () { var s = document.createElement("script"); s.src = "http://plugin.test/code.js"; document.body.appendChild(s); };
</script></body></html>`;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

type FakeHandoff = { id: string; code: string; title: string; expiresAt: string; payload: unknown; imports: number };
async function pluginHarness(page: Page, handoffs: FakeHandoff[], options: { connected?: boolean } = {}) {
  const state = { approved: false, imported: [] as string[], token: "trp_" + "t".repeat(43) };
  await page.context().route("http://plugin.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/harness.html") return route.fulfill({ body: harness({ "trend-radar-auth": { server: "http://api.test", ...(options.connected ? { token: state.token } : {}) } }), contentType: "text/html" });
    if (path === "/ui.html") return route.fulfill({ body: fs.readFileSync("figma-plugin/ui.html", "utf8"), contentType: "text/html" });
    if (path === "/code.js") return route.fulfill({ body: fs.readFileSync("figma-plugin/code.js", "utf8"), contentType: "text/javascript; charset=utf-8" });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.context().route("http://api.test/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const reply = (status: number, json: unknown) => route.fulfill({ status, json, headers: CORS });
    if (url.pathname === "/api/figma/pair") return reply(201, { readKey: "r".repeat(32), connectUrl: "http://api.test/figma/connect#key=" + "w".repeat(32), expiresInSec: 600 });
    if (url.pathname === "/api/figma/pair/poll") return reply(200, state.approved ? { status: "connected", token: state.token } : { status: "pending" });
    if (url.pathname === "/figma/connect") return route.fulfill({ body: "<p>connect</p>", contentType: "text/html" });
    if (request.headers().authorization !== `Bearer ${state.token}`) return reply(401, { error: "PLUGIN_AUTH_REQUIRED", message: "Figma 플러그인 연결이 필요합니다." });
    if (url.pathname === "/api/figma/handoffs") return reply(200, { handoffs: handoffs.map((item) => ({ id: item.id, projectId: PROJECT_ID, title: item.title, format: "cardnews", unitCount: 6, createdAt: new Date().toISOString(), expiresAt: item.expiresAt, importedAt: null, importCount: item.imports, expired: Date.parse(item.expiresAt) <= Date.now(), code: item.code })) });
    const match = url.pathname.match(/^\/api\/figma\/handoffs\/([0-9a-f]{64})$/);
    const item = match ? handoffs.find((h) => h.id === match[1]) : undefined;
    if (!item) return reply(404, { error: "HANDOFF_NOT_FOUND", message: "작업을 찾을 수 없습니다." });
    if (Date.parse(item.expiresAt) <= Date.now()) return reply(410, { error: "HANDOFF_EXPIRED", message: "작업이 만료됐습니다(24시간)." });
    if (method === "POST") { item.imports += 1; state.imported.push(item.id); return reply(200, { importCount: item.imports }); }
    return reply(200, { handoff: item.payload });
  });
  await page.context().route(/^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/sign\//, (route) => route.fulfill({ body: Buffer.from(PNG, "base64"), contentType: "image/png", headers: CORS }));
  await page.goto("http://plugin.test/harness.html");
  return { state, ui: page.frameLocator("#ui") };
}
const payloadFor = (id: string) => ({ ...toFigmaExport(project(), "2026-11-02T00:00:00.000Z", { "img-cover": { url: "https://abc.supabase.co/storage/v1/object/sign/creative-assets/u/p/a.jpg?token=x", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), kind: "signed" } }), handoff: { id, projectId: PROJECT_ID, userId: USER, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() } });

test.describe("F2·F3·F4 Figma plugin flow (harness, not the Figma app)", () => {
  test.skip(({ isMobile }) => isMobile, "플러그인 창은 Figma 데스크톱·웹 전용");

  test("connect once, the latest valid job is auto-selected, 6 editable frames are created, and a duplicate run is blocked", async ({ page }) => {
    const latest = "d".repeat(64), older = "e".repeat(64), expired = "f".repeat(64);
    const jobs: FakeHandoff[] = [
      { id: latest, code: "DDDDDD", title: "네 컷 사진 부스", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), payload: payloadFor(latest), imports: 0 },
      { id: older, code: "EEEEEE", title: "이전 작업", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), payload: payloadFor(older), imports: 0 },
      { id: expired, code: "FFFFFF", title: "만료 작업", expiresAt: new Date(Date.now() - 1000).toISOString(), payload: null, imports: 0 },
    ];
    const { state, ui } = await pluginHarness(page, jobs);
    await expect(ui.locator("#connect")).toBeVisible();
    const popup = page.waitForEvent("popup");
    await ui.locator("#connect").click();
    expect((await popup).url()).toContain("/figma/connect#key=");
    state.approved = true;
    await expect(ui.locator("#connected")).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => (window as unknown as { store: Record<string, { token?: string }> }).store["trend-radar-auth"].token)).toBe(state.token);
    await expect(ui.locator(".item")).toHaveCount(3);
    await expect(ui.locator(`.item[data-id="${latest}"]`)).toHaveAttribute("aria-checked", "true");
    await expect(ui.locator(`.item[data-id="${expired}"]`)).toHaveClass(/expired/);
    await ui.locator("#build-remote").click();
    await expect(ui.locator("#status")).toContainText("Figma에 편집 가능한 카드뉴스가 생성되었습니다.");
    await expect(ui.locator("#status")).toContainText("AI 이미지 1");
    await expect(ui.locator("#status")).toContainText("폰트 대체");
    const result = await page.evaluate(() => {
      const children = (window as unknown as { figma: { currentPage: { children: Array<{ name: string; type: string; children: Array<{ type: string; _chars?: string; fills?: Array<{ type: string }> }> }> } } }).figma.currentPage.children;
      return { names: children.map((node) => node.name), texts: children.flatMap((node) => node.children.filter((child) => child.type === "TEXT").map((child) => child._chars ?? "")), imageFills: children.flatMap((node) => node.children.filter((child) => child.fills?.[0]?.type === "IMAGE")).length, relaunch: (window as unknown as { relaunch: unknown }).relaunch };
    });
    expect(result.names.filter((name) => name.startsWith("TR DDDDDD · 0"))).toHaveLength(6);
    expect(result.texts).toContain(prod.response.plan.slides[1].headline);
    expect(result.imageFills).toBe(1);
    expect(result.relaunch).toBeTruthy();
    await expect.poll(() => state.imported).toEqual([latest]);
    // 같은 작업을 다시 누르면 만들지 않고 확인을 요청한다.
    await ui.locator("#build-remote").click();
    await expect(ui.locator("#status")).toContainText("중복 생성 방지");
    await expect(ui.locator("#force-build")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { figma: { currentPage: { children: unknown[] } } }).figma.currentPage.children.length)).toBe(8);
  });

  test("expired job, revoked token and unreachable server are explained", async ({ page }) => {
    const id = "a".repeat(64);
    const jobs: FakeHandoff[] = [{ id, code: "AAAAAA", title: "곧 만료", expiresAt: new Date(Date.now() + 1500).toISOString(), payload: payloadFor(id), imports: 0 }];
    const { state, ui } = await pluginHarness(page, jobs, { connected: true });
    await expect(ui.locator(`.item[data-id="${id}"]`)).toHaveAttribute("aria-checked", "true");
    await page.waitForTimeout(1600);
    await ui.locator("#build-remote").click();
    await expect(ui.locator("#status")).toContainText("작업 만료");
    state.token = "trp_" + "z".repeat(43);
    await ui.locator("#refresh").click();
    await expect(ui.locator("#status")).toContainText("인증 필요");
    await expect(ui.locator("#connect")).toBeVisible();
    await page.context().unroute("http://api.test/**");
    await page.context().route("http://api.test/**", (route) => route.abort("connectionrefused"));
    await ui.locator("#connect").click();
    await expect(ui.locator("#status")).toContainText("연결 실패");
  });

  test("the JSON file tab still works without an account", async ({ page }) => {
    const { ui } = await pluginHarness(page, []);
    await ui.locator("#tab-file").click();
    await ui.locator("#json").fill(JSON.stringify(toFigmaExport(project(), "2026-11-02T00:00:00.000Z", { "img-cover": { url: `data:image/jpeg;base64,${PNG}`, expiresAt: null, kind: "inline" } })));
    await ui.locator("#build-file").click();
    await expect(ui.locator("#status")).toContainText("Figma에 편집 가능한 카드뉴스가 생성되었습니다.");
  });
});
