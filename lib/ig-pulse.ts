import "server-only";
import { z } from "zod";
import { callStructured, js } from "./openai-client";
import { getRecentlySearchedHashtags, HASHTAG_WEEKLY_LIMIT, measureHashtagPulse, MetaGraphError, normalizeHashtagName, resolveIgAccountId } from "./meta";
import type { IgPulseCandidate, IgPulseItem, IgPulseReport } from "./types";

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

export type IgPulseRequest = { track: string[]; add: string[]; discover: boolean; allowNew: boolean; queue?: IgPulseCandidate[] };
/** RESCAN 진행 단계(화면 표시용). discover: 새 후보 탐색 · measure: 태그 측정 · rank: 순위 계산 */
export type IgPulseProgress = { stage: "discover" } | { stage: "measure"; done: number; total: number } | { stage: "rank" };
type Plan = { tag: string; origin: IgPulseItem["origin"]; isNew: boolean; candidate?: IgPulseCandidate };

/**
 * 측정 순서
 * - 신규 검색 승인 ON: 직접 추가한 태그 → 지난 스캔 대기열 → 이번 웹 후보 중 **아직 조회하지 않은 신규 태그**를 먼저(스캔당 4개·주간 예비분 안에서),
 *   그다음 이미 조회한 후보와 추적 태그를 한도 없이 다시 잰다(스캔당 최대 10개).
 * - 신규 검색 승인 OFF: 추적 태그만 다시 잰다. 웹 후보 탐색을 하지 않는다.
 * 한도를 넘는 신규 후보는 호출하지 않고 deferred에 후보 정보와 함께 돌려준다(클라이언트가 다음 스캔 대기열로 보관).
 */
export async function scanIgPulse(request: IgPulseRequest, onProgress: (event: IgPulseProgress) => void = () => {}): Promise<IgPulseReport> {
  const accountId = await resolveIgAccountId();
  const recentRecords = await getRecentlySearchedHashtags(accountId);
  const knownIds = new Map(recentRecords.map((item) => [item.name, item.id]));
  const recent = new Set(knownIds.keys());
  const usedBefore = recent.size;
  const discovering = request.discover && request.allowNew;
  if (discovering) onProgress({ stage: "discover" });
  const discovery = discovering ? await discoverCandidates(new Date().toISOString().slice(0, 10)) : null;

  const normalize = (tag: string) => { try { return normalizeHashtagName(tag); } catch { return null; } };
  const trackedKeys = new Set(request.track.flatMap((tag) => { const n = normalize(tag); return n ? [n.toLocaleLowerCase()] : []; }));
  const seen = new Set<string>();
  const newPlan: Plan[] = [], knownPlan: Plan[] = [];
  let newCandidates = 0, knownCandidates = 0;
  const candidateKeys = new Set<string>();
  const push = (tag: string, origin: Plan["origin"], candidate?: IgPulseCandidate) => {
    const normalized = normalize(tag);
    if (!normalized) return;
    const key = normalized.toLocaleLowerCase();
    const isNew = !recent.has(key);
    // 후보 분류는 중복과 별개로 한 번만 센다: 추적·최근 조회에 없는 태그만 '신규 후보'.
    if (origin === "discovered" && !candidateKeys.has(key)) { candidateKeys.add(key); if (isNew && !trackedKeys.has(key)) newCandidates += 1; else knownCandidates += 1; }
    if (seen.has(key)) return;
    seen.add(key);
    (isNew ? newPlan : knownPlan).push({ tag: normalized, origin, isNew, candidate: candidate ? { ...candidate, tag: normalized } : undefined });
  };
  // 추적 태그를 먼저 등록해 후보와 겹쳐도 '추적'으로 남긴다. 측정 순서는 아래 plan이 정한다(신규 먼저).
  request.add.forEach((tag) => push(tag, "manual"));
  request.track.forEach((tag) => push(tag, "tracked"));
  if (request.allowNew) (request.queue ?? []).forEach((candidate) => push(candidate.tag, "discovered", candidate));
  discovery?.candidates.forEach((candidate) => push(candidate.tag, "discovered", candidate));
  // 신규 후보를 먼저 재고, 이미 조회한 태그(한도 미사용)는 남는 자리에 잰다.
  const plan = request.allowNew ? [...newPlan, ...knownPlan] : [...knownPlan, ...newPlan];

  const deferred: IgPulseReport["deferred"] = [];
  const failed: IgPulseReport["failed"] = [];
  const items: IgPulseItem[] = [];
  let newUsed = 0;
  const defer = (entry: Plan, reason: string) => deferred.push({ tag: entry.tag, reason, ...(entry.origin === "discovered" && entry.candidate ? { candidate: entry.candidate } : {}) });
  const measurable = plan.filter((entry) => !entry.isNew || request.allowNew).length;
  for (const entry of plan) {
    if (items.length + failed.length >= MAX_TAGS_PER_SCAN) { defer(entry, `스캔당 최대 ${MAX_TAGS_PER_SCAN}개`); continue; }
    if (entry.isNew && !request.allowNew) { defer(entry, "신규 해시태그 검색 승인이 필요합니다"); continue; }
    if (entry.isNew && (newUsed >= MAX_NEW_PER_SCAN || recent.size >= HASHTAG_WEEKLY_LIMIT - QUOTA_RESERVE)) {
      // 한도를 넘으면 이 태그는 호출하지 않는다(다음 스캔 대기).
      defer(entry, newUsed >= MAX_NEW_PER_SCAN ? `새 태그는 스캔당 최대 ${MAX_NEW_PER_SCAN}개` : `주간 해시태그 한도(${HASHTAG_WEEKLY_LIMIT}개 중 예비 ${QUOTA_RESERVE}개 제외) 도달`);
      continue;
    }
    onProgress({ stage: "measure", done: items.length + failed.length, total: Math.min(measurable, MAX_TAGS_PER_SCAN) });
    // 실패해도 조회 시도만으로 한도가 소모될 수 있으므로 시도 시점에 센다.
    if (entry.isNew) { newUsed += 1; recent.add(entry.tag.toLocaleLowerCase()); }
    try {
      const measure = await measureHashtagPulse(accountId, entry.tag, knownIds.get(entry.tag.toLocaleLowerCase()));
      items.push({ ...measure, origin: entry.origin, keyword: entry.candidate?.keyword, category: entry.candidate?.category, summary: entry.candidate?.summary, sources: entry.candidate?.sources ?? [], found: Boolean(measure.hashtagId), usedQuota: entry.isNew, searchKind: entry.isNew ? "new" : "refresh" });
    } catch (error) {
      // 토큰 만료·호출 제한은 이후 요청도 실패하므로 즉시 중단한다.
      if (error instanceof MetaGraphError && (error.reason === "META_TOKEN_EXPIRED" || error.reason === "META_RATE_LIMITED")) throw error;
      failed.push({ tag: entry.tag, reason: error instanceof Error ? error.message : "측정 실패" });
    }
  }
  onProgress({ stage: "rank" });
  items.sort((a, b) => (b.perHour ?? -1) - (a.perHour ?? -1));
  // 표시용 사용량은 Meta가 실제로 기록한 값으로 다시 읽는다(실패한 조회가 소모됐는지 알 수 없으므로).
  const refreshed = await getRecentlySearchedHashtags(accountId, true).catch(() => null);
  const usedAfter = refreshed?.length ?? recent.size;

  return {
    generatedAt: new Date().toISOString(), promptVersion: IG_PULSE_PROMPT_VERSION, model: discovery?.model ?? null,
    items, deferred, failed, droppedUnverified: discovery?.droppedUnverified ?? 0, searchedSources: discovery?.searchedSources ?? 0,
    scan: {
      mode: discovering ? "discover" : "refresh", discovered: discovery?.candidates.length ?? 0, newCandidates, knownCandidates,
      measured: items.length + failed.length, added: items.filter((item) => item.usedQuota && item.found && item.origin !== "tracked").length,
      deferredNew: deferred.filter((item) => item.candidate).length,
    },
    quota: {
      limit: HASHTAG_WEEKLY_LIMIT, reserve: QUOTA_RESERVE, usedBefore, usedAfter,
      source: refreshed ? "meta_api" : "local_fallback",
      checkedAt: new Date().toISOString(),
      recent: refreshed?.map((item) => ({ tag: item.name, hashtagId: item.id })) ?? recentRecords.map((item) => ({ tag: item.name, hashtagId: item.id })),
    },
    methodology: [
      "Instagram Graph API는 해시태그의 전체 게시물 수를 제공하지 않습니다. 여기 수치는 recent_media(최근 24시간 공개 게시물)를 직접 넘겨받아 센 값입니다.",
      "최근 게시물을 끝까지 받은 태그는 24시간 게시물 수가 정확하고, 시간당 속도는 24시간 평균입니다.",
      "게시물이 많아 일부만 받은 태그(최대 300개)는 받은 표본이 걸친 최근 몇 시간의 속도이며, 24시간 수는 '이상'으로 표시합니다. 측정 시각(낮·밤)에 따라 달라질 수 있습니다.",
      "전일 대비 변화는 같은 태그를 20시간 이상 간격으로 다시 측정했을 때만 계산합니다. 측정 방식이 다르면 비교하지 않습니다.",
      "신규 해시태그 검색은 기본 비활성화이며 사용자가 명시적으로 승인한 경우에만 실행합니다. 승인하면 아직 조회하지 않은 신규 후보를 먼저 재고, 한도를 넘는 후보는 호출하지 않고 다음 스캔으로 넘깁니다. 추적 중인 기존 태그는 저장된 hashtag ID로 갱신합니다.",
      "후보는 사용자가 신규 검색을 승인한 RESCAN에서만 OpenAI 웹 검색으로 찾습니다. 검색 도구가 실제로 조회한 URL을 인용한 후보만 남깁니다.",
      `Meta는 7일간 고유 해시태그 ${HASHTAG_WEEKLY_LIMIT}개까지만 조회를 허용합니다. 이미 조회한 태그는 다시 조회해도 한도를 쓰지 않으며, ${QUOTA_RESERVE}개는 수동 검색용으로 남겨 둡니다.`,
    ],
  };
}
