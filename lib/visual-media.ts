import { z } from "zod";
import type { EvidenceItem } from "./schemas";

/*
 * PHASE V1 공통 미디어 메타데이터.
 * - 실제 수집한 자료(YouTube Data API, Instagram Graph API, 실제 웹 페이지의 og:image)만 담는다. 이미지를 만들거나 추측하지 않는다.
 * - 이미지는 원본 플랫폼 URL을 그대로 표시한다(서버에 복제·저장하지 않음).
 * - analysisStatus는 V3 Visual DNA를 위한 자리다. 이번 MVP에서는 항상 "not-analyzed".
 */
export const mediaPlatformSchema = z.enum(["youtube", "instagram", "web"]);
export const mediaStatusSchema = z.enum(["SOURCE OBSERVED", "AI INTERPRETATION", "DEMO", "UNAVAILABLE"]);
export const visualMediaSchema = z.object({
  mediaId: z.string().min(3).max(200),
  trendId: z.string().min(1),
  mediaType: z.enum(["video", "image", "carousel", "page"]),
  platform: mediaPlatformSchema,
  sourceUrl: z.string().url().max(800),
  thumbnailUrl: z.string().url().max(1200).nullable(),
  /** 썸네일을 어떻게 얻었는지. 추측으로 만든 URL은 없다. */
  thumbnailOrigin: z.enum(["youtube-api", "youtube-video-id", "instagram-media-url", "og:image"]).nullable(),
  title: z.string().max(300),
  description: z.string().max(800).optional(),
  author: z.string().max(200).optional(),
  publishedAt: z.string().max(40).optional(),
  collectedAt: z.string().max(40),
  /** 플랫폼이 실제로 돌려준 지표만. 없으면 비워 둔다. */
  metrics: z.object({ views: z.number().int().nonnegative().optional() }).optional(),
  evidenceIds: z.array(z.string()),
  dataStatus: mediaStatusSchema,
  /** 사용 권한: 공식 임베드/썸네일 허용(platform-embed), 원문 링크만(link-only), 확인 불가(unknown). 내려받아 재배포하지 않는다. */
  usageRights: z.enum(["platform-embed", "link-only", "unknown"]),
  analysisStatus: z.enum(["not-analyzed", "queued", "analyzed"]),
});
export type VisualMedia = z.infer<typeof visualMediaSchema>;
export type MediaPlatform = z.infer<typeof mediaPlatformSchema>;

/* ---------- URL 검증 ---------- */

const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^22[4-9]\./, /^2[3-5]\d\./];
/** 사설·루프백·링크로컬·멀티캐스트 주소(IPv4/IPv6). SSRF 방지에 쓴다. */
export function isPrivateAddress(address: string) {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) return PRIVATE_V4.some((pattern) => pattern.test(value));
  if (value.includes(":")) {
    const mapped = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return value === "::1" || value === "::" || /^f[cd]/.test(value) || /^fe[89ab]/.test(value) || /^ff/.test(value);
  }
  return false;
}

/** https, 기본 포트, 공개 호스트 이름만 허용한다. 계정 정보가 들어 있는 URL·IP 직접 지정 사설 주소·localhost는 거부한다. */
export function safeHttpsUrl(value: unknown, allowedHosts?: RegExp): string | null {
  if (typeof value !== "string" || value.length > 1200) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || isPrivateAddress(host)) return null;
  if (allowedHosts && !allowedHosts.test(host)) return null;
  return url.toString();
}

const YOUTUBE_HOSTS = /^(www\.|m\.)?youtube\.com$|^youtu\.be$/;
const YOUTUBE_THUMB_HOSTS = /^i\d?\.ytimg\.com$/;
const INSTAGRAM_HOSTS = /^(www\.)?instagram\.com$/;
const INSTAGRAM_CDN = /(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$/;

/** YouTube 영상 URL에서 11자리 영상 ID를 꺼낸다. 형식이 맞지 않으면 null. */
export function youtubeIdFromUrl(value: string | undefined) {
  const url = safeHttpsUrl(value, YOUTUBE_HOSTS);
  if (!url) return null;
  const parsed = new URL(url);
  const id = parsed.hostname === "youtu.be" ? parsed.pathname.slice(1) : parsed.pathname === "/watch" ? parsed.searchParams.get("v") : parsed.pathname.startsWith("/shorts/") ? parsed.pathname.split("/")[2] : null;
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
/** YouTube가 공개 영상마다 제공하는 표준 썸네일 주소(API의 thumbnails.high와 같은 형식). */
export const youtubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const safeYouTubeThumbnail = (value: unknown) => safeHttpsUrl(value, YOUTUBE_THUMB_HOSTS);
export const safeInstagramMediaUrl = (value: unknown) => safeHttpsUrl(value, INSTAGRAM_CDN);
export const safeInstagramPermalink = (value: unknown) => safeHttpsUrl(value, INSTAGRAM_HOSTS);

/* ---------- 변환 ---------- */

type YouTubeVideoLike = { id: string; title: string; channelTitle?: string; publishedAt?: string; viewCount?: number | null; url: string; thumbnailUrl?: string };
type InstagramMediaLike = { permalink?: string; media_url?: string; media_type?: string; timestamp?: string; caption?: string };

/** YouTube Data API는 제목·채널명을 HTML 이스케이프해 돌려준다(&amp; &#39; 등). 표시용으로 되돌린다(태그는 해석하지 않음). */
export function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith("#x")) { const n = parseInt(lower.slice(2), 16); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match; }
    if (lower.startsWith("#")) { const n = Number(lower.slice(1)); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match; }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[lower] ?? match;
  });
}

const parseViews = (excerpt: string) => { const match = excerpt.match(/조회수\s*([\d,]+)회/); return match ? Number(match[1].replace(/,/g, "")) : undefined; };
const channelFromSource = (source: string) => source.split("·").slice(1).join("·").trim() || undefined;

/** 근거 원장과(있으면) 원본 수집 결과로 미디어 목록을 만든다. 클라우드에서 복원한 분석(근거 원장만 있음)에서도 동작한다. */
export function mediaFromEvidence(params: { trendId: string; evidence: EvidenceItem[]; videos?: YouTubeVideoLike[]; instagram?: InstagramMediaLike[]; webImages?: Record<string, string> }): VisualMedia[] {
  const { trendId, evidence } = params;
  const videoById = new Map((params.videos ?? []).map((video) => [video.id, video]));
  const igByPermalink = new Map((params.instagram ?? []).filter((item) => item.permalink).map((item) => [item.permalink!, item]));
  const out: VisualMedia[] = [];
  for (const item of evidence) {
    if (item.kind === "youtube_video") {
      const id = youtubeIdFromUrl(item.url);
      if (!id) continue;
      const video = videoById.get(id);
      const apiThumb = safeYouTubeThumbnail(video?.thumbnailUrl);
      const views = video?.viewCount ?? parseViews(item.excerpt);
      out.push({
        mediaId: `youtube:${id}`, trendId, mediaType: "video", platform: "youtube", sourceUrl: `https://www.youtube.com/watch?v=${id}`,
        thumbnailUrl: apiThumb ?? youtubeThumbnail(id), thumbnailOrigin: apiThumb ? "youtube-api" : "youtube-video-id",
        title: decodeEntities(video?.title ?? item.title), author: (() => { const name = video?.channelTitle ?? channelFromSource(item.source); return name ? decodeEntities(name) : undefined; })(), publishedAt: video?.publishedAt ?? item.date, collectedAt: item.collectedAt,
        metrics: typeof views === "number" && Number.isFinite(views) ? { views } : undefined,
        evidenceIds: [item.id], dataStatus: "SOURCE OBSERVED", usageRights: "platform-embed", analysisStatus: "not-analyzed",
      });
    } else if (item.kind === "instagram_media") {
      const permalink = safeInstagramPermalink(item.url);
      if (!permalink) continue;
      const raw = igByPermalink.get(item.url!) ?? igByPermalink.get(permalink);
      // VIDEO는 media_url이 영상 파일이므로 썸네일로 쓰지 않는다. 확인된 이미지 URL만 쓴다.
      const image = raw && raw.media_type !== "VIDEO" ? safeInstagramMediaUrl(raw.media_url) : null;
      const type = /CAROUSEL/i.test(item.title) ? "carousel" : /VIDEO|REELS/i.test(item.title) ? "video" : "image";
      out.push({
        mediaId: `instagram:${permalink}`, trendId, mediaType: type, platform: "instagram", sourceUrl: permalink,
        thumbnailUrl: image, thumbnailOrigin: image ? "instagram-media-url" : null,
        title: item.title, description: item.excerpt, publishedAt: item.date, collectedAt: item.collectedAt,
        evidenceIds: [item.id], dataStatus: image ? "SOURCE OBSERVED" : "UNAVAILABLE", usageRights: "link-only", analysisStatus: "not-analyzed",
      });
    } else if (item.kind === "web_source") {
      const page = safeHttpsUrl(item.url);
      if (!page) continue;
      const image = safeHttpsUrl(params.webImages?.[page] ?? params.webImages?.[item.url!]);
      out.push({
        mediaId: `web:${page}`, trendId, mediaType: "page", platform: "web", sourceUrl: page,
        thumbnailUrl: image, thumbnailOrigin: image ? "og:image" : null,
        title: item.title, description: item.excerpt, author: item.source, publishedAt: item.date, collectedAt: item.collectedAt,
        evidenceIds: [item.id], dataStatus: image ? "SOURCE OBSERVED" : "UNAVAILABLE", usageRights: image ? "unknown" : "link-only", analysisStatus: "not-analyzed",
      });
    }
  }
  return dedupeMedia(out);
}

const canonical = (url: string) => { try { const parsed = new URL(url); parsed.hash = ""; return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}${parsed.hostname.includes("youtube") ? `?v=${parsed.searchParams.get("v") ?? ""}` : ""}`; } catch { return url; } };
/** 같은 미디어 ID·같은 원본 URL은 하나로 합친다(근거 ID는 모두 유지). */
export function dedupeMedia(items: VisualMedia[]) {
  const byKey = new Map<string, VisualMedia>();
  for (const item of items) {
    const key = item.mediaId.startsWith("youtube:") ? item.mediaId : canonical(item.sourceUrl);
    const prev = byKey.get(key) ?? [...byKey.values()].find((value) => value.mediaId === item.mediaId);
    if (!prev) { byKey.set(key, item); continue; }
    byKey.set(key, { ...prev, evidenceIds: [...new Set([...prev.evidenceIds, ...item.evidenceIds])], thumbnailUrl: prev.thumbnailUrl ?? item.thumbnailUrl, thumbnailOrigin: prev.thumbnailOrigin ?? item.thumbnailOrigin });
  }
  return [...byKey.values()];
}

/* ---------- 순위 ---------- */

export const MEDIA_RANK_WEIGHTS = { relevance: 0.45, reliability: 0.2, recency: 0.2, completeness: 0.15 } as const;
const RELIABILITY: Record<VisualMedia["platform"], number> = { youtube: 0.8, instagram: 0.8, web: 0.7 };
const norm = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s#·_\-]/g, "");

/**
 * 표시 순서 점수(0~1). 조회수는 관련성으로 쓰지 않는다(인기와 관련성은 다름).
 *  relevance    제목·설명에 트렌드 이름/키워드가 실제로 있으면 1, 없으면 0.3(근거 원장에 포함된 자료라 최소 관련)
 *  reliability  공식 API 0.8, 웹 페이지 0.7
 *  recency      기준 시각으로부터 0일 1 → 180일 이상 0
 *  completeness 썸네일·제목·게시일·작성자 중 있는 비율
 */
export function rankMedia(items: VisualMedia[], terms: string[], now = new Date()) {
  const keys = terms.map(norm).filter((term) => term.length >= 2);
  const score = (item: VisualMedia) => {
    const text = norm(`${item.title} ${item.description ?? ""}`);
    const relevance = keys.some((key) => text.includes(key)) ? 1 : 0.3;
    const days = item.publishedAt ? (now.getTime() - new Date(item.publishedAt).getTime()) / 86_400_000 : 180;
    const recency = Number.isFinite(days) ? Math.max(0, Math.min(1, 1 - days / 180)) : 0;
    const completeness = [item.thumbnailUrl, item.title, item.publishedAt, item.author].filter(Boolean).length / 4;
    const total = relevance * MEDIA_RANK_WEIGHTS.relevance + RELIABILITY[item.platform] * MEDIA_RANK_WEIGHTS.reliability + recency * MEDIA_RANK_WEIGHTS.recency + completeness * MEDIA_RANK_WEIGHTS.completeness;
    return Math.round(total * 1000) / 1000;
  };
  return items.map((item) => ({ item, score: score(item) })).sort((a, b) => b.score - a.score || a.item.mediaId.localeCompare(b.item.mediaId)).map(({ item, score: value }) => ({ ...item, rankScore: value }));
}

/** 카드 대표 이미지: 이미지가 실제로 있는 미디어 중 최고 순위. 없으면 null(플레이스홀더 표시). */
export function representativeMedia(items: VisualMedia[], terms: string[]) {
  return rankMedia(items.filter((item) => item.thumbnailUrl), terms)[0] ?? null;
}

/* ---------- 웹 대표 이미지 파싱(V1 웹 출처) ---------- */

/** HTML에서 og:image / twitter:image를 찾아 페이지 기준 절대 https URL로 바꾼다. 없거나 안전하지 않으면 null. */
export function extractPreviewImage(html: string, pageUrl: string) {
  const head = html.slice(0, 200_000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const read = (tag: string, attr: string) => { const found = tag.match(new RegExp(`${attr}\\s*=\\s*(["'])(.*?)\\1`, "i")); return found?.[2]; };
  for (const key of ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) {
    const tag = metas.find((item) => (read(item, "property") ?? read(item, "name"))?.toLowerCase() === key);
    const content = tag ? read(tag, "content") : undefined;
    if (!content) continue;
    try {
      const absolute = new URL(content.replace(/&amp;/g, "&"), pageUrl).toString();
      const safe = safeHttpsUrl(absolute);
      if (safe) return safe;
    } catch { /* 다음 후보 */ }
  }
  return null;
}

/* ---------- 저장된 분석에서 미디어 꺼내기(브라우저·클라우드 공통) ---------- */

type SnapshotLike = { trendId: string; trendName: string; keywords: string[]; evidence?: EvidenceItem[]; media?: VisualMedia[]; webImages?: Record<string, string>; youtube?: { videos?: YouTubeVideoLike[] } };

/** 분석 때 받은 미디어(snapshot.media)를 우선하고, 없으면 근거 원장에서 다시 만든다(클라우드 복원분 포함). */
export function snapshotMedia(snapshot: SnapshotLike) {
  const stored = (snapshot.media ?? []).filter((item) => visualMediaSchema.safeParse(item).success);
  const derived = mediaFromEvidence({ trendId: snapshot.trendId, evidence: snapshot.evidence ?? [], videos: snapshot.youtube?.videos, webImages: snapshot.webImages });
  const withWeb = [...stored, ...derived].map((item) => {
    if (item.platform !== "web" || item.thumbnailUrl) return item;
    const image = safeHttpsUrl(snapshot.webImages?.[item.sourceUrl]);
    return image ? { ...item, thumbnailUrl: image, thumbnailOrigin: "og:image" as const, dataStatus: "SOURCE OBSERVED" as const, usageRights: "unknown" as const } : item;
  });
  return rankMedia(dedupeMedia(withWeb), [snapshot.trendName, ...snapshot.keywords]);
}
export const snapshotTerms = (snapshot: { trendName: string; keywords: string[] }) => [snapshot.trendName, ...snapshot.keywords];

/** 카드 대표 이미지: 실제 이미지가 있는 최고 순위 미디어. 없으면 null(플레이스홀더). */
export const cardImage = (snapshot: SnapshotLike) => snapshotMedia(snapshot).find((item) => item.thumbnailUrl) ?? null;

/* ---------- Instagram 사진 다시 받기(같은 해시태그 재조회) ---------- */

/** /api/media/instagram-images 응답 항목. 계정 아이디·캡션은 담지 않는다(사진 URL·원문 링크·게시 시각·종류만). */
export type InstagramImage = { permalink: string; imageUrl: string; mediaType: string; timestamp?: string; edge: "recent_media" | "top_media" };

/**
 * 재조회한 사진을 분석의 미디어 목록에 붙인다.
 * - 근거 원장의 같은 게시물(permalink 일치)은 사진 URL만 채운다.
 * - 원장에 없는 게시물은 "분석 이후 재수집"으로 표시해 추가한다(근거 ID 없음 — WHY 분석의 근거가 아님).
 */
export function mergeInstagramImages(snapshot: SnapshotLike, images: InstagramImage[], hashtag: string, collectedAt: string): VisualMedia[] {
  const current: VisualMedia[] = snapshotMedia(snapshot).map((item) => { const copy: VisualMedia & { rankScore?: number } = { ...item }; delete copy.rankScore; return copy; });
  const byPermalink = new Map(images.map((image) => [safeInstagramPermalink(image.permalink), image]));
  const matched = new Set<string>();
  const filled = current.map((item) => {
    const image = item.platform === "instagram" ? byPermalink.get(item.sourceUrl) : undefined;
    if (!image) return item;
    matched.add(item.sourceUrl);
    return { ...item, thumbnailUrl: image.imageUrl, thumbnailOrigin: "instagram-media-url" as const, dataStatus: "SOURCE OBSERVED" as const };
  });
  const added: VisualMedia[] = [];
  for (const [permalink, image] of byPermalink) {
    if (!permalink || matched.has(permalink) || current.some((item) => item.sourceUrl === permalink)) continue;
    added.push({
      mediaId: `instagram:${permalink}`, trendId: snapshot.trendId, mediaType: /CAROUSEL/i.test(image.mediaType) ? "carousel" : "image", platform: "instagram", sourceUrl: permalink,
      thumbnailUrl: image.imageUrl, thumbnailOrigin: "instagram-media-url", title: `Instagram #${hashtag} ${image.edge} · 분석 이후 재수집`, publishedAt: image.timestamp, collectedAt,
      evidenceIds: [], dataStatus: "SOURCE OBSERVED", usageRights: "link-only", analysisStatus: "not-analyzed",
    });
  }
  return [...filled, ...added];
}
