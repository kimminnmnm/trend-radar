import "server-only";
import { z } from "zod";
import { callStructured, js } from "./openai-client";
import type { EvidenceItem } from "./schemas";

/*
 * TREND WHY 보강용 공개 웹 출처 수집. OpenAI 웹 검색 도구가 실제로 조회한 URL만 근거 원장(WEB-xx)에 넣는다.
 * 원장의 요약은 AI가 출처 내용을 요약한 것이므로 UI에서 "원문 확인 필요"로 표시한다.
 * ENGINE V2: focus를 주면 WHY용(배경·사건·확산·브랜드) 대신 "선택한 콘텐츠 방향에 필요한 구체 자료"를 찾는다(ID AR-xx).
 */
const MAX_WEB_EVIDENCE = 8;
const categories = ["background", "event", "content", "brand", "detail"] as const;
const categoryLabel: Record<(typeof categories)[number], string> = { background: "배경", event: "사건", content: "확산 콘텐츠", brand: "브랜드 사례", detail: "콘텐츠 자료" };
export type ResearchFocus = { topic: string; needs: string[] };

const sourceSchema = z.object({ sources: z.array(z.object({ category: z.enum(categories), title: z.string(), publisher: z.string(), publishedDate: z.string(), eventDate: z.string(), url: z.string(), summary: z.string() })) });
const sourceJsonSchema = js.obj({ sources: js.arr(js.obj({ category: js.enumOf([...categories]), title: js.str, publisher: js.str, publishedDate: js.str, eventDate: js.str, url: js.str, summary: js.str })) });

export const normalizeUrl = (value: string) => value.replace(/[?#].*$/, "").replace(/\/$/, "");
export const hostname = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
/** YYYY, YYYY-MM, YYYY-MM-DD만 날짜로 인정한다. 모르면 빈 값. */
export const cleanDate = (value: string) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(value.trim()) ? value.trim() : "";

import type { WebCollection } from "./types";
export type { WebCollection };

export async function collectWebEvidence(trend: string, collectedAt = new Date().toISOString(), focus?: ResearchFocus): Promise<{ items: EvidenceItem[]; web: WebCollection }> {
  const today = collectedAt.slice(0, 10);
  const { data, model, sources } = await callStructured({
    name: "trend_why_web_sources", jsonSchema: sourceJsonSchema, validator: sourceSchema, webSearch: true, maxOutputTokens: 3500,
    instructions: focus ? [
      "You collect public web sources for a Korean social content editor. Use web search (Korean and English queries) and report only what the sources say.",
      `Today is ${today}. The editor is writing "${focus.topic}" about the subject "${trend}". Find concrete, checkable facts this piece needs — names, places, official information, how-to details, history facts — not trend analysis or search-interest data. Needs: ${focus.needs.join(" / ") || "(none listed)"}. Use category 'detail' for practical or descriptive facts, 'background' for history, 'event' for dated events.`,
      "Prefer official pages, news outlets, magazines and reputable guides. Avoid shopping listings, SEO spam and anonymous forums. Use at least 2 different domains.",
      "Return 3-8 sources. title, publisher, publishedDate (YYYY-MM-DD, YYYY-MM or YYYY if shown, otherwise empty), eventDate (if stated, otherwise empty).",
      "summary: one or two Korean sentences with the specific facts the source itself states. Do not add claims the source does not make.",
      "url: a URL you actually opened or found in search results. Never fabricate URLs or dates.",
    ].join(" ") : [
      "You collect public web sources about a Korean trend keyword for a cautious trend analyst. Use web search (Korean and English queries) and report only what the sources say.",
      `Today is ${today}. Find: background/history of the trend (category background), real-world cultural events tied to it (event), content that may have spread it such as viral videos, dramas, celebrities or memes (content), and brand collaborations or marketing cases (brand).`,
      "Prefer news outlets, magazines, official brand or platform pages, and research reports. Avoid shopping listings, SEO spam and anonymous forums. Use at least 3 different domains.",
      "Return 4-8 sources. title: the page title. publisher: the outlet name. publishedDate: the page's publication date as YYYY-MM-DD, YYYY-MM or YYYY if shown, otherwise empty string. eventDate: the date of the event the source describes if stated, otherwise empty string.",
      "summary: one or two Korean sentences of what the source itself states about the trend. Do not add causes, numbers or claims the source does not make.",
      "url: a URL you actually opened or found in search results. Never fabricate URLs or dates.",
    ].join(" "),
    input: focus ? `주제: ${trend}\n콘텐츠 방향: ${focus.topic}\n이 콘텐츠에 필요한 구체 자료의 공개 출처를 찾아 주세요.` : `트렌드 키워드: ${trend}\n이 키워드의 배경, 실제 문화적 사건, 확산에 영향을 줬을 수 있는 콘텐츠, 브랜드 활용 사례에 대한 공개 출처를 찾아 주세요.`,
  });
  const found = new Map(sources.map((source) => [normalizeUrl(source.url), source]));
  const seen = new Set<string>();
  let droppedUnverified = 0;
  const items: EvidenceItem[] = [];
  for (const source of data.sources) {
    const verified = found.get(normalizeUrl(source.url));
    if (!verified) { droppedUnverified += 1; continue; }
    const key = normalizeUrl(verified.url);
    if (seen.has(key) || items.length >= MAX_WEB_EVIDENCE) continue;
    seen.add(key);
    const published = cleanDate(source.publishedDate);
    const eventDate = cleanDate(source.eventDate);
    items.push({
      id: `${focus ? "AR" : "WEB"}-${String(items.length + 1).padStart(2, "0")}`,
      kind: "web_source",
      title: `[${categoryLabel[source.category]}] ${source.title || verified.title || hostname(verified.url)}`.slice(0, 200),
      source: (source.publisher || hostname(verified.url) || "웹 출처").slice(0, 120),
      url: verified.url.slice(0, 500),
      date: eventDate || published || undefined,
      collectedAt,
      excerpt: `${source.summary.trim()} (발행 ${published || "날짜 미상"}${eventDate ? ` · 사건 시점 ${eventDate}` : ""} · 웹 검색 결과를 AI가 요약 · 원문 확인 필요)`.slice(0, 800),
    });
  }
  return { items, web: { status: "live", count: items.length, searchedSources: sources.length, droppedUnverified, model } };
}
