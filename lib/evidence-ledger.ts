import "server-only";
import type { EvidenceItem, SeriesStats } from "./schemas";
import type { NaverTrendSignal } from "./naver";
import type { HashtagSearchResult } from "./meta";
export { dedupeEvidence } from "./evidence-quality";

const MAX_INSTAGRAM_EVIDENCE = 10;

export function naverEvidence(signal: NaverTrendSignal, stats: SeriesStats[]): EvidenceItem[] {
  return signal.series.map((series, index) => {
    const stat = stats.find((item) => item.title === series.title);
    const summary = stat ? `평균 ${stat.mean}, 최고 ${stat.peak.ratio}(${stat.peak.period}), 최근 ${stat.latest.ratio}(${stat.latest.period}), 초기 1/3 평균 ${stat.earlyAvg} → 최근 1/3 평균 ${stat.recentAvg} (${stat.direction})` : "";
    return {
      id: `NAVER-${String(index + 1).padStart(2, "0")}`,
      kind: "naver_series" as const,
      title: `"${series.title}" 상대 검색 관심도 (${signal.timeUnit})`,
      source: "NAVER DataLab Search Trend",
      url: "https://datalab.naver.com/keyword/trendSearch.naver",
      date: `${signal.startDate}~${signal.endDate}`,
      collectedAt: signal.collectedAt,
      excerpt: `${summary}.${stat?.partialLastExcluded ? " 마지막 구간은 진행 중이라 추세 계산에서 제외." : ""} 같은 요청의 키워드 그룹 간에만 비교 가능한 상대 지수이며 절대 검색량이 아님.`.slice(0, 800),
    };
  });
}

export function instagramEvidence(result: HashtagSearchResult): EvidenceItem[] {
  const seen = new Set<string>();
  const items: EvidenceItem[] = [];
  const push = (edge: "recent_media" | "top_media", media: HashtagSearchResult["recentMedia"][number]) => {
    if (seen.has(media.id) || items.length >= MAX_INSTAGRAM_EVIDENCE) return;
    seen.add(media.id);
    const caption = (media.caption || "").replace(/\s+/g, " ").trim();
    items.push({
      id: `IG-${String(items.length + 1).padStart(2, "0")}`,
      kind: "instagram_media",
      title: `Instagram #${result.query} ${edge} · ${media.media_type || "MEDIA"}`,
      source: "Meta Instagram Graph API (Hashtag Search)",
      url: media.permalink,
      date: media.timestamp,
      collectedAt: result.collectedAt,
      excerpt: caption ? caption.slice(0, 300) : "(캡션 없음)",
    });
  };
  // top/recent을 번갈아 넣어 한쪽 표본에 치우치지 않게 한다.
  const max = Math.max(result.recentMedia.length, result.topMedia.length);
  for (let i = 0; i < max; i += 1) {
    if (result.topMedia[i]) push("top_media", result.topMedia[i]);
    if (result.recentMedia[i]) push("recent_media", result.recentMedia[i]);
  }
  return items;
}

/** 프롬프트에 넣을 간결한 원장 텍스트 */
export function ledgerForPrompt(evidence: EvidenceItem[]) {
  return evidence.map((item) => ({ id: item.id, kind: item.kind, title: item.title, date: item.date, excerpt: item.excerpt }));
}

export function toHashtag(keyword: string) {
  return keyword.replace(/^#/, "").replace(/\s+/g, "").trim();
}
