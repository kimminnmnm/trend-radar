import { expect, test } from "@playwright/test";
import { dedupeEvidence, youtubeResultRelevant } from "../lib/evidence-quality";
import type { EvidenceItem } from "../lib/schemas";

const evidence = (id: string, url: string, title = "같은 자료"): EvidenceItem => ({ id, kind: "web_source", title, source: "source", url, collectedAt: "2026-10-30T00:00:00.000Z", excerpt: "같은 설명" });

test("duplicate evidence URLs are removed before analysis", () => {
  const result = dedupeEvidence([evidence("WEB-01", "https://example.com/story?utm_source=x"), evidence("WEB-02", "https://example.com/story#section"), evidence("WEB-03", "https://other.example/story")]);
  expect(result.map((item) => item.id)).toEqual(["WEB-01", "WEB-03"]);
});

test("YouTube relevance uses public title and description without treating views as relevance", () => {
  expect(youtubeResultRelevant("헤이세이 레트로", "문구 다이어리", "헤이세이 레트로 캐릭터 스티커 소개")).toBe(true);
  expect(youtubeResultRelevant("헤이세이 레트로", "오늘의 축구 하이라이트", "조회수 100만 영상")).toBe(false);
  expect(youtubeResultRelevant("월드컵", "월드컵 응원가 모음", "")).toBe(true);
});
