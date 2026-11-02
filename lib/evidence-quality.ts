import type { EvidenceItem } from "./schemas";

/** Remove duplicate URLs or effectively identical records before they reach the model. */
export function dedupeEvidence(evidence: EvidenceItem[]) {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const normalizedUrl = item.url?.replace(/[?#].*$/, "").replace(/\/$/, "").toLocaleLowerCase() ?? "";
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
