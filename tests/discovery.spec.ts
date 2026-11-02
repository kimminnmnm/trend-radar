import { expect, test } from "@playwright/test";
import fixture from "./fixtures/discovery-t1-t3.json";
import { classifyConnections, inWindow, mentionsBoth, momentumFrom, validateSignals, windowOf, type Connection, type DiscoverySignal, type RawConnection, type RawSignal } from "../lib/discovery";
import type { EvidenceItem } from "../lib/schemas";

/*
 * TREND DISCOVERY T1~T3. 픽스처 discovery-t1-t3.json: 2026-11-02 실측(YouTube Data API·OpenAI 웹 검색·NAVER DataLab, Instagram 미수집).
 * 판정 규칙은 원장을 다시 써서 결정적으로 검사한다. 외부 API는 호출하지 않는다.
 */
type Discovery = { keyword: string; window: { days: number; from: string; to: string }; signals: DiscoverySignal[]; excluded: Array<{ title: string; reason: string }>; ledger: EvidenceItem[] };
type Connections = { termsA: string[]; termsB: string[]; window: Discovery["window"]; searchPlan: Array<{ direction: string; hypothesis: string }>; connections: Connection[]; ledger: EvidenceItem[] };
const f = fixture as unknown as { makeup: Discovery; pepero: Discovery; connections: Connections; connectionsBefore: { connections: Connection[] } };
const HISTORY = /역사|기원|유래|시작된|처음 생긴|정의|이란 무엇/;

test.describe("T1 phenomena discovery (recorded real data)", () => {
  test("메이크업: concrete current sub-phenomena, not makeup's history; every signal has in-window evidence", () => {
    const { signals, window } = f.makeup;
    expect(signals.length).toBeGreaterThanOrEqual(4);
    expect(signals.map((signal) => signal.title).join(" ")).toMatch(/고양이 메이크업|커버 메이크업|GRWM|할로윈/);
    for (const signal of signals) {
      expect(signal.title, signal.title).not.toMatch(HISTORY);
      expect(signal.inWindowCount).toBeGreaterThan(0);
      expect(signal.observedDateRange && signal.observedDateRange.from >= window.from.slice(0, 7)).toBeTruthy();
      expect(["Observed", "Emerging Signal"]).toContain(signal.verificationStatus);
    }
  });

  test("빼빼로데이: this year's products, collaborations and behaviors instead of the day's origin", () => {
    const titles = f.pepero.signals.map((signal) => signal.title).join(" ");
    expect(titles).toMatch(/스트레이 키즈|산리오|캐릭터|만들기|캠퍼스/);
    expect(titles).not.toMatch(HISTORY);
    expect(f.pepero.signals.filter((signal) => signal.verificationStatus === "Observed").length).toBeGreaterThanOrEqual(2);
  });

  test("momentum appears only where NAVER data exists and is labeled as a relative index", () => {
    for (const signal of [...f.makeup.signals, ...f.pepero.signals]) {
      if (!signal.momentumIndicator) continue;
      expect(signal.momentumIndicator.basis).toMatch(/상대 검색 관심도.*절대 검색량 아님/);
      expect(signal.relatedKeywords).toContain(signal.momentumIndicator.keyword);
    }
    expect([...f.makeup.signals, ...f.pepero.signals].some((signal) => signal.momentumIndicator === null)).toBe(true);
    expect(momentumFrom("x", Array.from({ length: 12 }, () => ({ period: "p", ratio: 0 })))).toBeNull();
    expect(momentumFrom("x", [...Array.from({ length: 8 }, () => ({ period: "p", ratio: 10 })), ...Array.from({ length: 4 }, () => ({ period: "p", ratio: 30 }))])).toMatchObject({ direction: "rising", ratio: 3 });
  });

  test("the server verdict drops history, invented ids, out-of-window-only and duplicate candidates", () => {
    const window = windowOf(30, new Date("2026-11-02T00:00:00Z"));
    const ledger: EvidenceItem[] = [
      { id: "YT-01", kind: "youtube_video", title: "고양이 메이크업 튜토리얼", source: "YouTube Data API · 채널A", url: "https://youtu.be/a", date: "2026-10-30T00:00:00Z", collectedAt: "2026-11-02", excerpt: "x" },
      { id: "YT-02", kind: "youtube_video", title: "고양이 메이크업 GRWM", source: "YouTube Data API · 채널B", url: "https://youtu.be/b", date: "2026-10-31T00:00:00Z", collectedAt: "2026-11-02", excerpt: "x" },
      { id: "WEB-01", kind: "web_source", title: "메이크업의 역사", source: "매거진", url: "https://m.example/1", date: "2019-01-01", collectedAt: "2026-11-02", excerpt: "x" },
    ];
    const raw = (title: string, ids: string[], extra: Partial<RawSignal> = {}): RawSignal => ({ title, phenomenon: `${title} 현상`, audience_behavior: "따라 한다", related_entities: [], related_keywords: [], content_examples: [], evidence_ids: ids, is_background: false, ...extra });
    const { signals, excluded, removedIds } = validateSignals([
      raw("고양이 메이크업 따라 하기", ["YT-01", "YT-02", "YT-99"]),
      raw("메이크업의 역사", ["WEB-01"], { is_background: true }),
      raw("옛날 유행", ["WEB-01"]),
      raw("고양이 메이크업 따라하기", ["YT-01"]),
    ], ledger, "메이크업", window);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ verificationStatus: "Observed", independentSources: 2, evidenceStrength: "moderate" });
    expect(removedIds).toEqual(["YT-99"]);
    expect(excluded.map((item) => item.reason)).toEqual(["키워드의 일반 설명·역사(현재 현상이 아님)", "근거가 관측 기간 밖이거나 날짜를 확인할 수 없음", "다른 후보와 같은 현상"]);
    expect(inWindow("2026", window)).toBe(false);
    expect(inWindow("2026-10", window)).toBe(true);
  });
});

test.describe("T2·T3 observed connections (recorded real data)", () => {
  test("로블록스 × 메이크업: directions stay separate; in-game makeup is observed; avatar makeup recreated in real life is an emerging signal, not merged", () => {
    const { connections } = f.connections;
    const directions = connections.map((item) => item.direction);
    expect(new Set(directions).size).toBeGreaterThanOrEqual(2);
    const inGame = connections.find((item) => item.type === "OBSERVED CONNECTION" && item.recency === "in-window");
    expect(inGame?.direction).toMatch(/A 안에서 B|안에서/);
    const real = connections.find((item) => /Virtual → Real|가상 → 현실/.test(item.direction) && !item.notFound);
    expect(real).toMatchObject({ type: "EMERGING SIGNAL", independentSources: 1 });
    expect(real?.evidenceIds).toEqual(["YT-04"]);
    const evidence = f.connections.ledger.find((item) => item.id === "YT-04")!;
    expect(evidence.title).toMatch(/따라/);
    expect(mentionsBoth(evidence, f.connections.termsA, f.connections.termsB)).toBe(true);
  });

  test("the first run's mistakes are fixed by the current rules: undated brand cases are not hypotheses, unseen directions are listed once", () => {
    // 첫 실행: 날짜 미상 웹 출처 때문에 브랜드 사례 3건이 모두 가설이었다.
    expect(f.connectionsBefore.connections.filter((item) => item.type === "CREATIVE HYPOTHESIS").length).toBe(3);
    // 현재 규칙으로 다시 판정: 근거 ID가 있는 현상은 함께 등장 여부로 유형을 정하고, 최신성은 따로 표시한다.
    const raw: RawConnection[] = f.connections.connections.filter((item) => !item.notFound).map((item) => ({ title: item.title, subject: item.subject, action: item.action, object: item.object, direction: item.direction, platform: item.platform, context: item.context, explanation: item.explanation, evidence_ids: item.evidenceIds }));
    const { connections } = classifyConnections(raw, f.connections.ledger, f.connections.termsA, f.connections.termsB, f.connections.window, f.connections.searchPlan);
    expect(connections.some((item) => item.recency === "undated" && item.type !== "CREATIVE HYPOTHESIS")).toBe(true);
    // 검색 계획 방향 중 이미 찾은 현상과 같은 것은 가설로 다시 붙지 않는다(가상 → 현실은 실제 신호로 이미 있음).
    expect(connections.filter((item) => item.notFound && /현실/.test(item.title)).length).toBe(0);
    expect(connections.filter((item) => item.type === "CREATIVE HYPOTHESIS").every((item) => item.evidenceIds.length === 0 || item.coOccurrence === 0)).toBe(true);
  });

  test("co-occurrence decides the type: two independent sources → observed, one → emerging, none → hypothesis", () => {
    const window = windowOf(90, new Date("2026-11-02T00:00:00Z"));
    const ledger: EvidenceItem[] = [
      { id: "YT-01", kind: "youtube_video", title: "Roblox avatar makeup in real life", source: "YouTube Data API · A", url: "https://y/1", date: "2026-10-01T00:00:00Z", collectedAt: "x", excerpt: "" },
      { id: "YT-02", kind: "youtube_video", title: "로블록스 메이크업 따라하기", source: "YouTube Data API · B", url: "https://y/2", date: "2026-10-02T00:00:00Z", collectedAt: "x", excerpt: "" },
      { id: "YT-03", kind: "youtube_video", title: "로블록스 초보 가이드", source: "YouTube Data API · C", url: "https://y/3", date: "2026-10-03T00:00:00Z", collectedAt: "x", excerpt: "" },
    ];
    const raw = (direction: string, ids: string[]): RawConnection => ({ title: direction, subject: "s", action: direction, object: "o", direction, platform: "p", context: "c", explanation: "e", evidence_ids: ids });
    const { connections } = classifyConnections([raw("Virtual → Real", ["YT-01", "YT-02"]), raw("A 안에서 B", ["YT-01"]), raw("Brand → Platform", ["YT-03"])], ledger, ["로블록스", "Roblox"], ["메이크업", "makeup"], window);
    expect(connections.map((item) => [item.direction, item.type])).toEqual([["Virtual → Real", "OBSERVED CONNECTION"], ["A 안에서 B", "EMERGING SIGNAL"], ["Brand → Platform", "CREATIVE HYPOTHESIS"]]);
  });
});

test.describe("discovery API routes", () => {
  test("validate input before access and require login for paid discovery", async ({ request }) => {
    expect((await request.post("/api/discover/phenomena", { data: {} })).status()).toBe(400);
    expect((await request.post("/api/discover/connections", { data: { a: "메이크업", b: "메이크업" } })).status()).toBe(400);
    expect((await request.post("/api/discover/phenomena", { data: { keyword: "메이크업" } })).status()).toBe(401);
    expect((await request.post("/api/discover/connections", { data: { a: "로블록스", b: "메이크업" } })).status()).toBe(401);
  });
});
