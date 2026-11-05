import { expect, test, type Page } from "@playwright/test";
import Module from "node:module";
import path from "node:path";
import base from "./fixtures/live-pipeline.json";
import type { LiveAnalysisSnapshot } from "../lib/types";

/*
 * FINAL POLISH V4 4차 — PHASE 10에서 기존 테스트가 없던 두 항목.
 * 12. 비용·호출 한도 보호(lib/rate-limit · lib/ai-guard): 실제 API 없이 함수로 확인한다(HTTP로 확인하면 .env.local 키로 유료 호출이 나갈 수 있다).
 * 10. 접근성 기본 검사: 주요 화면의 버튼 이름, 이미지 대체 텍스트, 입력 라벨, 문서 언어, 제목.
 */
function allowServerOnly() {
  const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const original = M._resolveFilename;
  M._resolveFilename = function (request: string, ...rest: unknown[]) { return request === "server-only" ? path.resolve(__dirname, "fixtures/empty-module.cjs") : original.call(this, request, ...rest); };
}

test.describe("PHASE 10-12 · cost and call-limit protection", () => {
  test.beforeAll(() => allowServerOnly());

  test("per-client minute limit: other clients are not affected and the window resets", async () => {
    const { createRateLimiter } = await import("../lib/rate-limit");
    const check = createRateLimiter(2, 200);
    expect([check("a").allowed, check("a").allowed, check("a").allowed]).toEqual([true, true, false]);
    expect(check("b").allowed).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(check("a").allowed).toBe(true);
  });

  test("runGuarded: cache hits and duplicate in-flight requests do not call the API again; the 7th new request in a minute and a request over the daily cap are refused before the API is called", async () => {
    const { runGuarded, aiUsageToday } = await import("../lib/ai-guard");
    let calls = 0;
    const fn = async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return { ok: true }; };
    const client = `qa-${Date.now()}`;
    const [first, dup] = await Promise.all([runGuarded(client, "k-same", 60_000, fn), runGuarded(client, "k-same", 60_000, fn)]);
    expect(calls).toBe(1);
    expect([first.cached, dup.cached]).toEqual([false, true]);
    expect((await runGuarded(client, "k-same", 60_000, fn)).cached).toBe(true);
    expect(calls).toBe(1);
    for (let i = 1; i < 6; i += 1) await runGuarded(client, `k-${i}`, 60_000, fn); // 분당 기본 6회
    expect(calls).toBe(6);
    await expect(runGuarded(client, "k-7", 60_000, fn)).rejects.toMatchObject({ status: 429, code: "AI_LOCAL_RATE_LIMIT" });
    expect(calls).toBe(6);
    const { used, limit } = aiUsageToday();
    await expect(runGuarded(`${client}-other`, "k-big", 60_000, fn, { cost: limit - used + 1 })).rejects.toMatchObject({ status: 429, code: "AI_DAILY_LIMIT" });
    expect(calls).toBe(6);
  });
});

const [run] = base.snapshots as unknown as LiveAnalysisSnapshot[];
async function seed(page: Page) {
  await page.goto("/settings");
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-live-analyses", JSON.stringify([s])); }, run);
}

test.describe("PHASE 10-10 · basic accessibility on main screens", () => {
  const routes = ["/", "/discover", `/trends/${encodeURIComponent(run.trendId)}/why`, `/trends/${encodeURIComponent(run.trendId)}/dna`, "/culture-map", "/collision", "/lab", "/studio", "/workspace"];
  for (const route of routes) test(`${decodeURIComponent(route)}: lang, one h1, named buttons and links, img alt, labelled inputs`, async ({ page }) => {
    await seed(page);
    await page.goto(route);
    await expect(page.locator("h1").first()).toBeVisible();
    const report = await page.evaluate(() => {
      const visible = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const s = getComputedStyle(el as HTMLElement); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
      const name = (el: Element) => (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title") || (el as HTMLElement).innerText || el.querySelector("img[alt]")?.getAttribute("alt") || "").trim();
      const labelled = (el: Element) => { const id = el.id; return Boolean(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.closest("label") || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || el.getAttribute("title") || el.getAttribute("placeholder")); };
      const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""} ${(el as HTMLElement).outerHTML.slice(0, 120)}`;
      return {
        lang: document.documentElement.lang,
        h1: [...document.querySelectorAll("h1")].filter(visible).length,
        buttons: [...document.querySelectorAll("button, [role=button]")].filter(visible).filter((el) => !name(el)).map(describe),
        links: [...document.querySelectorAll("a[href]")].filter(visible).filter((el) => !name(el)).map(describe),
        images: [...document.querySelectorAll("img")].filter((el) => !el.hasAttribute("alt")).map(describe),
        inputs: [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter(visible).filter((el) => !labelled(el)).map(describe),
      };
    });
    expect(report.lang).toBe("ko");
    expect(report.h1).toBe(1);
    expect(report.buttons, "이름 없는 버튼").toEqual([]);
    expect(report.links, "이름 없는 링크").toEqual([]);
    expect(report.images, "alt 없는 이미지").toEqual([]);
    expect(report.inputs, "라벨 없는 입력").toEqual([]);
  });
});
