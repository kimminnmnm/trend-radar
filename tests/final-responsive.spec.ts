import { expect, test } from "@playwright/test";
import base from "./fixtures/live-pipeline.json";
import extra from "./fixtures/culture-validation.json";

/*
 * PHASE 7 최종 반응형 점검: 실측 8개 트렌드를 저장한 상태에서 Culture Map과 연결 화면을 360px 폭으로 연다.
 * 외부 API는 호출하지 않는다(저장된 결과만 표시).
 */
const all = [...base.snapshots, ...extra.snapshots];
const enc = encodeURIComponent;
const pages = [
  "/",
  "/culture-map",
  `/collision?trend=${enc("live-헤이세이-레트로")}&trend=${enc("live-디지털카메라")}`,
  `/trends/${enc("live-헤이세이-레트로")}/why`,
  `/trends/${enc("live-헤이세이-레트로")}/dna`,
  "/discover",
  "/workspace",
];

test.describe("360px layout with 8 real trends", () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  for (const path of pages) {
    test(`no horizontal overflow on ${decodeURIComponent(path)}`, async ({ page }) => {
      const paid: string[] = [];
      page.on("request", (request) => { if (/\/api\/(analyze|dna|collision|lab|studio)$/.test(new URL(request.url()).pathname)) paid.push(request.url()); });
      await page.goto("/");
      await page.evaluate((items) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-live-analyses", JSON.stringify(items)); }, all);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(paid).toEqual([]);
    });
  }
});
