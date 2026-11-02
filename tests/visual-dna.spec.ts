import { expect, test, type Page } from "@playwright/test";
import extra from "./fixtures/culture-validation.json";
import base from "./fixtures/live-pipeline.json";
import fixture from "./fixtures/visual-dna.json";
import { eligibleVisualMedia, validateVisualDna, visualDnaSchema, type VisualDna, type VisualDnaRecord } from "../lib/visual-dna";
import { planVisualDnaMerge, upsertVisualDna } from "../lib/visual-dna-cloud";
import { snapshotMedia, type VisualMedia } from "../lib/visual-media";
import type { LiveAnalysisSnapshot } from "../lib/types";
import { createStore, fakeSupabase, rowCount } from "./helpers/fake-supabase";
import { stubRemoteMedia } from "./helpers/stub-media";

/*
 * PHASE V3 Visual DNA.
 * 픽스처: 2026-10-30 실측 — 헤이세이 레트로 실제 YouTube 썸네일 6장을 /api/visual-dna로 1회 분석(OpenAI 비전, detail low).
 * 화면 테스트에서는 그 결과를 재사용하고 API를 다시 부르지 않는다(분석 실행 버튼은 응답을 대신 돌려줌).
 */
const all = [...base.snapshots, ...extra.snapshots] as unknown as LiveAnalysisSnapshot[];
const heisei = all.find((item) => item.trendName === "헤이세이 레트로")!;
const run = all.find((item) => item.trendName === "러닝")!;
const record = fixture.record as unknown as VisualDnaRecord;
const USER = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };

test.describe("visual dna rules (no browser)", () => {
  test("the recorded real analysis is valid and every observation cites a real analyzed image", () => {
    expect(visualDnaSchema.safeParse(record.result).success).toBe(true);
    const ids = new Set(record.media.map((item) => item.mediaId));
    expect(record.media).toHaveLength(6);
    for (const dimension of record.result.dimensions) for (const feature of dimension.features) {
      expect(feature.mediaIds.every((id) => ids.has(id))).toBe(true);
      if (feature.basis === "observed") { expect(feature.mediaIds.length).toBeGreaterThan(0); expect(feature.status).not.toBe("Verified Signal"); }
      if (dimension.dimension === "Visual Mood") expect(feature.basis).toBe("inferred");
    }
    expect(record.result.commonFeatures.every((item) => new Set(item.mediaIds).size >= 2)).toBe(true);
    expect(record.result.palette.every((item) => /^#[0-9a-f]{6}$/.test(item.hex) && item.mediaIds.length > 0)).toBe(true);
  });

  test("validation removes unknown images, downgrades uncited observations, and drops single-image common features", () => {
    const raw: VisualDna = {
      trend: "t",
      palette: [{ hex: "#FF00AA", name: "핑크", mediaIds: ["a"] }, { hex: "#000000", name: "검정", mediaIds: ["ghost"] }],
      dimensions: [
        { dimension: "Objects", summary: "s", features: [{ label: "스티커", description: "d", basis: "observed", mediaIds: ["a", "ghost"], status: "Verified Signal" }, { label: "근거 없음", description: "d", basis: "observed", mediaIds: [], status: "Supported Hypothesis" }] },
        { dimension: "Visual Mood", summary: "s", features: [{ label: "밝음", description: "d", basis: "observed", mediaIds: ["a"], status: "Supported Hypothesis" }] },
      ],
      commonFeatures: [{ label: "한 장", description: "d", dimension: "Objects", mediaIds: ["a", "a"] }, { label: "두 장", description: "d", dimension: "Objects", mediaIds: ["a", "b"] }],
      dnaLinks: [], limitations: [],
    };
    const { dna, validation } = validateVisualDna(raw, ["a", "b"]);
    const objects = dna.dimensions[0].features;
    expect(objects[0]).toMatchObject({ basis: "observed", mediaIds: ["a"], status: "Supported Hypothesis" });
    expect(objects[1]).toMatchObject({ basis: "inferred", status: "Creative Hypothesis" });
    expect(dna.dimensions[1].features[0]).toMatchObject({ basis: "inferred", status: "Creative Hypothesis" });
    expect(dna.commonFeatures.map((item) => item.label)).toEqual(["두 장"]);
    expect(dna.palette.map((item) => item.hex)).toEqual(["#ff00aa"]);
    expect(validation).toMatchObject({ removedMediaIds: ["ghost"], droppedCommon: 1, droppedPalette: 1 });
    expect(validation.downgraded).toBeGreaterThanOrEqual(3);
  });

  test("only YouTube thumbnails (platform-embed) are eligible, at most six", () => {
    const media = snapshotMedia(heisei);
    const eligible = eligibleVisualMedia(media);
    expect(eligible.length).toBe(6);
    expect(eligible.every((item) => item.platform === "youtube" && /i\.ytimg\.com/.test(item.thumbnailUrl!))).toBe(true);
    const others: VisualMedia[] = [{ ...media[0], mediaId: "instagram:x", platform: "instagram", usageRights: "link-only", thumbnailUrl: "https://scontent.cdninstagram.com/a.jpg" }, { ...media[0], mediaId: "web:y", platform: "web", usageRights: "unknown", thumbnailUrl: "https://cdn.example.com/og.jpg" }];
    expect(eligibleVisualMedia(others)).toEqual([]);
    expect(eligibleVisualMedia(snapshotMedia(run))).toEqual([]);
  });
});

test.describe("visual dna cloud (in-memory Supabase)", () => {
  test("saving the same analysis twice keeps one row; another browser restores it; a newer local copy is kept", async () => {
    const store = createStore();
    const client = fakeSupabase(store, USER);
    expect((await upsertVisualDna(client, USER.id, fixture.trendId, record)).ok).toBe(true);
    expect((await upsertVisualDna(client, USER.id, fixture.trendId, record)).ok).toBe(true);
    expect(rowCount(store, "trend_visual_dna")).toBe(1);
    const rows = (await client.from("trend_visual_dna").select("trend_id,analyzed_at,prompt_version,model,media,result,validation").eq("user_id", USER.id)).data as Parameters<typeof planVisualDnaMerge>[1];
    expect(planVisualDnaMerge([{ ...heisei, visualDna: undefined }], rows)).toHaveLength(1);
    expect(planVisualDnaMerge([{ ...heisei, visualDna: { ...record, analyzedAt: "2030-01-01T00:00:00.000Z" } }], rows)).toHaveLength(0);
  });

  test("a missing 0006 table is reported clearly", async () => {
    const result = await upsertVisualDna(fakeSupabase(createStore(), USER, { missingTables: ["trend_visual_dna"] }), USER.id, fixture.trendId, record);
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain("202610300006");
  });
});

async function seed(page: Page, items: unknown[]) {
  await stubRemoteMedia(page);
  await page.goto("/");
  await page.evaluate((data) => { localStorage.clear(); localStorage.setItem("trend-radar-onboarded", "1"); localStorage.setItem("trend-radar-live-analyses", JSON.stringify(data)); }, items);
}
const DNA = (trend: LiveAnalysisSnapshot) => `/trends/${encodeURIComponent(trend.trendId)}/dna`;

test.describe("visual dna UI", () => {
  test("a saved Visual DNA shows palette, seven dimensions, observed vs AI interpretation, and TREND DNA links", async ({ page }) => {
    await seed(page, [{ ...heisei, visualDna: record }]);
    await page.goto(DNA(heisei));
    const panel = page.getByTestId("visual-dna");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("visual-dna-palette").locator(".swatch")).toHaveCount(record.result.palette.length);
    await expect(panel.getByTestId("visual-dna-dimension")).toHaveCount(7);
    await expect(panel.getByText("관찰").first()).toBeVisible();
    await expect(panel.getByText("AI 해석").first()).toBeVisible();
    await expect(panel.getByText(/TREND DNA · Aesthetic/).first()).toBeVisible();
    await expect(panel.getByTestId("visual-dna-common")).toContainText(record.result.commonFeatures[0].label);
    await expect(panel.getByTestId("visual-dna-images").getByRole("link")).toHaveCount(6);
    await expect(panel.getByTestId("visual-dna-images").getByRole("link").first()).toHaveAttribute("href", /youtube\.com\/watch/);
  });

  test("running the analysis sends only eligible real thumbnails, saves locally, and shows the cloud state separately", async ({ page }) => {
    let sent: { media: Array<{ platform: string; thumbnailUrl: string }> } | null = null;
    await seed(page, [heisei]);
    await page.route("**/api/visual-dna", async (route) => { sent = route.request().postDataJSON(); await route.fulfill({ json: { mode: "live", cached: false, result: record.result, validation: record.validation, model: record.model, promptVersion: record.promptVersion, analyzedAt: record.analyzedAt, media: record.media } }); });
    await page.goto(DNA(heisei));
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId("run-visual-dna").click();
    await expect(page.getByTestId("visual-dna-dimension")).toHaveCount(7);
    expect(sent!.media).toHaveLength(6);
    expect(sent!.media.every((item) => item.platform === "youtube" && /i\.ytimg\.com/.test(item.thumbnailUrl))).toBe(true);
    await expect(page.getByTestId("visual-dna").getByTestId("cloud-save-status")).toContainText("로그인 필요");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-live-analyses") ?? "[]")[0].visualDna?.promptVersion);
    expect(stored).toBe("visual-dna-v1");
  });

  test("without real images Visual DNA is not generated", async ({ page }) => {
    await seed(page, [run]);
    await page.goto(DNA(run));
    await expect(page.getByTestId("visual-dna-unavailable")).toContainText("실제 이미지가 없습니다");
    await expect(page.getByTestId("run-visual-dna")).toHaveCount(0);
  });

  test("the API refuses requests without eligible images before any paid call, and requires access otherwise", async ({ request }) => {
    expect((await request.post("/api/visual-dna", { data: { trend: "x", media: [] } })).status()).toBe(400);
    const instagramOnly = await request.post("/api/visual-dna", { data: { trend: "x", media: [{ mediaId: "instagram:x", platform: "instagram", sourceUrl: "https://www.instagram.com/p/x/", thumbnailUrl: "https://scontent.cdninstagram.com/a.jpg", title: "t", evidenceIds: [], usageRights: "link-only" }] } });
    expect(instagramOnly.status()).toBe(422);
    expect((await instagramOnly.json()).error).toBe("VISUAL_DNA_NO_IMAGES");
    const eligible = await request.post("/api/visual-dna", { data: { trend: "x", media: record.media } });
    expect(eligible.status()).toBe(401);
  });
});
