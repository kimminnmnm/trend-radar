import { expect, test, type Page } from "@playwright/test";
import base from "./fixtures/live-pipeline.json";
import extra from "./fixtures/culture-validation.json";
import { cardImage, decodeEntities, dedupeMedia, extractPreviewImage, isPrivateAddress, mediaFromEvidence, mergeInstagramImages, rankMedia, safeHttpsUrl, snapshotMedia, visualMediaSchema, youtubeIdFromUrl, type InstagramImage, type VisualMedia } from "../lib/visual-media";
import type { EvidenceItem } from "../lib/schemas";
import type { LiveAnalysisSnapshot } from "../lib/types";
import { stubRemoteMedia } from "./helpers/stub-media";

/*
 * PHASE V1·V2 검증. 미디어는 2026-10-29 실측 분석(보컬로이드 등, YouTube Data API·웹 출처)의 근거 원장에서 만든다.
 * Instagram 픽스처는 링크·캡션이 익명화돼 있어 이미지가 없다. Instagram 이미지 처리는 모의 응답으로 검증한다.
 * 외부 썸네일·임베드 요청은 테스트 안에서 대신 응답하고, 실제 API(YouTube·Meta·OpenAI)는 호출하지 않는다.
 */
const all = [...base.snapshots, ...extra.snapshots] as unknown as LiveAnalysisSnapshot[];
const vocaloid = all.find((item) => item.trendName === "보컬로이드")!;
const run = all.find((item) => item.trendName === "러닝")!;
const ev = (item: Partial<EvidenceItem> & Pick<EvidenceItem, "id" | "kind">): EvidenceItem => ({ title: "t", source: "s", collectedAt: "2026-10-30T00:00:00Z", excerpt: "e", ...item });

test.describe("media pipeline (no browser)", () => {
  test("real YouTube evidence becomes valid media with official thumbnails, links, and views", () => {
    const media = snapshotMedia(vocaloid);
    const youtube = media.filter((item) => item.platform === "youtube");
    expect(youtube.length).toBe(vocaloid.evidence!.filter((item) => item.kind === "youtube_video").length);
    for (const item of media) expect(visualMediaSchema.safeParse(item).success, item.mediaId).toBe(true);
    const first = youtube[0];
    expect(first.thumbnailUrl).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/hqdefault\.jpg$/);
    expect(first.sourceUrl).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
    expect(first.evidenceIds[0]).toMatch(/^YT-/);
    expect(youtube.some((item) => typeof item.metrics?.views === "number")).toBe(true);
    // 웹 출처는 대표 이미지를 확인하기 전까지 이미지가 없다(만들지 않는다).
    expect(media.filter((item) => item.platform === "web").every((item) => item.thumbnailUrl === null && item.dataStatus === "UNAVAILABLE")).toBe(true);
  });

  test("a cloud-restored analysis (evidence ledger only) still yields the same YouTube media", () => {
    const restored = { ...vocaloid, youtube: undefined, media: undefined };
    expect(snapshotMedia(restored).filter((item) => item.platform === "youtube").map((item) => item.thumbnailUrl).sort()).toEqual(snapshotMedia(vocaloid).filter((item) => item.platform === "youtube").map((item) => item.thumbnailUrl).sort());
  });

  test("API thumbnails are used only from YouTube's image host", () => {
    const evidence = [ev({ id: "YT-01", kind: "youtube_video", url: "https://www.youtube.com/watch?v=u6n04E5ESvo" })];
    const ok = mediaFromEvidence({ trendId: "t", evidence, videos: [{ id: "u6n04E5ESvo", title: "v", url: "https://www.youtube.com/watch?v=u6n04E5ESvo", thumbnailUrl: "https://i.ytimg.com/vi/u6n04E5ESvo/mqdefault.jpg" }] })[0];
    expect(ok).toMatchObject({ thumbnailOrigin: "youtube-api", thumbnailUrl: "https://i.ytimg.com/vi/u6n04E5ESvo/mqdefault.jpg" });
    const spoofed = mediaFromEvidence({ trendId: "t", evidence, videos: [{ id: "u6n04E5ESvo", title: "v", url: "x", thumbnailUrl: "https://evil.example.com/a.jpg" }] })[0];
    expect(spoofed.thumbnailOrigin).toBe("youtube-video-id");
    expect(mediaFromEvidence({ trendId: "t", evidence: [ev({ id: "YT-02", kind: "youtube_video", url: "https://evil.example.com/watch?v=u6n04E5ESvo" })] })).toEqual([]);
  });

  test("Instagram images come only from media_url on Meta's CDN; videos and unknown hosts get no image", () => {
    const evidence = [
      ev({ id: "IG-01", kind: "instagram_media", title: "Instagram #x top_media · IMAGE", url: "https://www.instagram.com/p/AAA/" }),
      ev({ id: "IG-02", kind: "instagram_media", title: "Instagram #x top_media · VIDEO", url: "https://www.instagram.com/p/BBB/" }),
      ev({ id: "IG-03", kind: "instagram_media", title: "Instagram #x top_media · IMAGE", url: "https://www.instagram.com/p/CCC/" }),
      ev({ id: "IG-04", kind: "instagram_media", title: "Instagram #x · IMAGE", url: "https://not-instagram.example.com/p/DDD/" }),
    ];
    const media = mediaFromEvidence({ trendId: "t", evidence, instagram: [
      { permalink: "https://www.instagram.com/p/AAA/", media_type: "IMAGE", media_url: "https://scontent-ssn1-1.cdninstagram.com/v/a.jpg?x=1" },
      { permalink: "https://www.instagram.com/p/BBB/", media_type: "VIDEO", media_url: "https://scontent-ssn1-1.cdninstagram.com/v/b.mp4" },
      { permalink: "https://www.instagram.com/p/CCC/", media_type: "IMAGE", media_url: "https://images.example.com/c.jpg" },
    ] });
    expect(media.map((item) => [item.evidenceIds[0], item.thumbnailUrl ? "image" : "none", item.mediaType])).toEqual([["IG-01", "image", "image"], ["IG-02", "none", "video"], ["IG-03", "none", "image"]]);
    expect(media.every((item) => item.usageRights === "link-only")).toBe(true);
  });

  test("URL validation blocks non-https, credentials, odd ports, and private or local addresses", () => {
    for (const bad of ["http://example.com/a", "javascript:alert(1)", "data:image/png;base64,AA", "https://localhost/a", "https://127.0.0.1/a", "https://10.0.0.5/a", "https://192.168.0.1/a", "https://169.254.169.254/latest", "https://[::1]/a", "https://user:pw@example.com/a", "https://example.com:8443/a", "https://intranet/a"]) expect(safeHttpsUrl(bad), bad).toBeNull();
    expect(safeHttpsUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
    expect(["::ffff:10.0.0.1", "fd00::1", "fe80::1", "100.64.0.1"].every(isPrivateAddress)).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(youtubeIdFromUrl("https://youtu.be/u6n04E5ESvo")).toBe("u6n04E5ESvo");
    expect(youtubeIdFromUrl("https://www.youtube.com/watch?v=short")).toBeNull();
  });

  test("duplicates are merged and their evidence IDs kept", () => {
    const evidence = [ev({ id: "YT-01", kind: "youtube_video", url: "https://www.youtube.com/watch?v=u6n04E5ESvo" }), ev({ id: "YT-02", kind: "youtube_video", url: "https://youtu.be/u6n04E5ESvo" }), ev({ id: "WEB-01", kind: "web_source", url: "https://news.example.com/a#top" }), ev({ id: "WEB-02", kind: "web_source", url: "https://news.example.com/a" })];
    const media = mediaFromEvidence({ trendId: "t", evidence });
    expect(media).toHaveLength(2);
    expect(media.find((item) => item.platform === "youtube")!.evidenceIds).toEqual(["YT-01", "YT-02"]);
    expect(media.find((item) => item.platform === "web")!.evidenceIds).toEqual(["WEB-01", "WEB-02"]);
    expect(dedupeMedia([...media, ...media])).toHaveLength(2);
  });

  test("YouTube's HTML-escaped titles are shown as plain text", () => {
    expect(decodeEntities("しずくちゃん シールバインダー&amp;平成レトロ &#39;x&#39; &lt;b&gt;")).toBe("しずくちゃん シールバインダー&平成レトロ 'x' <b>");
    const media = mediaFromEvidence({ trendId: "t", evidence: [ev({ id: "YT-01", kind: "youtube_video", url: "https://www.youtube.com/watch?v=u6n04E5ESvo", title: "A &amp; B" })] });
    expect(media[0].title).toBe("A & B");
  });

  test("ranking prefers relevance over view counts", () => {
    const make = (id: string, title: string, views: number): VisualMedia => ({ mediaId: `youtube:${id}`, trendId: "t", mediaType: "video", platform: "youtube", sourceUrl: `https://www.youtube.com/watch?v=${id}`, thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, thumbnailOrigin: "youtube-video-id", title, author: "c", publishedAt: "2026-10-28T00:00:00Z", collectedAt: "2026-10-29T00:00:00Z", metrics: { views }, evidenceIds: ["YT-01"], dataStatus: "SOURCE OBSERVED", usageRights: "platform-embed", analysisStatus: "not-analyzed" });
    const ranked = rankMedia([make("aaaaaaaaaaa", "고양이 영상 모음", 9_000_000), make("bbbbbbbbbbb", "보컬로이드 신곡 리뷰", 120)], ["보컬로이드"], new Date("2026-10-30T00:00:00Z"));
    expect(ranked[0].title).toBe("보컬로이드 신곡 리뷰");
  });

  test("og:image is read from real page metadata only and resolved safely", () => {
    expect(extractPreviewImage('<meta property="og:image" content="/img/cover.jpg">', "https://news.example.com/a/b")).toBe("https://news.example.com/img/cover.jpg");
    expect(extractPreviewImage('<meta property="og:image" content="http://insecure.example.com/x.jpg"><meta name="twitter:image" content="https://cdn.example.com/t.jpg">', "https://n.example.com/")).toBe("https://cdn.example.com/t.jpg");
    expect(extractPreviewImage('<meta property="og:image" content="https://127.0.0.1/x.jpg">', "https://n.example.com/")).toBeNull();
    expect(extractPreviewImage("<title>no image</title>", "https://n.example.com/")).toBeNull();
    const withImage = snapshotMedia({ ...vocaloid, webImages: { [vocaloid.evidence!.find((item) => item.kind === "web_source")!.url!]: "https://cdn.example.com/og.jpg" } });
    expect(withImage.find((item) => item.thumbnailOrigin === "og:image")).toMatchObject({ dataStatus: "SOURCE OBSERVED", usageRights: "unknown" });
  });

  test("cards use a real image only when one exists", () => {
    expect(cardImage(vocaloid)?.thumbnailUrl).toMatch(/i\.ytimg\.com/);
    expect(cardImage(run)).toBeNull();
  });

  test("re-fetched Instagram photos fill matching ledger posts and mark other posts as collected after the analysis", () => {
    const ledger = run.evidence!.find((item) => item.kind === "instagram_media")!;
    const images: InstagramImage[] = [
      { permalink: ledger.url!, imageUrl: "https://scontent.cdninstagram.com/v/a.jpg", mediaType: "IMAGE", edge: "top_media" },
      { permalink: "https://www.instagram.com/p/NEWPOST123/", imageUrl: "https://scontent.cdninstagram.com/v/b.jpg", mediaType: "CAROUSEL_ALBUM", timestamp: "2026-10-30T00:00:00+0000", edge: "recent_media" },
    ];
    const merged = mergeInstagramImages(run, images, "러닝", "2026-10-30T01:00:00.000Z");
    expect(merged.find((item) => item.sourceUrl === ledger.url)).toMatchObject({ thumbnailUrl: images[0].imageUrl, thumbnailOrigin: "instagram-media-url", evidenceIds: [ledger.id] });
    expect(merged.find((item) => item.sourceUrl === images[1].permalink)).toMatchObject({ evidenceIds: [], title: expect.stringContaining("분석 이후 재수집"), usageRights: "link-only" });
    expect(merged.every((item) => !item.author)).toBe(true);
    expect(cardImage({ ...run, media: merged })?.thumbnailUrl).toMatch(/cdninstagram\.com/);
  });
});

async function seed(page: Page, items: unknown[]) {
  await page.goto("/");
  await page.evaluate((data) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-live-analyses", JSON.stringify(data)); }, items);
}
const WHY = (trend: LiveAnalysisSnapshot) => `/trends/${encodeURIComponent(trend.trendId)}/why`;

test.describe("visual discovery UI", () => {
  test("TREND WHY shows real YouTube thumbnails with source links, filters, and an opt-in preview without autoplay", async ({ page }) => {
    const requests = await stubRemoteMedia(page);
    await seed(page, [vocaloid]);
    await page.goto(WHY(vocaloid));
    const gallery = page.getByTestId("visual-evidence");
    await expect(gallery).toBeVisible();
    await expect(gallery).toContainText("SOURCE OBSERVED");
    await expect(gallery).toContainText("AI INTERPRETATION");
    await gallery.getByRole("button", { name: /^YouTube/ }).click();
    const cards = gallery.getByTestId("visual-card");
    await expect(cards.first()).toHaveAttribute("data-platform", "youtube");
    await expect(cards.first().getByTestId("visual-open")).toHaveAttribute("href", /^https:\/\/www\.youtube\.com\/watch\?v=/);
    await expect(cards.first().getByTestId("visual-open")).toHaveAttribute("rel", "noopener noreferrer");
    await expect(cards.first().locator("img")).toHaveAttribute("src", /^https:\/\/i\.ytimg\.com\//);
    await expect(cards.first().getByTestId("media-thumb")).toHaveAttribute("data-state", "loaded");
    await expect(cards.first().locator("img")).toHaveAttribute("alt", /YouTube 이미지:/);
    await cards.first().getByRole("button", { name: "미리보기" }).click();
    const frame = cards.first().locator("iframe");
    await expect(frame).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}$/);
    expect(await frame.getAttribute("src")).not.toContain("autoplay");
    expect(requests.every((url) => /ytimg|youtube-nocookie/.test(url))).toBe(true);
  });

  test("broken images fall back to a labelled placeholder", async ({ page }) => {
    await stubRemoteMedia(page, { failImages: true });
    await seed(page, [vocaloid]);
    await page.goto(WHY(vocaloid));
    await expect(page.getByTestId("visual-evidence").getByText("이미지를 불러오지 못했습니다").first()).toBeVisible();
    // 이미지가 실패해도 원본 링크와 출처 정보는 그대로 남는다.
    const youtubeCard = page.locator('[data-testid="visual-card"][data-platform="youtube"]').first();
    await expect(youtubeCard.getByTestId("visual-open")).toHaveAttribute("href", /youtube\.com\/watch/);
    await expect(youtubeCard.locator("img")).toHaveCount(0);
  });

  test("an analysis without image evidence says so instead of inventing images", async ({ page }) => {
    await stubRemoteMedia(page);
    await seed(page, [run]);
    await page.goto(WHY(run));
    const gallery = page.getByTestId("visual-evidence");
    await expect(gallery.getByTestId("visual-status").first()).toHaveText("UNAVAILABLE");
    await expect(gallery.locator("img")).toHaveCount(0);
    await expect(gallery.locator("iframe")).toHaveCount(0);
  });

  test("Instagram photos can be re-fetched for the same hashtag: photos only, no account IDs, and they persist", async ({ page }) => {
    const requests = await stubRemoteMedia(page);
    await seed(page, [run]);
    const ledger = run.evidence!.filter((item) => item.kind === "instagram_media");
    let sent: { hashtag: string } | null = null;
    await page.route("**/api/media/instagram-images", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { hashtag: "러닝", collectedAt: "2026-10-30T01:00:00.000Z", cached: false, images: [
        { permalink: ledger[0].url, imageUrl: "https://scontent.cdninstagram.com/v/a.jpg", mediaType: "IMAGE", edge: "top_media" },
        { permalink: "https://www.instagram.com/p/NEWPOST123/", imageUrl: "https://scontent.cdninstagram.com/v/b.jpg", mediaType: "IMAGE", edge: "recent_media" },
      ] } });
    });
    await page.goto(WHY(run));
    const gallery = page.getByTestId("visual-evidence");
    await gallery.getByTestId("load-instagram-images").click();
    await expect(gallery.getByTestId("instagram-images-msg")).toContainText("분석 근거 게시물 1개에 사진 연결");
    expect(sent!.hashtag).toBe("러닝");
    await expect(gallery.locator("img[src*='cdninstagram.com']")).toHaveCount(2);
    await expect(gallery.getByText("분석 이후 재수집").first()).toBeVisible();
    expect(requests.every((url) => /cdninstagram\.com/.test(url))).toBe(true);
    await page.goto("/");
    await expect(page.locator(".live-card").filter({ hasText: "러닝" }).locator("img")).toHaveAttribute("src", /cdninstagram\.com/);
  });

  test("Discover and Overview fill photo-less cards with re-fetched Instagram photos in one batched request, once per tab", async ({ page }) => {
    await stubRemoteMedia(page);
    const calls: Array<{ hashtags: string[] }> = [];
    const ledger = run.evidence!.find((item) => item.kind === "instagram_media")!;
    await page.route("**/api/media/instagram-images", async (route) => {
      calls.push(route.request().postDataJSON());
      await route.fulfill({ json: { results: [{ hashtag: "러닝", ok: true, collectedAt: "2026-10-30T01:00:00.000Z", cached: false, images: [{ permalink: ledger.url, imageUrl: "https://scontent.cdninstagram.com/v/a.jpg", mediaType: "IMAGE", edge: "top_media" }] }] } });
    });
    await seed(page, [vocaloid, run]);
    await page.evaluate(() => sessionStorage.clear());
    calls.length = 0;
    await page.goto("/discover");
    const card = page.locator(".live-card").filter({ hasText: "러닝" });
    await expect(card.locator("img")).toHaveAttribute("src", /cdninstagram\.com/);
    await expect(page.getByTestId("ig-autofill")).toContainText("카드 1개를 채웠습니다");
    expect(calls).toEqual([{ hashtags: ["러닝"] }]);
    await page.goto("/");
    await expect(page.locator(".live-card").filter({ hasText: "러닝" }).locator("img")).toHaveAttribute("src", /cdninstagram\.com/);
    expect(calls).toHaveLength(1);
  });

  test("cloud-restored analyses without the instagram field still autofill (hashtag read from the evidence ledger)", async ({ page }) => {
    await stubRemoteMedia(page);
    const calls: Array<{ hashtags: string[] }> = [];
    await page.route("**/api/media/instagram-images", (route) => { calls.push(route.request().postDataJSON()); return route.fulfill({ json: { results: [] } }); });
    await seed(page, [{ ...run, instagram: undefined }]);
    await page.evaluate(() => sessionStorage.clear());
    calls.length = 0;
    await page.goto("/discover");
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].hashtags).toEqual(["러닝"]);
  });

  test("a failed autofill is shown and not retried in the same tab", async ({ page }) => {
    await stubRemoteMedia(page);
    let count = 0;
    await page.route("**/api/media/instagram-images", (route) => { count += 1; return route.fulfill({ status: 401, json: { error: "ACCESS_REQUIRED", message: "접근 권한이 필요합니다." } }); });
    await seed(page, [run]);
    await page.evaluate(() => sessionStorage.clear());
    count = 0;
    await page.goto("/discover");
    await expect(page.getByTestId("ig-autofill")).toContainText("접근 권한이 필요합니다");
    await expect(page.locator(".live-card").filter({ hasText: "러닝" }).getByText("출처 확인된 이미지 없음")).toBeVisible();
    await page.reload();
    await expect(page.locator(".live-card").filter({ hasText: "러닝" })).toBeVisible();
    expect(count).toBe(1);
  });

  test("the Instagram photo API validates input before access checks", async ({ request }) => {
    expect((await request.post("/api/media/instagram-images", { data: { hashtags: Array.from({ length: 13 }, (_, i) => `t${i}`) } })).status()).toBe(400);
    expect((await request.post("/api/media/instagram-images", { data: {} })).status()).toBe(400);
    expect((await request.post("/api/media/instagram-images", { data: { hashtag: "러닝" } })).status()).toBe(401);
  });

  test("overview and discover cards show a real thumbnail when available, a placeholder otherwise, and DEMO cards are marked", async ({ page }) => {
    await stubRemoteMedia(page);
    await seed(page, [vocaloid, run]);
    await page.goto("/");
    const cards = page.locator(".live-card");
    await expect(cards.filter({ hasText: "보컬로이드" }).locator("img")).toHaveAttribute("src", /i\.ytimg\.com/);
    await expect(cards.filter({ hasText: "러닝" }).getByText("출처 확인된 이미지 없음")).toBeVisible();
    await page.goto("/discover");
    await expect(page.locator(".live-card").filter({ hasText: "보컬로이드" }).locator("img")).toHaveAttribute("src", /i\.ytimg\.com/);
    await expect(page.locator(".trend-card").first().getByText("DEMO · 실제 이미지 없음")).toBeVisible();
    await page.locator(".live-card").filter({ hasText: "보컬로이드" }).getByRole("link").first().click();
    await expect(page).toHaveURL(/\/trends\/live-.+\/(why|dna)$/);
  });

  test("web preview API rejects bad input before access checks and requires access before fetching", async ({ request }) => {
    expect((await request.post("/api/media/web-preview", { data: { urls: [] } })).status()).toBe(400);
    expect((await request.post("/api/media/web-preview", { data: { urls: Array.from({ length: 7 }, (_, i) => `https://e${i}.example.com/`) } })).status()).toBe(400);
    const unauth = await request.post("/api/media/web-preview", { data: { urls: ["https://example.com/"] } });
    expect(unauth.status()).toBe(401);
  });
});
