import { z } from "zod";
import { analysisStatusSchema, dnaDimensionNames, type AnalysisStatus } from "./schemas";
import { safeYouTubeThumbnail, type VisualMedia } from "./visual-media";

/*
 * PHASE V3 Visual DNA: 실제 이미지(썸네일)를 AI 비전으로 보고 시각적 특징을 구조화한다.
 * - 이미지가 없으면 만들지 않는다. 키워드만으로 생성한 결과를 Visual DNA로 표시하지 않는다.
 * - observed(이미지에서 보이는 것)는 실제 이미지 ID를 하나 이상 인용해야 한다. 인용이 없으면 inferred로 낮춘다.
 * - AI 비전 관찰도 해석이므로 observed 상태는 최대 Supported Hypothesis, inferred는 Creative Hypothesis로 둔다.
 * - 공통 특징은 서로 다른 이미지 2장 이상에서만 남긴다.
 */
export const VISUAL_DNA_PROMPT_VERSION = "visual-dna-v1";
export const VISUAL_DNA_MAX_IMAGES = 6;
export const visualDimensionNames = ["Color Palette", "Typography", "Texture", "Composition", "Objects", "Visual Mood", "Visual Motifs"] as const;
export type VisualDimensionName = (typeof visualDimensionNames)[number];

const featureSchema = z.object({
  label: z.string().min(1).max(80),
  description: z.string().max(300),
  basis: z.enum(["observed", "inferred"]),
  mediaIds: z.array(z.string()),
  status: analysisStatusSchema,
});
export const visualDnaSchema = z.object({
  trend: z.string(),
  palette: z.array(z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), name: z.string().max(40), mediaIds: z.array(z.string()) })).max(8),
  dimensions: z.array(z.object({ dimension: z.enum(visualDimensionNames), summary: z.string().max(400), features: z.array(featureSchema).max(6) })),
  commonFeatures: z.array(z.object({ label: z.string().max(80), description: z.string().max(300), dimension: z.enum(visualDimensionNames), mediaIds: z.array(z.string()) })).max(6),
  dnaLinks: z.array(z.object({ dnaDimension: z.enum(dnaDimensionNames), visualDimension: z.enum(visualDimensionNames), note: z.string().max(200) })).max(8),
  limitations: z.array(z.string().max(300)).max(6),
});
export type VisualDna = z.infer<typeof visualDnaSchema>;
export type VisualDnaMedia = Pick<VisualMedia, "mediaId" | "platform" | "sourceUrl" | "thumbnailUrl" | "title" | "evidenceIds" | "usageRights">;
export type VisualDnaValidation = { removedMediaIds: string[]; downgraded: number; droppedCommon: number; droppedPalette: number };
export type VisualDnaRecord = { result: VisualDna; media: VisualDnaMedia[]; model: string; analyzedAt: string; promptVersion: string; validation: VisualDnaValidation };

/** 분석해도 되는 이미지: 공식 임베드가 허용된 YouTube 썸네일(i.ytimg.com)만. Instagram(link-only)·웹 og:image(권리 미상)는 제외. */
export function eligibleVisualMedia(media: VisualMedia[]): VisualDnaMedia[] {
  return media.filter((item) => item.platform === "youtube" && item.usageRights === "platform-embed" && safeYouTubeThumbnail(item.thumbnailUrl))
    .slice(0, VISUAL_DNA_MAX_IMAGES)
    .map(({ mediaId, platform, sourceUrl, thumbnailUrl, title, evidenceIds, usageRights }) => ({ mediaId, platform, sourceUrl, thumbnailUrl, title, evidenceIds, usageRights }));
}

const OBSERVED_CAP: AnalysisStatus = "Supported Hypothesis";
const rank: Record<AnalysisStatus, number> = { "Verified Signal": 3, "Supported Hypothesis": 2, "Creative Hypothesis": 1, "Insufficient Evidence": 0 };
const cap = (status: AnalysisStatus, max: AnalysisStatus) => (rank[status] > rank[max] ? max : status);

/** 모델 출력 검증: 없는 이미지 ID 제거, 근거 없는 관찰 하향, 2장 미만 공통 특징·인용 없는 색 제거. */
export function validateVisualDna(raw: VisualDna, allowedMediaIds: string[]): { dna: VisualDna; validation: VisualDnaValidation } {
  const allowed = new Set(allowedMediaIds);
  const removed = new Set<string>();
  let downgraded = 0, droppedCommon = 0, droppedPalette = 0;
  const keep = (ids: string[]) => { const unique = [...new Set(ids)]; unique.filter((id) => !allowed.has(id)).forEach((id) => removed.add(id)); return unique.filter((id) => allowed.has(id)); };
  const dimensions = raw.dimensions.map((dimension) => ({
    ...dimension,
    features: dimension.features.map((feature) => {
      const mediaIds = keep(feature.mediaIds);
      // 무드는 항상 해석이다. 이미지 인용이 없는 관찰은 추론으로 낮춘다.
      const inferred = dimension.dimension === "Visual Mood" || feature.basis === "inferred" || mediaIds.length === 0;
      const status = inferred ? cap(feature.status, "Creative Hypothesis") : cap(feature.status, OBSERVED_CAP);
      if ((inferred && feature.basis === "observed") || status !== feature.status) downgraded += 1;
      return { ...feature, mediaIds, basis: inferred ? "inferred" as const : "observed" as const, status };
    }),
  }));
  const commonFeatures = raw.commonFeatures.map((item) => ({ ...item, mediaIds: keep(item.mediaIds) })).filter((item) => { const ok = item.mediaIds.length >= 2; if (!ok) droppedCommon += 1; return ok; });
  const palette = raw.palette.map((item) => ({ ...item, hex: item.hex.toLowerCase(), mediaIds: keep(item.mediaIds) })).filter((item) => { const ok = item.mediaIds.length > 0; if (!ok) droppedPalette += 1; return ok; });
  return { dna: { ...raw, dimensions, commonFeatures, palette }, validation: { removedMediaIds: [...removed], downgraded, droppedCommon, droppedPalette } };
}

/** TREND DNA와 연결하는 기본 대응(모델이 dnaLinks를 주지 않아도 화면에서 쓸 수 있는 고정 규칙). */
export const DEFAULT_DNA_LINKS: Record<VisualDimensionName, (typeof dnaDimensionNames)[number]> = {
  "Color Palette": "Aesthetic", Typography: "Aesthetic", Texture: "Aesthetic", Composition: "Aesthetic", Objects: "Object", "Visual Mood": "Emotion", "Visual Motifs": "Culture",
};
