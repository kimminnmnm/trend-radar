import "server-only";
import { z } from "zod";
import { callStructured, js } from "./openai-client";
import { collectNaverTrend } from "./naver";
import { collectYouTubeEvidence } from "./youtube";
import { cleanDate, hostname, normalizeUrl } from "./web-evidence";
import { classifyConnections, expansionSchema, momentumFrom, rawConnectionsSchema, rawSignalsSchema, validateSignals, windowOf, type DiscoveryWindow } from "./discovery";
import type { EvidenceItem } from "./schemas";

/*
 * T1·T3 수집과 추출(서버). 호출 수(1회 실행):
 *  세부 현상: YouTube 검색 1(+통계 1) · OpenAI 웹 검색 1 · OpenAI 추출 1 · NAVER 1(모멘텀, 무료)
 *  연결:     OpenAI 검색어 확장 1 · YouTube 검색 최대 2 · OpenAI 웹 검색 1 · OpenAI 추출 1
 * Instagram 해시태그는 새로 검색하지 않는다(주간 할당량 보호). 결과는 라우트에서 12시간 캐시한다.
 */
type CollectedSource = { title: string; publisher: string; publishedDate: string; url: string; summary: string; query: string };
const sourceSchema = z.object({ sources: z.array(z.object({ title: z.string(), publisher: z.string(), publishedDate: z.string(), url: z.string(), summary: z.string(), query: z.string() })) });
const sourceJsonSchema = js.obj({ sources: js.arr(js.obj({ title: js.str, publisher: js.str, publishedDate: js.str, url: js.str, summary: js.str, query: js.str })) });

/** OpenAI 웹 검색 1회. 실제로 조회된 URL만 남기고(WEB-xx), 날짜는 YYYY(-MM(-DD))만 인정한다. */
async function searchWeb(instructions: string, input: string, collectedAt: string, max = 10) {
  const { data, sources } = await callStructured({ name: "discovery_web_sources", jsonSchema: sourceJsonSchema, validator: sourceSchema, webSearch: true, maxOutputTokens: 5000, instructions, input, timeoutMs: 150_000 });
  const found = new Map(sources.map((source) => [normalizeUrl(source.url), source]));
  const seen = new Set<string>();
  const items: EvidenceItem[] = [];
  let dropped = 0;
  for (const source of data.sources as CollectedSource[]) {
    const verified = found.get(normalizeUrl(source.url));
    if (!verified) { dropped += 1; continue; }
    const key = normalizeUrl(verified.url);
    if (seen.has(key) || items.length >= max) continue;
    seen.add(key);
    const date = cleanDate(source.publishedDate);
    items.push({ id: `WEB-${String(items.length + 1).padStart(2, "0")}`, kind: "web_source", title: (source.title || verified.title || hostname(verified.url)).slice(0, 200), source: (source.publisher || hostname(verified.url) || "웹 출처").slice(0, 120), url: verified.url.slice(0, 500), date: date || undefined, collectedAt, excerpt: `${source.summary.trim()} (발행 ${date || "날짜 미상"} · 검색어 “${source.query.slice(0, 60)}” · 웹 검색 결과를 AI가 요약 · 원문 확인 필요)`.slice(0, 800) });
  }
  return { items, searched: sources.length, dropped };
}
const reid = (items: EvidenceItem[], prefix: string) => items.map((item, index) => ({ ...item, id: `${prefix}-${String(index + 1).padStart(2, "0")}` }));
const ledgerPrompt = (items: EvidenceItem[]) => JSON.stringify(items.map(({ id, kind, title, source, date, excerpt }) => ({ id, kind, title, source, date, excerpt: excerpt.slice(0, 500) })));

/* ---------- T1 세부 현상 발견 ---------- */
const signalJsonSchema = js.obj({
  signals: js.arr(js.obj({ title: js.str, phenomenon: js.str, audience_behavior: js.str, related_entities: js.strArr, related_keywords: js.strArr, content_examples: js.arr(js.obj({ evidence_id: js.str, note: js.str })), evidence_ids: js.strArr, is_background: { type: "boolean" } })),
  limitations: js.strArr,
});
const signalInstructions = (keyword: string, window: DiscoveryWindow) => [
  "You are TREND RADAR's trend discovery analyst. Return only the JSON schema, in Korean.",
  `The user's keyword "${keyword}" is a broad umbrella, not a static topic. From the EVIDENCE only, find the specific phenomena happening now under it (observation window ${window.from} ~ ${window.to}): sub-styles, challenges, content formats, character/game/brand crossovers, new audience behaviors, products or collaborations people are actually posting or reporting.`,
  "Each candidate must be ONE concrete phenomenon (who does what, where), not a category. title: short Korean name of the phenomenon. phenomenon: what is happening, concretely. audience_behavior: what people actually do (make, post, buy, recreate, wear, visit…). related_entities: names that appear in the evidence (creators, brands, characters, games, products). related_keywords: 1-3 short Korean search words for this phenomenon (for search-interest lookup). content_examples: evidence ids with a one-line note of what that item shows. evidence_ids: every id that shows this phenomenon.",
  "Use only evidence ids from the ledger. Do not invent phenomena, names, numbers, rankings or the words '급상승', '바이럴', '1위' unless an evidence item states them. If an evidence item only explains the keyword's definition, history or origin, put it in a candidate with is_background=true (it will be excluded) — do not present history as a current trend.",
  "Prefer 4-8 candidates; fewer is fine when evidence is thin. limitations: what the sample cannot show (small sample, missing platforms, undated sources).",
].join(" ");

export async function discoverPhenomena(keyword: string, days: number) {
  const window = windowOf(days);
  const collectedAt = new Date().toISOString();
  const notes: string[] = [];
  // YouTube: 관측 기간 안, 관련도순(최신순은 무관한 새 영상이 많다). 실패해도 다른 출처로 계속.
  let youtube: EvidenceItem[] = [];
  try { youtube = (await collectYouTubeEvidence(keyword, { days, order: "relevance" })).evidence; }
  catch (error) { notes.push(`YouTube 수집 실패: ${error instanceof Error ? error.message.slice(0, 120) : "오류"}`); }
  const web = await searchWeb(
    [
      "You collect public web sources for a Korean trend researcher. Use web search in Korean and English and report only what the sources say.",
      `Today is ${window.to}. Find what is happening NOW (published ${window.from} ~ ${window.to}) under the broad keyword the user gives: specific sub-trends, challenges, viral formats, crossovers with characters/games/brands, new products or collaborations, new audience behaviors. Do NOT collect pages that only explain the keyword's definition, history or origin.`,
      "Prefer news, magazines, platform/brand pages and creator content pages. Avoid shopping listings and SEO spam. Use at least 4 different domains. Return up to 10 sources.",
      "title, publisher, publishedDate (YYYY-MM-DD/YYYY-MM/YYYY as shown, else empty), url (actually opened or found), summary (1-2 Korean sentences naming the specific phenomenon the page reports), query (the search query that found it). Never fabricate URLs or dates.",
    ].join(" "),
    `키워드: ${keyword}\n관측 기간: ${window.from} ~ ${window.to}\n이 키워드 아래에서 지금 실제로 나타나는 세부 현상(스타일·챌린지·포맷·협업·행동)을 보도하거나 보여 주는 출처를 찾아 주세요.`,
    collectedAt,
  );
  const ledger = [...youtube, ...web.items];
  if (!ledger.length) return { keyword, window, signals: [], excluded: [], limitations: ["관측 기간 안에서 수집된 자료가 없습니다."], notes, sources: { youtube: 0, web: 0, webDropped: web.dropped }, ledger, model: "" };
  const { data, model } = await callStructured({ name: "discovery_signals", jsonSchema: signalJsonSchema, validator: rawSignalsSchema, instructions: signalInstructions(keyword, window), input: `KEYWORD: ${keyword}\nWINDOW: ${window.from}~${window.to}\nEVIDENCE: ${ledgerPrompt(ledger)}`, maxOutputTokens: 6000, timeoutMs: 120_000 });
  const verdict = validateSignals(data.signals, ledger, keyword, window);
  // 모멘텀: 상위 후보의 검색어를 NAVER에 한 번에(최대 5그룹) — 상대 지수일 뿐, 없으면 표시하지 않는다.
  const words = [...new Set(verdict.signals.map((signal) => signal.relatedKeywords[0]).filter(Boolean))].slice(0, 5);
  if (words.length) {
    try {
      const naver = await collectNaverTrend(words[0], words, 3);
      for (const signal of verdict.signals) {
        const series = naver.series.find((item) => item.title === signal.relatedKeywords[0]);
        signal.momentumIndicator = series ? momentumFrom(series.title, series.data) : null;
      }
    } catch (error) { notes.push(`NAVER 모멘텀 계산 실패: ${error instanceof Error ? error.message.slice(0, 120) : "오류"}`); }
  }
  return { keyword, window, signals: verdict.signals, excluded: verdict.excluded, removedIds: verdict.removedIds, limitations: data.limitations, notes, sources: { youtube: youtube.length, web: web.items.length, webDropped: web.dropped }, ledger, model };
}

/* ---------- T2·T3 두 키워드의 실제 연결 ---------- */
const expansionJsonSchema = js.obj({ aliases_a: js.strArr, aliases_b: js.strArr, directions: js.arr(js.obj({ direction: js.str, hypothesis: js.str, queries: js.strArr })) });
const connectionJsonSchema = js.obj({ connections: js.arr(js.obj({ title: js.str, subject: js.str, action: js.str, object: js.str, direction: js.str, platform: js.str, context: js.str, explanation: js.str, evidence_ids: js.strArr })), limitations: js.strArr });

export async function discoverConnections(a: string, b: string, days: number, context = "") {
  const window = windowOf(days);
  const collectedAt = new Date().toISOString();
  const notes: string[] = [];
  // 1. 검색어 확장: 두 대상 사이의 "행동"이 들어간 검색어를 방향별로(검색 후보일 뿐).
  const expansion = await callStructured({
    name: "connection_queries", jsonSchema: expansionJsonSchema, validator: expansionSchema, maxOutputTokens: 2000, timeoutMs: 60_000,
    instructions: "You plan web/video searches to find how two cultural keywords are ACTUALLY connected online. Return only the JSON schema. aliases_a / aliases_b: words that would appear in content about each concept — the keyword in Korean and English, common short names, and closely related category words (e.g. makeup → 메이크업, 화장, makeup, beauty, 뷰티, cosmetics, 립스틱, 마스카라; Roblox → 로블록스, Roblox, 로블). directions: 3-5 DIFFERENT possible connection directions — each is a different phenomenon (e.g. A used inside B, B recreated in A, A recreated in real life, brand marketing using A for B). For each give a short direction label like 'Virtual → Real', a one-line hypothesis, and 2-3 search queries in Korean and English that include the ACTION between the two (e.g. 'Roblox avatar makeup in real life', '아바타 메이크업 따라 하기'). These are search candidates, not findings.",
    input: `A: ${a}\nB: ${b}\n사용자 맥락: ${context || "(없음)"}`,
  });
  const termsA = [a, ...expansion.data.aliases_a], termsB = [b, ...expansion.data.aliases_b];
  const queries = expansion.data.directions.flatMap((direction) => direction.queries);
  // 2. YouTube: 한국어 1개 + 영어 1개(지역·언어 조건 없이). 확장 검색어를 그대로 쓴다.
  const korean = queries.find((query) => /[가-힣]/.test(query)), english = queries.find((query) => !/[가-힣]/.test(query));
  let youtube: EvidenceItem[] = [];
  for (const [query, global] of [[korean, false], [english, true]] as const) {
    if (!query) continue;
    try { youtube = [...youtube, ...(await collectYouTubeEvidence(query, { days, order: "relevance", global })).evidence]; }
    catch (error) { notes.push(`YouTube “${query}” 수집 실패: ${error instanceof Error ? error.message.slice(0, 120) : "오류"}`); }
  }
  youtube = reid(youtube.filter((item, index, all) => all.findIndex((other) => other.url === item.url) === index), "YT");
  // 3. 웹: 방향별 검색어로, 두 개념이 "같은 콘텐츠 안에서" 연결된 출처만.
  const web = await searchWeb(
    [
      "You collect public web sources that show how two cultural keywords are actually connected. Use web search with the given queries (Korean and English) and report only what the sources say.",
      `Today is ${window.to}. Prefer sources published ${window.from} ~ ${window.to}. Only keep pages where BOTH concepts appear together in the same content (a video, post, article, campaign). Do not keep pages about only one of them.`,
      "title, publisher, publishedDate (as shown, else empty), url (actually opened or found), summary (1-2 Korean sentences: who does what with both concepts), query (the query that found it). Never fabricate URLs or dates. Up to 10 sources.",
    ].join(" "),
    `A: ${termsA.join(", ")}\nB: ${termsB.join(", ")}\n검색어 후보:\n${expansion.data.directions.map((direction) => `- [${direction.direction}] ${direction.queries.join(" | ")}`).join("\n")}`,
    collectedAt,
  );
  const ledger = [...youtube, ...web.items];
  // 4. 추출: 방향이 다른 현상은 합치지 않는다. 판정(관측·신호·가설)은 서버가 한다.
  const { data, model } = await callStructured({
    name: "connection_phenomena", jsonSchema: connectionJsonSchema, validator: rawConnectionsSchema, maxOutputTokens: 5000, timeoutMs: 120_000,
    instructions: [
      "You are TREND RADAR's cultural connection analyst. Return only the JSON schema, in Korean.",
      "From the EVIDENCE, describe each distinct way the two keywords are connected as a separate phenomenon with subject (who), action (verb), object (what), direction (e.g. 'Virtual → Real', 'Real → Virtual', 'A 안에서 B', 'Brand → Platform'), platform (where it is observed), context (cultures involved) and evidence_ids that show THIS phenomenon. Never merge different directions into one item. Use the exact direction label from SEARCH_PLAN when the phenomenon matches one; otherwise write a new short label. Brand-run experiences or campaigns are a different phenomenon (e.g. 'Brand → Platform') from looks or content that users create themselves — keep them separate.",
      "Use only ledger ids. If a direction from SEARCH_PLAN has no evidence, you may still list it with empty evidence_ids — it will be shown as a creative hypothesis, not a trend. Do not invent creators, numbers or popularity claims.",
      "limitations: what the evidence cannot show.",
    ].join(" "),
    input: `A: ${a} (${termsA.join(", ")})\nB: ${b} (${termsB.join(", ")})\nWINDOW: ${window.from}~${window.to}\nSEARCH_PLAN: ${JSON.stringify(expansion.data.directions)}\nEVIDENCE: ${ledgerPrompt(ledger)}`,
  });
  const verdict = classifyConnections(data.connections, ledger, termsA, termsB, window, expansion.data.directions);
  return { a, b, window, termsA, termsB, searchPlan: expansion.data.directions, connections: verdict.connections, removedIds: verdict.removedIds, limitations: data.limitations, notes, sources: { youtube: youtube.length, web: web.items.length, webDropped: web.dropped }, ledger, model };
}
