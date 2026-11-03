import type { EvidenceItem } from "./schemas";

/** Remove duplicate URLs or effectively identical records before they reach the model. */
/**
 * 중복 판정용 URL: 조각(#)과 추적용 파라미터(utm_*, fbclid 등)만 지운다.
 * 쿼리 전체를 지우면 youtube.com/watch?v=… 처럼 쿼리가 곧 문서 ID인 URL이 모두 하나로 합쳐진다.
 */
const TRACKING_PARAM = /^(utm_.+|fbclid|gclid|igshid|si|feature|ref|ref_src)$/i;
export function normalizeEvidenceUrl(value: string) {
  try {
    const url = new URL(value);
    [...url.searchParams.keys()].filter((key) => TRACKING_PARAM.test(key)).forEach((key) => url.searchParams.delete(key));
    url.searchParams.sort();
    const query = url.searchParams.toString();
    return `${url.host}${url.pathname}`.replace(/\/$/, "").toLocaleLowerCase() + (query ? `?${query}` : "");
  } catch {
    return value.replace(/#.*$/, "").replace(/\/$/, "").toLocaleLowerCase();
  }
}

export function dedupeEvidence(evidence: EvidenceItem[]) {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const normalizedUrl = item.url ? normalizeEvidenceUrl(item.url) : "";
    const normalizedText = `${item.kind}|${item.title}|${item.excerpt}`.toLocaleLowerCase().replace(/\s+/g, " ").trim();
    const key = normalizedUrl ? `${item.kind}|url:${normalizedUrl}` : normalizedText;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const normalized = (value: string) => value.toLocaleLowerCase("ko-KR").replace(/&[^;]+;/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Query relevance based only on public snippet text; view count is deliberately excluded. */
export function youtubeResultRelevant(query: string, title: string, description = "") {
  const haystack = normalized(`${title} ${description}`).replace(/\s+/g, "");
  const compactQuery = normalized(query).replace(/\s+/g, "");
  const tokens = normalized(query).split(/\s+/).filter((token) => token.length >= 2);
  return Boolean(compactQuery && (haystack.includes(compactQuery) || tokens.some((token) => haystack.includes(token))));
}
