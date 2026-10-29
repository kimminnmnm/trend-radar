import "server-only";
import { z } from "zod";
import { callStructured, js } from "./openai-client";
import { collectNaverTrend, type NaverTrendSignal } from "./naver";
import { computeSeriesStats } from "./signal";
import type { NowTrendItem, NowTrendReport } from "./types";

export const TREND_NOW_PROMPT_VERSION = "now-2030-v3";
/** NAVER 연령 구간: 19–24, 25–29, 30–34, 35–39 */
export const AGES_2030 = ["3", "4", "5", "6"];
const MAX_CANDIDATES = 13; // 5 + 4 + 4: 앵커를 포함한 NAVER 요청 3회
const NAVER_BATCH = 5;

const candidateSchema = z.object({ candidates: z.array(z.object({ keyword: z.string(), category: z.string(), summary: z.string(), sourceUrls: z.array(z.string()) })) });
const candidateJsonSchema = js.obj({ candidates: js.arr(js.obj({ keyword: js.str, category: js.str, summary: js.str, sourceUrls: js.strArr })) });

const normalizeKeyword = (value: string) => value.replace(/^#/, "").replace(/\s+/g, " ").trim();
const normalizeUrl = (value: string) => value.replace(/[?#].*$/, "").replace(/\/$/, "");
const MAX_PER_DOMAIN = 3;
const LOW_PRECISION_ANCHOR = 5;
const hostname = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

/** 1단계: 웹 검색으로 후보 수집. 도구가 실제로 조회한 URL을 인용한 후보만 남긴다. */
async function collectCandidates(today: string) {
  const { data, model, sources } = await callStructured({
    name: "trend_now_candidates", jsonSchema: candidateJsonSchema, validator: candidateSchema, webSearch: true, maxOutputTokens: 5000,
    instructions: [
      "You collect candidate trend keywords for Korean people in their 20s and 30s. Use web search and rely only on what you find.",
      `Today is ${today}. Run several different searches (e.g. 2030 트렌드, MZ세대 요즘 유행, 20대 인기, 30대 관심사, 트렌드 리포트) and prefer sources published within the last 90 days.`,
      "Use news articles, research or consumer trend reports, and platform trend reports from at least 5 different domains. Do not use shopping product listings, coupon pages, or SEO spam blogs.",
      "Return 12-15 distinct candidates across lifestyle, food, fashion, beauty, entertainment, tech, hobbies, sports, travel.",
      "keyword: the commonly searched Korean name of the trend itself, 1-3 words (e.g. a sport, food, item, place type, app, or activity). Not a description, not a seasonal phrase, no hashtags, no brand slogans.",
      "summary: one Korean sentence on why the source calls it a trend. Do not invent numbers.",
      "sourceUrls: URLs you actually opened or found in search results that mention the keyword. Never fabricate URLs.",
    ].join(" "),
    input: `${today} 기준 한국 20대·30대 트렌드 키워드 후보를 웹에서 찾아 주세요.`,
  });
  const found = new Map(sources.map((source) => [normalizeUrl(source.url), source]));
  const seen = new Set<string>();
  const perDomain = new Map<string, number>();
  let droppedUnverified = 0;
  const candidates = data.candidates.flatMap((candidate) => {
    const keyword = normalizeKeyword(candidate.keyword);
    const key = keyword.toLocaleLowerCase("ko-KR");
    if (!keyword || keyword.length > 30 || seen.has(key)) return [];
    const verified = candidate.sourceUrls.map((url) => found.get(normalizeUrl(url))).filter((source): source is { url: string; title?: string } => Boolean(source));
    if (!verified.length) { droppedUnverified += 1; return []; }
    // 한 출처에 후보가 몰리지 않도록 도메인당 최대 3개
    const domain = hostname(verified[0].url);
    if ((perDomain.get(domain) ?? 0) >= MAX_PER_DOMAIN) return [];
    perDomain.set(domain, (perDomain.get(domain) ?? 0) + 1);
    seen.add(key);
    return [{ keyword, category: candidate.category, summary: candidate.summary, sources: verified.slice(0, 3) }];
  }).slice(0, MAX_CANDIDATES);
  return { candidates, model, droppedUnverified, searchedSources: sources.length };
}

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/**
 * 2단계: NAVER 19–39세 검색 관심도로 검증.
 * 요청당 5개 제한 때문에 첫 배치에서 평균이 가장 높은 키워드를 앵커로 두고, 이후 배치에 앵커를 함께 넣어 첫 배치 척도로 환산한다.
 */
async function validateWithNaver(keywords: string[]) {
  const batches: NaverTrendSignal[] = [];
  const first = await collectNaverTrend(keywords[0], keywords.slice(0, NAVER_BATCH), 3, { ages: AGES_2030 });
  batches.push(first);
  const firstMeans = new Map(first.series.map((series) => [series.title, mean(series.data.map((point) => point.ratio))]));
  const anchor = [...firstMeans.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const rest = keywords.slice(NAVER_BATCH);
  for (let i = 0; anchor && i < rest.length; i += NAVER_BATCH - 1) batches.push(await collectNaverTrend(anchor, [anchor, ...rest.slice(i, i + NAVER_BATCH - 1)], 3, { ages: AGES_2030 }));

  const items = new Map<string, { series: Array<{ period: string; value: number }>; batch: number; scale: number; precision: "exact" | "estimated" | "low" }>();
  batches.forEach((batch, index) => {
    const anchorSeries = batch.series.find((series) => series.title === anchor);
    const anchorMean = anchorSeries ? mean(anchorSeries.data.map((point) => point.ratio)) : 0;
    const scale = index === 0 ? 1 : anchorMean > 0 ? (firstMeans.get(anchor!) ?? 0) / anchorMean : NaN;
    // 배치 안에 앵커보다 훨씬 큰 키워드가 있으면 앵커 값이 작아져 환산 오차가 커진다.
    const precision = index === 0 ? "exact" as const : anchorMean >= LOW_PRECISION_ANCHOR ? "estimated" as const : "low" as const;
    for (const series of batch.series) {
      if (index > 0 && series.title === anchor) continue;
      items.set(series.title, { batch: index + 1, scale, precision, series: series.data.map((point) => ({ period: point.period, value: Math.round(point.ratio * (Number.isFinite(scale) ? scale : 1) * 10) / 10 })) });
    }
  });
  return { items, anchor, period: { startDate: first.startDate, endDate: first.endDate, timeUnit: first.timeUnit } };
}

export async function scanTrendNow(): Promise<NowTrendReport> {
  const today = new Date().toISOString().slice(0, 10);
  const { candidates, model, droppedUnverified, searchedSources } = await collectCandidates(today);
  if (!candidates.length) throw new Error("검증 가능한 출처를 가진 후보를 찾지 못했습니다.");
  const { items: validated, anchor, period } = await validateWithNaver(candidates.map((candidate) => candidate.keyword));

  const items: NowTrendItem[] = [];
  const insufficient: NowTrendReport["insufficient"] = [];
  for (const candidate of candidates) {
    const result = validated.get(candidate.keyword);
    if (!result) { insufficient.push({ keyword: candidate.keyword, reason: "NAVER가 시계열을 반환하지 않았습니다." }); continue; }
    if (!Number.isFinite(result.scale)) { insufficient.push({ keyword: candidate.keyword, reason: "앵커 값이 0이라 다른 배치와 척도를 맞출 수 없습니다." }); continue; }
    const [stats] = computeSeriesStats([{ title: candidate.keyword, data: result.series.map((point) => ({ period: point.period, ratio: point.value })) }], { endDate: period.endDate, timeUnit: period.timeUnit });
    if (stats.mean < 1 || stats.direction === "데이터 부족") { insufficient.push({ keyword: candidate.keyword, reason: "19–39세 검색 관심도가 거의 없거나 데이터가 부족합니다." }); continue; }
    const changePct = stats.earlyAvg > 0 ? Math.round(((stats.recentAvg - stats.earlyAvg) / stats.earlyAvg) * 1000) / 10 : null;
    items.push({ ...candidate, stats, series: result.series, batch: result.batch, scale: Math.round(result.scale * 1000) / 1000, levelPrecision: result.precision, changePct });
  }
  // 순위: 상승률(최근 1/3 평균 ÷ 초기 1/3 평균). 한 시계열 안의 비율이라 배치 간 척도 환산의 영향을 받지 않는다.
  items.sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));

  return {
    generatedAt: new Date().toISOString(), model, promptVersion: TREND_NOW_PROMPT_VERSION,
    audience: { ages: AGES_2030, label: "NAVER 연령 구간 19–24 · 25–29 · 30–34 · 35–39세" },
    period, anchor, items, insufficient, droppedUnverified, searchedSources,
    methodology: [
      "후보는 OpenAI 웹 검색으로 수집했으며, 검색 도구가 실제로 조회한 URL을 인용한 후보만 남겼습니다.",
      "검증 수치는 NAVER DataLab 검색어 트렌드(19–39세 필터)의 상대 지수이며 절대 검색량이 아닙니다.",
      "순위는 각 키워드 자체의 상승률(최근 1/3 평균 ÷ 초기 1/3 평균)입니다. 한 시계열 안의 비율이라 배치 간 척도와 무관합니다.",
      `관심도 수준은 NAVER 요청당 5개 제한 때문에 '${anchor ?? "-"}'를 앵커로 첫 배치 척도에 환산한 값입니다. 배치 2 이후는 추정치이고, 앵커가 작게 잡힌 배치는 정밀도가 낮습니다.`,
      "약 3개월 비교라 계절 요인(예: 가을 의류)이 상승으로 보일 수 있습니다. 진행 중인 마지막 주는 계산에서 제외했습니다.",
      "수집된 후보 안에서의 상대 비교이며, 한국 2030 전체의 트렌드 순위가 아닙니다.",
    ],
  };
}
