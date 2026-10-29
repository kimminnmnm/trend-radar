import "server-only";
import { z } from "zod";
import { callStructured, js } from "./openai-client";
import { getRecentlySearchedHashtags, HASHTAG_WEEKLY_LIMIT, measureHashtagPulse, MetaGraphError, normalizeHashtagName, resolveIgAccountId } from "./meta";
import type { IgPulseItem, IgPulseReport } from "./types";

export const IG_PULSE_PROMPT_VERSION = "ig-pulse-v2";
/** 주간 30개 한도 중 Instagram 화면의 수동 검색용으로 남겨 두는 개수 */
export const QUOTA_RESERVE = 6;
const MAX_NEW_PER_SCAN = 4;
export const MAX_TAGS_PER_SCAN = 10;

const candidateSchema = z.object({ candidates: z.array(z.object({ hashtag: z.string(), keyword: z.string(), category: z.string(), summary: z.string(), sourceUrls: z.array(z.string()) })) });
const candidateJsonSchema = js.obj({ candidates: js.arr(js.obj({ hashtag: js.str, keyword: js.str, category: js.str, summary: js.str, sourceUrls: js.strArr })) });
const normalizeUrl = (value: string) => value.replace(/[?#].*$/, "").replace(/\/$/, "");

/** 웹 검색으로 지금 SNS에서 화제인 대상을 해시태그 후보로 수집한다. 도구가 실제로 조회한 URL을 인용한 후보만 남긴다. */
async function discoverCandidates(today: string) {
  const { data, model, sources } = await callStructured({
    name: "ig_pulse_candidates", jsonSchema: candidateJsonSchema, validator: candidateSchema, webSearch: true, maxOutputTokens: 4000,
    instructions: [
      "You find what is hot right now on Instagram and social media among Korean people in their 20s and 30s. Use web search and rely only on what you find.",
      `Today is ${today}. Prefer sources from the last 30 days: news on viral characters, memes, pop-up stores, desserts and food, fashion or beauty items, challenges, games, idol content, places.`,
      "Prefer specific, currently viral things over broad categories (a specific character or dessert, not 'fashion' or 'travel').",
      "Return 8-10 distinct candidates from at least 4 different domains, ordered from the most widely posted about to the least. Do not use shopping listings or SEO spam.",
      "hashtag: the short, common Korean hashtag people actually use on Instagram for it (usually the plain name, ideally 2-8 characters), without '#' and without spaces (letters, numbers, underscore only). Never use event-, campaign- or article-specific long hashtags.",
      "keyword: the common Korean name. summary: one Korean sentence on why sources say it is hot. Do not invent numbers.",
      "sourceUrls: URLs you actually opened or found in search results that mention it. Never fabricate URLs.",
    ].join(" "),
    input: `${today} 기준 한국 2030 사이에서 인스타그램·SNS에서 지금 화제인 대상을 해시태그 후보로 찾아 주세요.`,
  });
  const found = new Map(sources.map((source) => [normalizeUrl(source.url), source]));
  let droppedUnverified = 0;
  const candidates = data.candidates.flatMap((candidate) => {
    let tag: string;
    try { tag = normalizeHashtagName(candidate.hashtag); } catch { return []; }
    const verified = candidate.sourceUrls.map((url) => found.get(normalizeUrl(url))).filter((source): source is { url: string; title?: string } => Boolean(source));
    if (!verified.length) { droppedUnverified += 1; return []; }
    return [{ tag, keyword: candidate.keyword, category: candidate.category, summary: candidate.summary, sources: verified.slice(0, 2) }];
  });
  return { candidates, model, droppedUnverified, searchedSources: sources.length };
}

export type IgPulseRequest = { track: string[]; add: string[]; discover: boolean };
type Plan = { tag: string; origin: IgPulseItem["origin"]; meta?: { keyword: string; category: string; summary: string; sources: Array<{ url: string; title?: string }> } };

/**
 * 추적 중인 태그 → 직접 추가한 태그 → 웹 검색 후보 순서로 측정한다.
 * 이미 조회한 태그(최근 7일)는 한도를 쓰지 않고, 새 태그는 스캔당 4개·주간 예비분을 넘지 않게 보류한다.
 */
export async function scanIgPulse(request: IgPulseRequest): Promise<IgPulseReport> {
  const accountId = await resolveIgAccountId();
  const recent = new Set(await getRecentlySearchedHashtags(accountId));
  const usedBefore = recent.size;
  const discovery = request.discover ? await discoverCandidates(new Date().toISOString().slice(0, 10)) : null;

  const plan: Plan[] = [];
  const seen = new Set<string>();
  const push = (tag: string, origin: Plan["origin"], meta?: Plan["meta"]) => {
    let normalized: string;
    try { normalized = normalizeHashtagName(tag); } catch { return; }
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    plan.push({ tag: normalized, origin, meta });
  };
  request.track.forEach((tag) => push(tag, "tracked"));
  request.add.forEach((tag) => push(tag, "manual"));
  discovery?.candidates.forEach((candidate) => push(candidate.tag, "discovered", candidate));

  const deferred: IgPulseReport["deferred"] = [];
  const failed: IgPulseReport["failed"] = [];
  const items: IgPulseItem[] = [];
  let newUsed = 0;
  for (const entry of plan) {
    const isNew = !recent.has(entry.tag.toLocaleLowerCase());
    if (items.length + failed.length >= MAX_TAGS_PER_SCAN) { deferred.push({ tag: entry.tag, reason: `스캔당 최대 ${MAX_TAGS_PER_SCAN}개` }); continue; }
    if (isNew && (newUsed >= MAX_NEW_PER_SCAN || recent.size >= HASHTAG_WEEKLY_LIMIT - QUOTA_RESERVE)) {
      deferred.push({ tag: entry.tag, reason: newUsed >= MAX_NEW_PER_SCAN ? `새 태그는 스캔당 최대 ${MAX_NEW_PER_SCAN}개` : `주간 해시태그 한도(${HASHTAG_WEEKLY_LIMIT}개 중 예비 ${QUOTA_RESERVE}개 제외) 도달` });
      continue;
    }
    // 실패해도 조회 시도만으로 한도가 소모될 수 있으므로 시도 시점에 센다.
    if (isNew) { newUsed += 1; recent.add(entry.tag.toLocaleLowerCase()); }
    try {
      const measure = await measureHashtagPulse(accountId, entry.tag);
      items.push({ ...measure, origin: entry.origin, keyword: entry.meta?.keyword, category: entry.meta?.category, summary: entry.meta?.summary, sources: entry.meta?.sources ?? [], found: Boolean(measure.hashtagId), usedQuota: isNew });
    } catch (error) {
      // 토큰 만료·호출 제한은 이후 요청도 실패하므로 즉시 중단한다.
      if (error instanceof MetaGraphError && (error.reason === "META_TOKEN_EXPIRED" || error.reason === "META_RATE_LIMITED")) throw error;
      failed.push({ tag: entry.tag, reason: error instanceof Error ? error.message : "측정 실패" });
    }
  }
  items.sort((a, b) => (b.perHour ?? -1) - (a.perHour ?? -1));
  // 표시용 사용량은 Meta가 실제로 기록한 값으로 다시 읽는다(실패한 조회가 소모됐는지 알 수 없으므로).
  const usedAfter = await getRecentlySearchedHashtags(accountId).then((tags) => tags.length).catch(() => recent.size);

  return {
    generatedAt: new Date().toISOString(), promptVersion: IG_PULSE_PROMPT_VERSION, model: discovery?.model ?? null,
    items, deferred, failed, droppedUnverified: discovery?.droppedUnverified ?? 0, searchedSources: discovery?.searchedSources ?? 0,
    quota: { limit: HASHTAG_WEEKLY_LIMIT, reserve: QUOTA_RESERVE, usedBefore, usedAfter },
    methodology: [
      "Instagram Graph API는 해시태그의 전체 게시물 수를 제공하지 않습니다. 여기 수치는 recent_media(최근 24시간 공개 게시물)를 직접 넘겨받아 센 값입니다.",
      "최근 게시물을 끝까지 받은 태그는 24시간 게시물 수가 정확하고, 시간당 속도는 24시간 평균입니다.",
      "게시물이 많아 일부만 받은 태그(최대 300개)는 받은 표본이 걸친 최근 몇 시간의 속도이며, 24시간 수는 '이상'으로 표시합니다. 측정 시각(낮·밤)에 따라 달라질 수 있습니다.",
      "전일 대비 변화는 같은 태그를 20시간 이상 간격으로 다시 측정했을 때만 계산합니다. 측정 방식이 다르면 비교하지 않습니다.",
      "후보는 OpenAI 웹 검색으로 찾았고, 검색 도구가 실제로 조회한 URL을 인용한 후보만 남겼습니다. 추적 중인 태그는 웹 검색 없이 다시 측정합니다.",
      `Meta는 7일간 고유 해시태그 ${HASHTAG_WEEKLY_LIMIT}개까지만 조회를 허용합니다. 이미 조회한 태그는 다시 조회해도 한도를 쓰지 않으며, ${QUOTA_RESERVE}개는 수동 검색용으로 남겨 둡니다.`,
    ],
  };
}
