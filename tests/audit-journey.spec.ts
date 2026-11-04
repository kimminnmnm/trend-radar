import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import discovery from "./fixtures/discovery-t1-t3.json";
import whyRuns from "./fixtures/why-phenomenon-t5.json";
import lockRun from "./fixtures/context-lock-t6.json";
import { phenomenonFromQuery, type DiscoverySignal, type PhenomenonContext } from "../lib/discovery";
import type { EditorialContextLock } from "../lib/editorial-lock";
import { defaultSettings, emptySlideImage, withSlideImage, type ProductionPlan, type StudioProject } from "../lib/content-production";
import { buildTrendWebGraph } from "../lib/trend-web";

/*
 * INTEGRATION AUDIT — 실제 사용자 여정(외부 API 없음, 저장된 실측 응답):
 * 메이크업 검색 → WHAT'S HAPPENING NOW? → TREND WEB → 세부 현상 → WHY → Content Studio → 슬라이드 이미지 → Figma JSON.
 * 단계마다 현상 ID·행동·근거가 이어지는지 본다. WHY 모의 응답은 실제 서버처럼 요청받은 맥락을 그대로 리포트에 담아 돌려준다.
 */
const makeup = discovery.makeup as unknown as { keyword: string; signals: DiscoverySignal[] };
const A = (whyRuns as unknown as Record<string, { response: Record<string, unknown> & { report: Record<string, unknown> & { phenomenon: Record<string, unknown> } } }>).A;
const t6 = lockRun as unknown as { after: { angles: unknown; production: { plan: { slides: Array<{ slide_id: string }> } } & Record<string, unknown> } };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function mockAll(page: Page) {
  const calls = { discover: 0, analyze: [] as Array<Record<string, unknown>>, angles: [] as Array<Record<string, unknown>>, production: [] as Array<Record<string, unknown>>, images: [] as Array<{ route: Route; body: Record<string, unknown> }> };
  await page.route("**/api/discover/phenomena", async (route) => { calls.discover += 1; await route.fulfill({ json: discovery.makeup }); });
  await page.route("**/api/analyze", async (route) => {
    const body = route.request().postDataJSON() as { phenomenon?: PhenomenonContext };
    calls.analyze.push(body);
    await route.fulfill({ json: { ...A.response, report: { ...A.response.report, trend: body.phenomenon?.title, phenomenon: { ...A.response.report.phenomenon, context: body.phenomenon } } } });
  });
  await page.route("**/api/studio/angles", async (route) => { calls.angles.push(route.request().postDataJSON()); await route.fulfill({ json: t6.after.angles }); });
  await page.route("**/api/studio/production", async (route) => { calls.production.push(route.request().postDataJSON()); await route.fulfill({ json: t6.after.production }); });
  await page.route("**/api/images", async (route) => { calls.images.push({ route, body: route.request().postDataJSON() }); });
  page.on("dialog", (dialog) => void dialog.accept());
  return calls;
}

test.describe("AUDIT journey: 메이크업 → … → Figma", () => {
  test("the selected phenomenon's id, behavior and evidence survive every step", async ({ page }) => {
    test.setTimeout(120_000);
    const calls = await mockAll(page);
    await page.goto("/");
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); });
    await page.reload();

    // 1. 검색 → 세부 현상
    const hn = page.getByTestId("happening-now");
    await hn.getByLabel("Discovery keyword").fill("메이크업");
    await hn.getByTestId("hn-discover").click();
    await expect(hn.getByTestId("hn-signal")).toHaveCount(makeup.signals.length);

    // 2. TREND WEB이 같은 저장 결과로 바로 생긴다(추가 호출 없음)
    const web = page.getByTestId("trend-web");
    await expect(web.getByTestId("trend-web-canvas")).toBeVisible();
    const target = makeup.signals[0];
    await web.getByTestId("trend-web-node-picker").getByRole("button", { name: new RegExp(target.title) }).first().click();
    const detail = web.getByTestId("trend-web-detail");
    await expect(detail).toContainText(target.title);
    const whyHref = await detail.getByRole("link", { name: "EXPLORE WHY" }).getAttribute("href");
    const fromWeb = phenomenonFromQuery(new URLSearchParams(whyHref!.split("?")[1]))!;
    const hnHref = await hn.getByTestId("hn-signal").first().getByRole("link", { name: "EXPLORE WHY" }).getAttribute("href");
    const fromList = phenomenonFromQuery(new URLSearchParams(hnHref!.split("?")[1]))!;
    // TREND WEB과 목록이 같은 현상에 같은 맥락을 넘긴다.
    expect(fromWeb).toEqual(fromList);
    expect(fromWeb).toMatchObject({ title: target.title, coreBehavior: target.audienceBehavior, evidenceIds: target.evidenceIds, keyword: "메이크업" });
    expect(calls.discover).toBe(1);

    // 3. WHY: 요청에 맥락 전체 + 발견 근거
    await detail.getByRole("link", { name: "EXPLORE WHY" }).click();
    await expect(page.getByTestId("why-phenomenon").locator("h3")).toHaveText(target.title);
    await page.getByRole("button", { name: /Run live analysis/ }).click();
    await expect(page.getByTestId("why-who")).toBeVisible();
    expect(calls.analyze[0].phenomenon).toEqual(fromWeb);
    expect((calls.analyze[0].phenomenonEvidence as Array<{ id: string }>).map((item) => item.id)).toEqual(target.evidenceIds);

    // 4. Content Studio: 같은 현상으로 잠긴 프로젝트
    await page.getByTestId("why-to-studio").click();
    await expect(page.getByTestId("studio-tab-production")).toHaveAttribute("aria-pressed", "true");
    const lockPanel = page.getByTestId("context-lock");
    await expect(lockPanel.getByTestId("lock-phenomenon")).toContainText(target.title);
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]")[0] as StudioProject);
    expect(project.phenomenon?.phenomenonId).toBe(fromWeb.phenomenonId);
    expect(project.contextLock).toMatchObject({ selectedPhenomenonId: fromWeb.phenomenonId, coreBehavior: target.audienceBehavior });
    expect(project.contextLock!.observedEvidenceIds.length).toBeGreaterThan(0);

    // 5. 방향 제안·제작 요청에 잠금이 실린다
    await page.getByTestId("angles-generate").click();
    await page.getByTestId("angle-card").first().click();
    await page.getByTestId("production-generate").click();
    await expect(page.getByTestId("production-slide")).toHaveCount(t6.after.production.plan.slides.length);
    for (const body of [calls.angles[0], calls.production[0]]) expect((body.contextLock as EditorialContextLock).selectedPhenomenonId).toBe(fromWeb.phenomenonId);

    // 6. 슬라이드 이미지: 두 슬라이드에 각자 이미지, brief는 같은 현상 행동
    for (const index of [0, 2]) {
      const slide = page.getByTestId("production-slide").nth(index);
      await slide.getByTestId("slot-generate").click();
      await slide.getByTestId("slot-image-run").click();
    }
    await expect.poll(() => calls.images.length).toBe(2);
    for (const call of calls.images) expect((call.body.brief as { action: string }).action).toBe(target.audienceBehavior);
    for (const [index, call] of calls.images.entries()) await call.route.fulfill({ json: { status: "AI PRODUCTION ASSET", cached: false, createdAt: `2026-11-03T00:00:0${index}.000Z`, base64: PNG, model: "test", prompt: String(call.body.prompt), size: "1024x1280" } });
    await expect(page.getByTestId("production-slide").nth(0).locator('[data-status="AI PRODUCTION ASSET"]').first()).toBeVisible();
    await expect(page.getByTestId("production-slide").nth(2).locator('[data-status="AI PRODUCTION ASSET"]').first()).toBeVisible();

    // 7. Figma JSON: 슬라이드별 이미지 + 잠금 메모
    const download = page.waitForEvent("download");
    await page.getByTestId("production-figma").click();
    const exported = JSON.parse(fs.readFileSync((await (await download).path())!, "utf8")) as { slides: Array<{ elements: Array<{ type: string; assetId?: string }> }>; editorNotes: { contextLock: string[] } };
    const ids = exported.slides.map((slide) => slide.elements.find((element) => element.type === "IMAGE")?.assetId ?? "");
    expect(ids[0]).toBeTruthy(); expect(ids[2]).toBeTruthy(); expect(ids[0]).not.toBe(ids[2]);
    expect(ids.filter(Boolean)).toHaveLength(2);
    expect(exported.editorNotes.contextLock[0]).toContain(target.title);
    // Figma Direct Export 버튼은 로그인 없이 누르면 이유를 알려 준다(조용히 실패하지 않음).
    await expect(page.getByTestId("production-figma-send")).toBeVisible();
  });
});

const conn = discovery.connections as unknown as { connections: Array<{ title: string; type: string; direction: string }> };
const makeupReport = { ...(discovery.makeup as object), id: "disc-audit-makeup", generatedAt: "2026-11-02T00:00:00.000Z", limitations: [], excluded: [] } as unknown as Parameters<typeof buildTrendWebGraph>[0];
const nodes = buildTrendWebGraph(makeupReport).nodes.slice(0, 2).map((node) => node.keyword);

async function pickTwo(page: Page, snapshots: unknown[] = []) {
  await page.addInitScript(({ report, snaps }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.clear();
    localStorage.setItem("trend-radar-onboarded", "1");
    localStorage.setItem("trend-radar-discoveries", JSON.stringify([report]));
    localStorage.setItem("trend-radar-live-analyses", JSON.stringify(snaps));
  }, { report: makeupReport, snaps: snapshots });
  await page.route("**/api/discover/connections", (route) => route.fulfill({ json: discovery.connections }));
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  const web = page.getByTestId("trend-web");
  await web.getByRole("radio", { name: "SELECT TWO MODE" }).click();
  const buttons = web.getByTestId("trend-web-node-picker").getByRole("button");
  await buttons.nth(0).click();
  await buttons.nth(1).click();
  await web.getByRole("button", { name: /ANALYZE CONNECTION/ }).click();
  await expect(web.getByTestId("hn-connections")).toBeVisible();
  return web;
}

test.describe("AUDIT: TREND WEB two nodes → relation → Studio / Creative Collision", () => {
  test("the create button names the evidence level; without WHY the collision is locked with links to analyze each keyword", async ({ page }) => {
    const web = await pickTwo(page);
    const cards = web.getByTestId("hn-connection");
    const labels: Record<string, RegExp> = { "OBSERVED CONNECTION": /^CREATE OBSERVED CONTENT$/, "EMERGING SIGNAL": /EMERGING SIGNAL/, "CREATIVE HYPOTHESIS": /HYPOTHESIS \(근거 없음\)/ };
    for (const type of Object.keys(labels)) {
      const index = conn.connections.findIndex((item) => item.type === type);
      await cards.nth(index).getByRole("button", { name: "SELECT RELATION" }).click();
      await expect(web.getByTestId("trend-web-create")).toHaveText(labels[type]);
    }
    const locked = web.getByTestId("trend-web-collision-locked");
    for (const keyword of nodes) await expect(locked.getByRole("link", { name: `${keyword} WHY 분석` })).toBeVisible();
    // 현실 재현(떠오르는 신호)을 고르면 방향 그대로 Studio에 잠긴다.
    await cards.filter({ hasText: "가상 메이크업을 현실에서 따라 하기" }).getByRole("button", { name: "SELECT RELATION" }).click();
    await web.getByTestId("trend-web-create").click();
    await expect(page.getByTestId("context-lock").getByTestId("lock-drift")).toHaveValue(/게임·가상 공간 안에서/);
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]")[0]);
    expect(project.contextLock).toMatchObject({ direction: "Virtual → Real", evidenceStatus: "EMERGING" });
  });

  test("with saved WHY for both keywords the relation opens Creative Collision with the selected direction", async ({ page }) => {
    const A5 = (whyRuns as unknown as Record<string, { response: { report: object; evidence: unknown[]; analyzedAt: string } }>).A;
    const snaps = nodes.map((keyword, index) => ({ id: `s${index}`, trendId: `live-audit-${index}`, trendName: keyword, keywords: [keyword], periodMonths: 3, summary: "요약", analyzedAt: A5.response.analyzedAt, source: "NAVER DataLab + OpenAI", whyReport: A5.response.report, evidence: A5.response.evidence }));
    const web = await pickTwo(page, snaps);
    await web.getByTestId("hn-connection").filter({ hasText: "가상 메이크업을 현실에서 따라 하기" }).getByRole("button", { name: "SELECT RELATION" }).click();
    await expect(web.getByTestId("trend-web-collision-locked")).toHaveCount(0);
    await web.getByRole("link", { name: /CREATIVE COLLISION/ }).click();
    await expect(page).toHaveURL(/\/collision\?mode=creative/);
    await expect(page.getByTestId("creative-selected-connection")).toContainText("Virtual → Real");
  });
});

test.describe("AUDIT: six slides, six images", () => {
  test("generate, regenerate one, reorder, reload, Workspace restore and Figma export keep every slide's own image", async ({ page }) => {
    test.setTimeout(150_000);
    const plan = (lockRun as unknown as { after: { production: { plan: ProductionPlan } } }).after.production.plan;
    const initial = { id: "audit-six", mode: "single", title: plan.title, source: { trendKeys: ["t"], trendNames: ["메이크업"] }, settings: { ...defaultSettings("cardnews"), slideCount: 6 }, plan: { ...plan, slides: plan.slides.map((slide) => withSlideImage({ ...slide }, emptySlideImage(slide.image_prompt))) }, assets: [], edited: false, createdAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z" };
    await page.goto("/");
    await page.evaluate((value) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-studio-projects", JSON.stringify([value])); }, initial);
    let counter = 0;
    await page.route("**/api/images", async (route) => {
      counter += 1;
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { status: "AI PRODUCTION ASSET", cached: false, createdAt: `2026-11-03T01:00:${String(counter).padStart(2, "0")}.000Z`, base64: PNG, model: `test-${counter}`, prompt: body.prompt, size: "1024x1280" } });
    });
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto(`/studio?project=${initial.id}`);
    const slides = page.getByTestId("production-slide");
    // 화면이 여는 프로젝트: 이 브라우저의 Studio 저장소, 없으면 Workspace 저장 항목(복원 경로).
    const mapping = async () => page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]")[0] ?? JSON.parse(localStorage.getItem("trend-radar-workspace") ?? "[]").map((item: { payload?: { project?: unknown } }) => item.payload?.project).find(Boolean);
      return Object.fromEntries(project.plan.slides.map((slide: { slide_id: string; image?: { assetId?: string } }) => [slide.slide_id, slide.image?.assetId ?? ""]));
    }) as Promise<Record<string, string>>;
    const order = async () => page.evaluate(() => (JSON.parse(localStorage.getItem("trend-radar-studio-projects") ?? "[]")[0] ?? JSON.parse(localStorage.getItem("trend-radar-workspace") ?? "[]").map((item: { payload?: { project?: unknown } }) => item.payload?.project).find(Boolean)).plan.slides.map((slide: { slide_id: string }) => slide.slide_id)) as Promise<string[]>;
    for (let index = 0; index < 6; index += 1) {
      await slides.nth(index).getByTestId("slot-generate").click();
      await slides.nth(index).getByTestId("slot-image-run").click();
      await expect(slides.nth(index).locator('[data-status="AI PRODUCTION ASSET"]').first()).toBeVisible();
    }
    const first = await mapping();
    expect(new Set(Object.values(first)).size).toBe(6);
    expect(Object.values(first).every(Boolean)).toBe(true);
    // 3번만 다시 생성
    const third = plan.slides[2].slide_id;
    // 생성에 성공하면 생성 패널이 닫히므로 "새 이미지 생성"을 다시 연다(실제 사용 순서).
    await slides.nth(2).getByTestId("slot-generate").click();
    await slides.nth(2).getByTestId("slot-image-run").click();
    await expect.poll(async () => (await mapping())[third]).not.toBe(first[third]);
    const second = await mapping();
    for (const id of Object.keys(first)) if (id !== third) expect(second[id]).toBe(first[id]);
    // 2번을 아래로 이동 — 이미지는 slide_id를 따라간다.
    await slides.nth(1).getByTestId("slide-down").click();
    await expect.poll(async () => (await order())[2]).toBe(plan.slides[1].slide_id);
    expect(await mapping()).toEqual(second);
    // 새로고침
    await page.reload();
    expect(await mapping()).toEqual(second);
    // Workspace 저장 → 이 브라우저의 프로젝트를 지운 뒤 Workspace에서 복원
    await page.getByTestId("production-save").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-workspace") ?? "[]").length)).toBe(1);
    await page.evaluate(() => localStorage.removeItem("trend-radar-studio-projects"));
    await page.goto("/workspace");
    await page.getByTestId("saved-item").first().getByRole("link", { name: /Studio에서 이어서 작업/ }).click();
    await expect(page.getByTestId("production-slide")).toHaveCount(6);
    expect(await mapping()).toEqual(second);
    // Figma JSON: 화면 순서대로 각 슬라이드의 자기 이미지
    const download = page.waitForEvent("download");
    await page.getByTestId("production-figma").click();
    const exported = JSON.parse(fs.readFileSync((await (await download).path())!, "utf8")) as { slides: Array<{ elements: Array<{ type: string; assetId?: string }> }> };
    const exportedIds = exported.slides.map((slide) => slide.elements.find((element) => element.type === "IMAGE")?.assetId ?? "");
    expect(exportedIds).toEqual((await order()).map((id) => second[id]));
  });
});
