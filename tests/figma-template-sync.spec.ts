import fs from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page, type Route } from "@playwright/test";
import production from "./fixtures/studio-production.json";
import { defaultSettings, type ProductionPlan, type StudioProject } from "../lib/content-production";
import { slideTemplateContent, toFigmaExport } from "../lib/figma-export";
import { fnv64, pngInfo, previewKeyFor, templateStatus, templateSyncRequestSchema, type SyncedTemplate } from "../lib/figma-templates";

/*
 * MY TEMPLATES PREVIEW & SYNC (P10~P16).
 * - 규칙: 상태(SYNCED·UPDATE AVAILABLE·MISSING·FAILED), 미리보기 키, PNG 검사, 플러그인 요청 스키마.
 * - 서버: 실제 Next API 라우트의 인증·CORS·입력 검사(Supabase에 닿기 전 단계). DB 함수·RLS는 PGlite로 따로 확인했다(보고서 참고).
 * - 웹: Content Studio(로그인·템플릿 API는 브라우저에서 가짜 응답). 실제 Figma 앱·실제 Supabase 계정이 아니다. 유료 API 호출 없음.
 */
const prod = production as unknown as { response: { plan: ProductionPlan } };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const PROJECT_ID = "studio-my-templates";
const project = (extra: Partial<StudioProject> = {}): StudioProject => ({
  id: PROJECT_ID, mode: "single", title: "네 컷 사진 부스", source: { trendKeys: ["t"], trendNames: ["헤이세이 레트로"] },
  settings: { ...defaultSettings("cardnews"), slideCount: 6 }, plan: { ...prod.response.plan, slides: prod.response.plan.slides.map((slide) => ({ ...slide, image_ref: "" })) },
  assets: [], edited: false, createdAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z", designSource: "templates", ...extra,
} as StudioProject);
const NOW = "2026-11-04T09:00:00.000Z";
const template = (templateId: string, extra: Partial<SyncedTemplate> = {}): SyncedTemplate => ({
  templateId, type: templateId.split("_")[1] as SyncedTemplate["type"], name: templateId, width: 1080, height: 1350, fileKey: null, fileName: "My Templates", nodeId: "1:2",
  placeholders: { slots: ["TITLE", "BODY", "IMAGE_MAIN"], imageSlots: templateId === "TEMPLATE_BODY_03" ? 2 : 1, background: templateId === "TEMPLATE_COVER_02" ? "BG_IMAGE" : null, summary: "", warnings: [] },
  version: 2, status: "SYNCED", error: null, syncedAt: NOW, checkedAt: NOW, changeDetectedAt: null, hasThumbnail: true, ...extra,
});
const LIBRARY: SyncedTemplate[] = [
  template("TEMPLATE_BODY_01"), template("TEMPLATE_BODY_02", { changeDetectedAt: "2026-11-04T10:00:00.000Z" }), template("TEMPLATE_BODY_03"),
  template("TEMPLATE_COVER_01"), template("TEMPLATE_COVER_02"), template("TEMPLATE_COVER_03", { status: "MISSING" }),
  template("TEMPLATE_CTA_01"), template("TEMPLATE_CTA_02", { status: "FAILED", error: "export failed" }),
];

test.describe("P11·P15 rules (no browser)", () => {
  test("status: SYNCED unless the plugin actually detected a change; missing and failed are shown as such", () => {
    expect(templateStatus({ status: "SYNCED", syncedAt: NOW, changeDetectedAt: null })).toBe("SYNCED");
    expect(templateStatus({ status: "SYNCED", syncedAt: NOW, changeDetectedAt: "2026-11-04T10:00:00.000Z" })).toBe("UPDATE AVAILABLE");
    expect(templateStatus({ status: "SYNCED", syncedAt: "2026-11-04T11:00:00.000Z", changeDetectedAt: "2026-11-04T10:00:00.000Z" })).toBe("SYNCED"); // 다시 동기화함
    expect(templateStatus({ status: "MISSING", syncedAt: NOW, changeDetectedAt: null })).toBe("MISSING TEMPLATE");
    expect(templateStatus({ status: "FAILED", syncedAt: NOW, changeDetectedAt: null })).toBe("SYNC FAILED");
  });

  test("preview key changes with content, template choice and template version; the plugin computes the same hash", () => {
    const base = { fields: { TITLE: "a", BODY: "b" }, imageList: [{ assetId: "img-1", role: "main" }] };
    const key = previewKeyFor(base, "TEMPLATE_BODY_01", 2);
    expect(previewKeyFor(base, "TEMPLATE_BODY_01", 2)).toBe(key);
    expect(previewKeyFor({ ...base, fields: { TITLE: "a2", BODY: "b" } }, "TEMPLATE_BODY_01", 2)).not.toBe(key);
    expect(previewKeyFor(base, "TEMPLATE_BODY_02", 2)).not.toBe(key);
    expect(previewKeyFor(base, "TEMPLATE_BODY_01", 3)).not.toBe(key);
    const pluginCode = createRequire(__filename)("../figma-plugin/code.js") as { fnv64: (text: string) => string };
    expect(pluginCode.fnv64("TREND RADAR 템플릿")).toBe(fnv64("TREND RADAR 템플릿"));
  });

  test("only real PNGs within limits are accepted; plugin requests are validated", () => {
    expect(pngInfo(PNG)).toMatchObject({ width: 1, height: 1 });
    expect(pngInfo(Buffer.from("GIF89a-not-a-png-but-long-enough-to-check").toString("base64"))).toBeNull();
    expect(pngInfo("not base64 !!")).toBeNull();
    const sync = { action: "sync", template: { templateId: "TEMPLATE_BODY_01", name: "TEMPLATE_BODY_01", width: 1080, height: 1350, fileKey: null, fileName: "f", nodeId: "1:2", placeholders: { slots: ["TITLE"], imageSlots: 1, background: null, summary: "", warnings: [] }, designHash: "0123456789abcdef", thumbnail: PNG } };
    expect(templateSyncRequestSchema.safeParse(sync).success).toBe(true);
    expect(templateSyncRequestSchema.safeParse({ ...sync, template: { ...sync.template, templateId: "../etc" } }).success).toBe(false);
    expect(templateSyncRequestSchema.safeParse({ action: "drop-table" }).success).toBe(false);
  });

  test("P14: the Figma export carries the chosen template and design source per slide (the website stores choices, not template designs)", () => {
    const item = project({ templateAssignments: { [prod.response.plan.slides[0].slide_id]: "TEMPLATE_COVER_02", [prod.response.plan.slides[1].slide_id]: "../bad" } });
    const exported = toFigmaExport(item, NOW, {}, { templateVersions: { TEMPLATE_COVER_02: 2 } }) as unknown as { project: { designSource: string }; slides: Array<{ template: { templateId: string | null; previewKey: string } }> };
    expect(exported.project.designSource).toBe("templates");
    expect(exported.slides[0].template.templateId).toBe("TEMPLATE_COVER_02");
    expect(exported.slides[1].template.templateId).toBeNull(); // 형식이 틀린 값은 보내지 않음
    expect(exported.slides[0].template.previewKey).toBe(slideTemplateContent(item, item.plan!.slides[0], 0, 6, { TEMPLATE_COVER_02: 2 }).previewKey);
    // AUTO DESIGN 프로젝트는 그대로
    expect((toFigmaExport(project({ designSource: undefined }), NOW) as unknown as { project: { designSource: string } }).project.designSource).toBe("auto");
  });
});

test.describe("P10·P11 API routes (real server, before any Supabase call)", () => {
  test("plugin sync requires a plugin token and validated data; web reads, images and deletes require a login", async ({ request }) => {
    const preflight = await request.fetch("/api/figma/templates", { method: "OPTIONS" });
    expect(preflight.status()).toBe(204);
    expect(preflight.headers()["access-control-allow-origin"]).toBe("*");
    const none = await request.post("/api/figma/templates", { data: { action: "finish", present: [] } });
    expect(none.status()).toBe(401);
    expect((await none.json()).error).toBe("PLUGIN_AUTH_REQUIRED");
    const token = { Authorization: `Bearer trp_${"x".repeat(43)}` };
    const bad = await request.post("/api/figma/templates", { headers: token, data: { action: "sync", template: { templateId: "TEMPLATE_X" } } });
    expect(bad.status()).toBe(400);
    expect(bad.headers()["access-control-allow-origin"]).toBe("*");
    expect((await request.get("/api/figma/templates")).status()).toBe(401);
    expect((await request.get("/api/figma/templates/image?template=TEMPLATE_BODY_01")).status()).toBe(401);
    expect((await request.delete("/api/figma/templates")).status()).toBe(401);
  });
});

/* ---------- Content Studio(로그인 흉내) ---------- */
const envUrl = (() => { try { return fs.readFileSync(".env.local", "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim() ?? null; } catch { return null; } })();
const supabaseOrigin = envUrl ? new URL(envUrl).origin : null;
const USER = "44444444-4444-4444-8444-444444444444";

async function signedIn(page: Page, item: StudioProject) {
  test.skip(!supabaseOrigin, "Supabase URL 설정이 없어 로그인 흉내를 낼 수 없음");
  const ref = new URL(supabaseOrigin!).hostname.split(".")[0];
  const user = { id: USER, aud: "authenticated", role: "authenticated", email: "tpl@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" };
  const saved: string[] = [];
  await page.route(`${supabaseOrigin}/**`, async (route: Route) => {
    const url = new URL(route.request().url()), method = route.request().method();
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
    if (url.pathname.startsWith("/storage/v1/")) return route.fulfill({ json: { Key: url.pathname } });
    if (url.pathname.startsWith("/rest/v1/")) { if (method !== "GET" && method !== "HEAD") saved.push(route.request().postData() ?? ""); return route.fulfill({ json: method === "GET" || method === "HEAD" ? [] : [{ id: "00000000-0000-4000-8000-000000000001", updated_at: new Date().toISOString(), created_at: new Date().toISOString() }] }); }
    return route.fulfill({ json: {} });
  });
  await page.goto("/");
  await page.evaluate(({ key, session, project: value }) => {
    localStorage.clear();
    localStorage.setItem("trend-radar-onboarded", "1");
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem("trend-radar-studio-projects", JSON.stringify([value]));
  }, { key: `sb-${ref}-auth-token`, session: { access_token: "test-access-token", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "test-refresh", user }, project: item });
  return { saved };
}

/** 템플릿 API(가짜): 썸네일·렌더링 PNG는 로그인 토큰이 있어야 준다. */
async function templateApi(page: Page, previews: Array<{ slideId: string; templateId: string; previewKey: string }>) {
  const calls = { list: 0, images: [] as string[] };
  await page.route("**/api/figma/templates?**", async (route) => {
    expect(route.request().headers().authorization).toBe("Bearer test-access-token");
    calls.list += 1;
    return route.fulfill({ json: { templates: LIBRARY, previews: previews.map((item) => ({ ...item, templateVersion: 2, width: 480, height: 600, renderedAt: NOW })) } });
  });
  await page.route("**/api/figma/templates/image?**", async (route) => {
    if (route.request().headers().authorization !== "Bearer test-access-token") return route.fulfill({ status: 401, json: { error: "AUTH_REQUIRED" } });
    calls.images.push(new URL(route.request().url()).search);
    return route.fulfill({ body: Buffer.from(PNG, "base64"), contentType: "image/png" });
  });
  return calls;
}

test.describe("P12·P13·P14 Content Studio MY TEMPLATES", () => {
  test("gallery shows synced thumbnails with type, image slots, sync time and honest status; slides keep their chosen template through reload and Figma send", async ({ page }) => {
    const item = project();
    const slides = item.plan!.slides;
    // 2번 슬라이드: 지금 내용(AUTO)과 같은 키 → 최신 렌더링. 3번: 예전 키 → 이전 렌더링.
    const freshKey = slideTemplateContent(item, slides[1], 1, slides.length, {}).previewKey;
    const { saved } = await signedIn(page, item);
    const calls = await templateApi(page, [{ slideId: slides[1].slide_id, templateId: "TEMPLATE_BODY_01", previewKey: freshKey }, { slideId: slides[2].slide_id, templateId: "TEMPLATE_BODY_02", previewKey: "old-key" }]);
    const sent: Array<{ export: { project: { designSource: string }; slides: Array<{ id: string; template: { templateId: string | null } }> } }> = [];
    await page.route("**/api/figma/handoffs", async (route) => { sent.push(route.request().postDataJSON()); return route.fulfill({ status: 201, json: { handoffId: "d".repeat(64), code: "DDDDDD", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), duplicate: false, images: { included: 0, signed: 0, inline: 0 } } }); });
    const paid: string[] = [];
    page.on("request", (request) => { if (/\/api\/(analyze|dna|collision|lab|studio\/production|images|creative-collision|visual-dna)/.test(new URL(request.url()).pathname)) paid.push(request.url()); });

    await page.goto(`/studio?project=${PROJECT_ID}`);
    await expect(page.getByTestId("design-source-templates")).toBeChecked();
    const cards = page.getByTestId("template-card");
    await expect(cards).toHaveCount(8);
    await expect(page.getByTestId("template-thumb").first()).toBeVisible();
    await expect(page.locator('[data-template-id="TEMPLATE_BODY_02"]')).toHaveAttribute("data-status", "UPDATE AVAILABLE");
    await expect(page.locator('[data-template-id="TEMPLATE_COVER_03"]')).toHaveAttribute("data-status", "MISSING TEMPLATE");
    await expect(page.locator('[data-template-id="TEMPLATE_CTA_02"]')).toHaveAttribute("data-status", "SYNC FAILED");
    await expect(page.locator('[data-template-id="TEMPLATE_BODY_01"]')).toHaveAttribute("data-status", "SYNCED");
    await expect(page.locator('[data-template-id="TEMPLATE_BODY_03"]')).toContainText("이미지 슬롯 2");
    await expect(page.locator('[data-template-id="TEMPLATE_COVER_02"]')).toContainText("이미지 슬롯 1 + 배경");
    await expect(page.locator('[data-template-id="TEMPLATE_BODY_01"]')).toContainText("BODY · 본문");
    await expect(page.locator('[data-template-id="TEMPLATE_BODY_01"]')).toContainText("동기화");

    // TEMPLATE PREVIEW와 RENDERED CONTENT PREVIEW를 나눠 보여 준다.
    const rows = page.getByTestId("template-slide");
    await expect(rows).toHaveCount(6);
    await expect(rows.nth(1).getByTestId("rendered-preview")).toHaveAttribute("data-fresh", "true");
    await expect(rows.nth(2).getByTestId("rendered-preview")).toHaveAttribute("data-fresh", "false");
    await expect(rows.nth(2).getByTestId("rendered-preview")).toContainText("최신 렌더링이 필요합니다");
    await expect(rows.nth(0).getByTestId("rendered-preview")).toHaveAttribute("data-fresh", "none");
    await expect(rows.nth(0).getByTestId("rendered-preview")).toContainText("아직 Figma 렌더링이 없습니다");

    // 슬라이드별 선택 → 템플릿 썸네일, 2번은 템플릿을 바꾸면 렌더링이 "이전"이 된다.
    await rows.nth(0).getByTestId("template-select").selectOption("TEMPLATE_COVER_02");
    await expect(rows.nth(0).getByTestId("template-preview").getByRole("img")).toBeVisible();
    await rows.nth(1).getByTestId("template-select").selectOption("TEMPLATE_BODY_03");
    await expect(rows.nth(1).getByTestId("rendered-preview")).toHaveAttribute("data-fresh", "false");
    await rows.nth(1).getByTestId("template-select").selectOption("AUTO");
    await expect(rows.nth(1).getByTestId("rendered-preview")).toHaveAttribute("data-fresh", "true");
    await rows.nth(2).getByTestId("template-select").selectOption("TEMPLATE_BODY_02");
    await expect(rows.nth(2).getByTestId("template-preview")).toContainText("UPDATE AVAILABLE");

    // 이 브라우저 저장 → 새로고침 후 복원
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]")[0]?.templateAssignments)).toEqual({ [slides[0].slide_id]: "TEMPLATE_COVER_02", [slides[2].slide_id]: "TEMPLATE_BODY_02" });
    await page.reload();
    await expect(page.getByTestId("template-slide").nth(0).getByTestId("template-select")).toHaveValue("TEMPLATE_COVER_02");
    await expect(page.getByTestId("template-slide").nth(1).getByTestId("template-select")).toHaveValue("AUTO");
    expect(calls.list).toBeGreaterThanOrEqual(2);
    expect(calls.images.some((query) => query.includes("template=TEMPLATE_COVER_02"))).toBe(true);
    expect(calls.images.some((query) => query.includes(`project=${PROJECT_ID}`))).toBe(true);

    // Figma로 보내기: 계정 저장(다른 브라우저 복원용)과 Figma 데이터에 선택이 담긴다.
    await page.getByTestId("production-figma-send").click();
    await expect(page.getByTestId("figma-handoff")).toHaveAttribute("data-state", "sent");
    expect(saved.some((body) => body.includes("templateAssignments") && body.includes("TEMPLATE_COVER_02"))).toBe(true);
    expect(sent[0].export.project.designSource).toBe("templates");
    expect(sent[0].export.slides.map((slide) => slide.template.templateId)).toEqual(["TEMPLATE_COVER_02", null, "TEMPLATE_BODY_02", null, null, null]);
    expect(paid).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test("AUTO DESIGN stays the default and keeps its HTML preview; switching source does not call the template API until MY TEMPLATES is chosen", async ({ page }) => {
    await signedIn(page, project({ designSource: undefined }));
    const calls = await templateApi(page, []);
    await page.goto(`/studio?project=${PROJECT_ID}`);
    await expect(page.getByTestId("design-source-auto")).toBeChecked();
    await expect(page.getByTestId("design-style")).toBeVisible();
    await expect(page.locator(".design-box").first()).toContainText("DESIGN PREVIEW");
    expect(calls.list).toBe(0);
    await page.getByTestId("design-source-templates").check();
    await expect(page.getByTestId("template-card")).toHaveCount(8);
    await expect(page.getByTestId("my-templates-preview")).toBeVisible();
    await page.getByTestId("design-source-auto").check();
    await expect(page.getByTestId("design-style")).toBeVisible();
  });

  test("signed out or storage not set up: the gallery explains what to do instead of showing nothing", async ({ page }) => {
    await signedIn(page, project());
    await page.route("**/api/figma/templates?**", (route) => route.fulfill({ status: 503, json: { error: "TEMPLATES_NOT_CONFIGURED", message: "템플릿 저장소가 준비되지 않았습니다. Supabase SQL Editor에서 202611040010_figma_templates.sql을 실행해야 합니다." } }));
    await page.goto(`/studio?project=${PROJECT_ID}`);
    await expect(page.getByTestId("template-error")).toContainText("202611040010_figma_templates.sql");
    await page.unroute("**/api/figma/templates?**");
    await page.route("**/api/figma/templates?**", (route) => route.fulfill({ json: { templates: [], previews: [] } }));
    await page.getByTestId("template-refresh").click();
    await expect(page.getByTestId("template-empty")).toContainText("SYNC MY TEMPLATES");
  });
});

test.describe("Content Studio extra images (slide.images for IMAGE_2~4 · BG_IMAGE)", () => {
  test("extra images are chosen per slide, one can be the background, and they are drawn only when the picker is open", async ({ page }) => {
    const asset = (id: string) => ({ id, status: "AI PRODUCTION ASSET" as const, title: id, createdAt: NOW, rights: "test", model: "m", dataUrl: `data:image/png;base64,${PNG}` });
    const base = project({ designSource: undefined, assets: [asset("img-a"), asset("img-b"), asset("img-c")] });
    const slides = base.plan!.slides.map((slide, index) => index === 0 ? { ...slide, image_ref: "img-a", image: { assetId: "img-a", status: "ready" as const, source: "ai" as const } } : slide);
    await signedIn(page, { ...base, plan: { ...base.plan!, slides } });
    await page.goto(`/studio?project=${PROJECT_ID}`);
    const first = page.getByTestId("production-slide").first();
    await expect(first.getByTestId("extra-image-toggle")).toHaveCount(0); // 닫혀 있으면 그리지 않음
    await first.getByTestId("slide-extra-images").locator("summary").click();
    await expect(first.getByTestId("extra-image-toggle")).toHaveCount(2); // 대표 이미지(img-a)는 빼고
    await first.locator('[data-testid="extra-image-toggle"][data-asset-id="img-b"]').click();
    await first.locator('[data-testid="extra-image-toggle"][data-asset-id="img-c"]').click();
    await first.getByTestId("extra-image-background").nth(1).check();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]")[0]?.plan?.slides?.[0]?.images)).toEqual([{ assetId: "img-b", role: "detail" }, { assetId: "img-c", role: "background" }]);
    await expect(first.getByTestId("slide-extra-images").locator("summary")).toContainText("(2)");
  });
});

test.describe("Figma로 보내기 when browser storage is full", () => {
  test("sends the plan on screen, not an older copy left in localStorage", async ({ page }) => {
    const item = project({ designSource: undefined });
    await signedIn(page, item);
    const sent: Array<{ export: { slides: unknown[] } }> = [];
    await page.route("**/api/figma/handoffs", async (route) => { sent.push(route.request().postDataJSON()); return route.fulfill({ status: 201, json: { handoffId: "e".repeat(64), code: "EEEEEE", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), duplicate: false, images: { included: 0, signed: 0, inline: 0 } } }); });
    await page.goto(`/studio?project=${PROJECT_ID}`);
    await expect(page.getByTestId("production-slide")).toHaveCount(6);
    // 기획 생성 전의 예전 사본만 남고, 이후 저장은 모두 실패(저장 공간 가득)하는 상황
    await page.evaluate((stale) => {
      localStorage.setItem("trend-radar-studio-projects", JSON.stringify([stale]));
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) { if (/studio-projects|saved/.test(key)) throw new DOMException("QuotaExceededError", "QuotaExceededError"); return original.call(this, key, value); };
    }, { ...item, plan: undefined });
    await page.getByTestId("production-figma-send").click();
    await expect(page.getByTestId("figma-handoff")).toHaveAttribute("data-state", "sent");
    expect(sent[0].export.slides).toHaveLength(6);
  });
});

test.describe("rendered previews arrive after the page was opened", () => {
  test("coming back from Figma (window focus) or pressing 미리보기 새로고침 shows the new Figma render", async ({ page }) => {
    const item = project();
    const slides = item.plan!.slides;
    await signedIn(page, item);
    let previews: Array<{ slideId: string; templateId: string; previewKey: string }> = [];
    await page.route("**/api/figma/templates?**", (route) => route.fulfill({ json: { templates: LIBRARY, previews: previews.map((entry) => ({ ...entry, templateVersion: 2, width: 480, height: 600, renderedAt: NOW })) } }));
    await page.route("**/api/figma/templates/image?**", (route) => route.fulfill({ body: Buffer.from(PNG, "base64"), contentType: "image/png" }));
    await page.goto(`/studio?project=${PROJECT_ID}`);
    const first = page.getByTestId("template-slide").first().getByTestId("rendered-preview");
    await expect(first).toHaveAttribute("data-fresh", "none");
    // 플러그인이 렌더링을 올린 뒤(서버 목록이 바뀜) 브라우저로 돌아온다.
    previews = [{ slideId: slides[0].slide_id, templateId: "TEMPLATE_COVER_01", previewKey: slideTemplateContent(item, slides[0], 0, slides.length, {}).previewKey }];
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(first).toHaveAttribute("data-fresh", "true");
    await expect(first.getByTestId("rendered-image")).toBeVisible();
    previews = [];
    await page.getByTestId("template-preview-refresh").click();
    await expect(first).toHaveAttribute("data-fresh", "none");
  });
});

test.describe("stacking generated images on one slide (IMAGE_MAIN + IMAGE_2 templates)", () => {
  test("with 추가 이미지로 쌓기, each generation is added as IMAGE_2, IMAGE_3 … and the main image stays; the generator stays open; Figma export carries them", async ({ page }) => {
    const asset = (id: string) => ({ id, status: "AI PRODUCTION ASSET" as const, title: id, createdAt: NOW, rights: "test", model: "m", dataUrl: `data:image/png;base64,${PNG}` });
    const base = project({ designSource: undefined, assets: [asset("img-main")] });
    const slides = base.plan!.slides.map((slide, index) => index === 0 ? { ...slide, image_ref: "img-main", image: { assetId: "img-main", status: "ready" as const, source: "ai" as const } } : slide);
    const item = { ...base, plan: { ...base.plan!, slides } };
    await page.goto("/");
    await page.evaluate((value) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-studio-projects", JSON.stringify([value])); }, item);
    let count = 0;
    // 이미지 생성 API는 가짜 응답(유료 호출 없음).
    await page.route("**/api/images", async (route) => { count += 1; return route.fulfill({ json: { status: "AI PRODUCTION ASSET", cached: false, createdAt: `2026-11-04T00:00:0${count}.000Z`, base64: PNG, model: "test-image", prompt: (route.request().postDataJSON() as { prompt: string }).prompt, size: "1024x1280" } }); });
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto(`/studio?project=${PROJECT_ID}`);
    const first = page.getByTestId("production-slide").first();
    await first.getByTestId("slot-generate").click();
    await first.getByTestId("slot-stack").check();
    await first.getByTestId("slot-image-run").click();
    await expect(first.getByTestId("slide-extra-strip").locator("li")).toHaveCount(1);
    await first.getByTestId("slot-image-run").click(); // 창이 열려 있어 바로 한 번 더
    await expect(first.getByTestId("slide-extra-strip").locator("li")).toHaveCount(2);
    await expect(first.getByTestId("slide-extra-strip").locator("li").nth(0)).toHaveAttribute("data-slot", "추가 1");
    await expect(first.getByTestId("slide-extra-strip").locator("li").nth(1)).toHaveAttribute("data-slot", "추가 2");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]")[0]);
    expect(saved.plan.slides[0].image.assetId).toBe("img-main"); // 대표 이미지는 그대로
    expect(saved.plan.slides[0].images).toHaveLength(2);
    expect(saved.plan.slides[0].images.every((entry: { role: string }) => entry.role === "detail")).toBe(true);
    expect(saved.assets).toHaveLength(3);
    const exported = toFigmaExport(saved, NOW) as unknown as { slides: Array<{ template: { images: Record<string, string | null> } }> };
    expect(exported.slides[0].template.images).toMatchObject({ IMAGE_MAIN: "img-main", IMAGE_1: saved.plan.slides[0].images[0].assetId, IMAGE_2: saved.plan.slides[0].images[1].assetId });
    // 하나 빼기
    await first.getByTestId("extra-remove").first().click();
    await expect(first.getByTestId("slide-extra-strip").locator("li")).toHaveCount(1);
    await expect(first.getByTestId("slide-extra-strip").locator("li").first()).toHaveAttribute("data-slot", "추가 1");
    // 쌓기를 끄면 기존처럼 대표 이미지를 바꾼다.
    await first.getByTestId("slot-stack").uncheck();
    await first.getByTestId("slot-image-run").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]")[0].plan.slides[0].image.assetId)).not.toBe("img-main");
  });
});
