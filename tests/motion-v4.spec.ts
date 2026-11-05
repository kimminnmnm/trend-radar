import { expect, test, type Page } from "@playwright/test";
import base from "./fixtures/live-pipeline.json";
import type { LiveAnalysisSnapshot } from "../lib/types";

/*
 * MOTION V4 — 실제 브라우저(Chromium)에서 애니메이션 상태를 시간에 따라 확인한다. 외부 API 호출 없음.
 * 사람이 눈으로 본 확인은 아니다(자동화). 매끄러움·체감은 docs/MOTION_V4_QA_REPORT.md의 미확인 항목.
 */
const snaps = base.snapshots as unknown as LiveAnalysisSnapshot[];
const collision = (base as unknown as { collision: unknown }).collision;
const identity = /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/;

async function open(page: Page, values: Record<string, unknown> = { "trend-radar-live-analyses": snaps, "trend-radar-collisions": [collision] }) {
  await page.goto("/settings");
  await page.evaluate((values) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-interface-style", "editorial"); for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value)); }, values);
  await page.goto("/");
}
const transform = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).transform);
const anims = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => el.getAnimations().map((a) => `${(a as CSSAnimation).animationName}:${a.playState}`));

test.describe("A. page entrance", () => {
  test("the hero lines are revealed in order (the last line is still moving while the first has settled), the lime highlight wipes in, and everything settles", async ({ page }) => {
    await open(page);
    await expect.poll(() => transform(page, ".edo-display .l1 .m"), { timeout: 3000 }).toMatch(identity);
    // 첫 줄이 자리 잡은 순간 마지막 줄은 아직 올라오는 중이거나 막 끝난다(순차 등장). 둘 다 결국 제자리.
    await expect.poll(() => transform(page, ".edo-display .l4 .m"), { timeout: 3000 }).toMatch(identity);
    await expect(page.locator(".edo-display .l2")).toHaveCSS("isolation", "isolate");
    expect(await page.locator(".edo-display .l2").evaluate((el) => getComputedStyle(el, "::before").animationName)).toBe("ed-wipe");
    await expect(page.locator(".edo-hero .edo-ctas")).toHaveCSS("opacity", "1");
  });

  test("the CTA can be used before the entrance has finished", async ({ page }) => {
    await open(page);
    await page.getByTestId("edo-start").click({ timeout: 1500 });
    await expect(page).toHaveURL(/\/discover$/);
  });

  test("the statistics count up once to the real stored values", async ({ page }) => {
    await open(page);
    const numbers = page.getByTestId("edo-numbers");
    await numbers.scrollIntoViewIfNeeded(); // 화면에 들어와야 시작한다
    const expected = [String(snaps.length), String(snaps.reduce((sum, item) => sum + (item.evidence?.length ?? 0), 0))];
    await expect(numbers.locator("dd .ed-count").nth(0)).toHaveAttribute("data-value", expected[0]);
    await expect(numbers.locator("dd [aria-hidden]").nth(0)).toHaveText(expected[0], { timeout: 3000 });
    await expect(numbers.locator("dd [aria-hidden]").nth(1)).toHaveText(expected[1], { timeout: 3000 });
    await expect(numbers.locator("dd .ed-sr").nth(1)).toHaveText(expected[1]); // 화면 읽기 도구에는 처음부터 실제 값
  });
});

test.describe("C. ambient signal network", () => {
  test("drifts and breathes while on screen, stops for the selected node and offscreen; real edges only are drawn in", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 768, "모바일에서는 지속 움직임을 끈다(아래 모바일 테스트)");
    await open(page);
    await expect(page.locator(".sv")).toHaveClass(/is-visible/);
    await expect.poll(() => anims(page, ".sv-layer"), { timeout: 4000 }).toEqual(["ed-drift:running"]);
    await expect(page.locator(".sv-edge")).toHaveCount(1); // 저장된 관계 1개만
    await expect.poll(() => page.locator(".sv-edge").first().evaluate((el) => getComputedStyle(el).strokeDashoffset), { timeout: 3000 }).toBe("0px");
    await page.getByTestId("sv-chip").first().click();
    await expect.poll(() => anims(page, ".sv-layer")).toEqual(["ed-drift:paused"]);
    await expect.poll(() => anims(page, ".sv-node.on .sv-breathe")).toEqual(["ed-breathe:paused"]);
    await page.getByTestId("sv-reset").click();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator(".sv")).not.toHaveClass(/is-visible/);
    await expect.poll(() => anims(page, ".sv-breathe")).toEqual(["ed-breathe:paused"]);
  });
});

test.describe("B. scroll trigger and scroll-linked story", () => {
  test("a section below the fold is revealed only after it is scrolled to, and HOW IT WORKS highlights the step passing the middle of the screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    const outputs = page.getByTestId("edo-outputs").locator(".ed-reveal");
    await expect(outputs).not.toHaveClass(/is-in/);
    await expect(outputs.locator(".edo-head")).toHaveCSS("opacity", "0");
    await page.getByTestId("edo-outputs").scrollIntoViewIfNeeded();
    await expect(outputs).toHaveClass(/is-in/);
    await expect(outputs.locator(".edo-head")).toHaveCSS("opacity", "1", { timeout: 2000 });
    const flow = page.getByTestId("edo-how-flow");
    await page.getByTestId("edo-step").first().scrollIntoViewIfNeeded();
    await page.getByTestId("edo-step").first().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await expect(flow).toHaveAttribute("data-active", "0");
    await page.getByTestId("edo-step").nth(4).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await expect(flow).toHaveAttribute("data-active", "4");
    await expect(page.getByTestId("edo-step").nth(4)).toHaveAttribute("aria-current", "step");
    // 강제 스크롤 없음: 한 번에 맨 아래로 가도 마지막 섹션 내용에 닿는다
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByTestId("edo-continue").getByRole("link", { name: /OPEN WORKSPACE/ })).toBeVisible();
  });
});

test.describe("reduced motion and mobile", () => {
  test("with reduced motion everything is shown in its final state at once: no hidden sections, real numbers, no ambient motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await expect(page.getByTestId("edo-numbers").locator("dd [aria-hidden]").nth(0)).toHaveText(String(snaps.length));
    await expect(page.getByTestId("edo-outputs").locator(".edo-head")).toHaveCSS("opacity", "1"); // 스크롤 전에도 보임
    expect(await anims(page, ".sv-layer")).toEqual([]);
    expect(await anims(page, ".edo-display .l3 .m")).toEqual([]);
  });

  test("on a phone the network keeps its entrance but has no continuous motion, and the page does not scroll sideways", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page);
    await page.locator(".sv").scrollIntoViewIfNeeded(); // 모바일에서는 히어로 문구 아래에 있다
    await expect(page.locator(".sv")).toHaveClass(/is-visible/);
    await page.waitForTimeout(1600);
    expect(await anims(page, ".sv-layer")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test("selecting a node does not push the hero headline (user report: the hero layout broke on click)", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1280, "히어로가 두 칸일 때(넓은 화면)의 문제");
  const names = ["이거 제 이모지야 밈", "두쫀쿠", "롤드컵", "우사기", "한정선", "떡지순례", "피자설기", "부캉이"];
  const many = names.map((name, index) => ({ ...snaps[index % 2], id: `s${index}`, trendId: `live-${name}`, trendName: name, keywords: [name] }));
  await open(page, { "trend-radar-live-analyses": many });
  await expect.poll(() => transform(page, ".edo-display .l4 .m"), { timeout: 3000 }).toMatch(identity);
  const top = () => page.locator(".edo-kicker").evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const before = await top();
  await page.getByTestId("sv-node").first().click({ force: true }); // 노드는 은은하게 움직여 Playwright가 '멈춤'을 기다리지 않게 한다(사람은 그대로 누를 수 있음)
  await expect(page.getByTestId("sv-snapshot")).toContainText(names[0]);
  expect(await top()).toBe(before);
  const ring = await page.evaluate(() => { const a = document.querySelector(".sv-node.on circle")!.getBoundingClientRect(), b = document.querySelector(".sv-node.on .sv-ring")!.getBoundingClientRect(); return Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2); });
  expect(ring).toBeLessThan(1.5); // 선택 고리는 노드와 같은 중심
});
