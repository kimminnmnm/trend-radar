import { expect, test } from "@playwright/test";
import fixture from "./fixtures/culture-validation.json";
import base from "./fixtures/live-pipeline.json";
import type { LiveAnalysisSnapshot } from "../lib/types";
import { selectWhyOverview, usedWhyEvidenceIds } from "../lib/why-summary";

const saved = fixture.snapshots as unknown as LiveAnalysisSnapshot[];

test("existing saved WHY reports reuse specific current-state insight instead of origin failure", () => {
  const selected = saved.map((snapshot) => ({ name: snapshot.trendName, old: snapshot.summary, next: selectWhyOverview(snapshot) }));
  expect(new Set(selected.map((item) => item.next.summary)).size).toBe(selected.length);
  for (const item of selected) {
    expect(item.old).toMatch(/시작|기원|발생/);
    expect(item.next.summary).not.toMatch(/제공된 자료만으로.{0,30}(시작|기원)|기원 검증이 필요/);
    expect(item.next.needsReanalysis).toBe(false);
  }
  expect(selected.find((item) => item.name === "헤이세이 레트로")?.next.summary).toContain("문구·캐릭터·사진 문화");
});

test("legacy reports prefer cultural meaning over search-index narration, and never upgrade uncited text", () => {
  const recorded = [...saved, ...(base.snapshots as unknown as LiveAnalysisSnapshot[])];
  const selected = recorded.map((snapshot) => ({ name: snapshot.trendName, next: selectWhyOverview(snapshot) }));
  expect(new Set(selected.map((item) => item.next.summary)).size).toBe(selected.length);
  for (const { next } of selected) {
    // 검색 지수 수치만 말하는 요약이나 면책 문장으로 시작하지 않는다.
    expect(next.summary).not.toMatch(/^[^.]*(상대 검색 관심도|검색 관심도는)[^.]*(최고치|평균)/);
    expect(next.summary).not.toMatch(/제공된 자료만으로|기원 검증이 필요/);
    expect(next.summary.length).toBeLessThanOrEqual(260);
    expect(next.status).not.toBe("Verified Signal");
  }
  expect(selected.find((item) => item.name === "디지털카메라")?.next.summary).toMatch(/Y2K|뉴트로|촬영 경험/);
  expect(selected.find((item) => item.name === "레트로 게임")?.next.summary).toMatch(/보존|재현/);
});

test("collected evidence and actually cited evidence are counted separately", () => {
  for (const snapshot of saved) {
    const used = usedWhyEvidenceIds(snapshot.whyReport, snapshot.evidence);
    expect(used.length).toBeLessThanOrEqual(snapshot.evidence?.length ?? 0);
    expect(new Set(used).size).toBe(used.length);
  }
});

test("v5 overview wins, but an unsupported overview is clearly downgraded by validation elsewhere", () => {
  const base = saved[0];
  const snapshot: LiveAnalysisSnapshot = { ...base, trendName: "두쫀쿠", whyReport: { ...base.whyReport!, overview: { summary: "두쫀쿠 관련 콘텐츠에서 식감과 조합을 강조하는 표현이 관찰된다.", status: "Supported Hypothesis", evidenceIds: [base.evidence![0].id] } } };
  const selected = selectWhyOverview(snapshot);
  expect(selected.source).toBe("overview");
  expect(selected.evidenceIds).toEqual([base.evidence![0].id]);
});

test("no usable insight produces an explicit re-analysis state, not a fabricated fact", () => {
  const base = saved[0];
  const selected = selectWhyOverview({ ...base, trendName: "한정선", summary: "", evidence: [], dna: undefined, whyReport: { ...base.whyReport!, trend: "한정선", overview: undefined, what: undefined, context: undefined, triggers: [], motivations: [], origin: { summary: "제공된 자료만으로 최초 발생 시점을 확인할 수 없다.", evidenceIds: [] } } });
  expect(selected.status).toBe("Insufficient Evidence");
  expect(selected.needsReanalysis).toBe(true);
  expect(selected.summary).toContain("재분석");
});

test("Overview and WHY detail reuse the same saved insight without an API call", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/analyze")) calls.push(request.url()); });
  await page.goto("/");
  await page.evaluate((snapshots) => {
    localStorage.clear();
    localStorage.setItem("trend-radar-onboarded", "1");
    localStorage.setItem("trend-radar-live-analyses", JSON.stringify(snapshots));
  }, saved);
  await page.reload();
  const heisei = page.locator(".live-card", { hasText: "헤이세이 레트로" });
  await expect(heisei).toContainText("문구·캐릭터·사진 문화");
  await expect(heisei).not.toContainText("최초 발생 지점");
  await heisei.getByRole("link", { name: "WHY 보기" }).click();
  await expect(page.getByTestId("why-key-insight")).toContainText("문구·캐릭터·사진 문화");
  await expect(page.locator(".origin")).toContainText("최초 발생 지점");
  expect(calls).toEqual([]);
});
