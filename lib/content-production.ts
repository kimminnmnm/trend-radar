import { z } from "zod";
import type { PhenomenonContext } from "./discovery";
import type { EditorialContextLock } from "./editorial-lock";
import { analysisStatusSchema } from "./schemas";
import type { CreativeIdea, CreativeRun } from "./creative-collision";
import { CONCEPT_NOTICE_DEFAULT, contentModes, findReportPhrases, parseContentMode, stripInternalRefs, type AngleValidation, type ContentAngle, type ContentMode } from "./editorial";
import { IMAGE_SIZES, rightsNote, type ImageAspect, type ImageAssetRef } from "./image-assets";
import type { EditorialReview, QualityReport } from "./editorial-quality";
import type { DesignControls } from "./card-design";

/*
 * C3 Content Studio 제작 기획(HOW TO COMMUNICATE).
 * - 형식: Instagram 카드뉴스(4~10장, 1:1·4:5), 숏폼(15~60초, 9:16). 기존 기획 브리프(ContentPlan)는 그대로 둔다.
 * - 진입: 단일 트렌드(Discover·WHY·DNA) 또는 Creative Collision 아이디어. 생성 엔진은 하나(/api/studio/production).
 * - 근거 ID는 서버 근거 원장(T1:IG-03 …)에 있는 것만 남긴다. 가상의 아이디어는 콘셉트 제안으로 표시한다.
 * - v2(EDITORIAL): 콘텐츠 모드·선택한 방향(Angle)으로 만든다. 게시용 카피와 Editor Notes를 나눈다. 저장된 v1 프로젝트도 그대로 읽힌다(새 필드는 모두 선택).
 * - v3(ENGINE V2): 방향에 맞는 자료만 골라 넘기고, 스토리라인을 먼저 쓴 뒤 슬라이드를 만든다. 슬라이드마다 구체 디테일·독자가 얻는 것을 밝히고 품질 게이트로 검사한다.
 * - v4(V2.1): 쓰기 전에 Detail Bank(소재 고유 디테일·사례·활용·출처·검증 상태)를 만들고, 슬라이드마다 서로 다른 디테일을 쓴다(detail_ids).
 *   필수 검증과 편집 리뷰(AI 참고 점수)를 나누고, 문제가 있는 제목·슬라이드만 고쳐 쓴다.
 */
export const PRODUCTION_PROMPT_VERSION = "studio-production-v4";
export const productionFormats = ["cardnews", "shortform"] as const;
export type ProductionFormat = (typeof productionFormats)[number];
export const productionFormatLabels: Record<ProductionFormat, string> = { cardnews: "Instagram 카드뉴스", shortform: "숏폼 영상" };
/** v1 유형(cover…cta)은 유지하고, 에디토리얼 전개용 유형을 더했다. 전개는 방향마다 다르다. */
export const slideTypes = ["cover", "hook", "intro", "story", "detail", "list", "tip", "highlight", "body", "example", "evidence", "closing", "cta"] as const;

export const productionSettingsSchema = z.object({
  format: z.enum(productionFormats),
  aspect: z.enum(["1:1", "4:5", "9:16"]),
  slideCount: z.number().int().min(4).max(10),
  durationSec: z.number().int().min(15).max(60),
  target: z.string().trim().max(200),
  tone: z.string().trim().max(200),
  brand: z.string().trim().max(80),
  goal: z.string().trim().max(200),
  cta: z.string().trim().max(200),
  /** 콘텐츠 모드(E1). v1 프로젝트에는 없다 — 읽을 때 settingsMode로 기본값(TREND EDITORIAL)을 쓴다. */
  mode: z.enum(contentModes).optional(),
});
export type ProductionSettings = z.infer<typeof productionSettingsSchema>;
export const defaultSettings = (format: ProductionFormat = "cardnews", mode: ContentMode = "editorial"): ProductionSettings => ({ format, aspect: format === "shortform" ? "9:16" : "4:5", slideCount: 6, durationSec: 30, target: "", tone: "친구에게 말하듯 가볍게, 구체적으로, 과장 없이", brand: "", goal: "", cta: "", mode });
export const settingsMode = (settings: Pick<ProductionSettings, "mode">) => parseContentMode(settings.mode);

/** Creative Collision에서 넘어온 콘셉트(사용자가 Studio에서 고칠 수 있다). */
export const creativeConceptSchema = z.object({
  runId: z.string().max(80), ideaId: z.string().max(120),
  title: z.string().trim().min(1).max(200), concept: z.string().trim().max(1200), rationale: z.string().trim().max(1500),
  level: z.string().max(10), ideaType: z.string().max(30), evidenceMode: z.string().max(30),
  hooks: z.array(z.string().trim().max(200)).max(5), audience: z.string().trim().max(600),
  visualBrief: z.string().trim().max(1500), imagePrompt: z.string().trim().max(2000), ipCaution: z.string().trim().max(400),
  trendKeys: z.array(z.string().max(120)).max(2),
});
export type CreativeConcept = z.infer<typeof creativeConceptSchema>;

const evidenceIds = z.array(z.string());
/** 슬라이드에 쓴 사실 주장(Editor Notes용). 근거가 없으면 서버가 "검증 필요"로 표시한다. */
export const factCheckSchema = z.object({ text: z.string(), evidence_ids: evidenceIds, status: analysisStatusSchema });
export type FactCheck = z.infer<typeof factCheckSchema>;
export const slideImageStatuses = ["idle", "generating", "ready", "error"] as const;
export const slideImageSources = ["ai", "upload", "reference"] as const;
export const slideImageSchema = z.object({
  assetId: z.string().max(160).optional(),
  prompt: z.string().max(2000).optional(),
  status: z.enum(slideImageStatuses),
  source: z.enum(slideImageSources).nullable(),
  previewUrl: z.string().max(3_000_000).optional(),
  storagePath: z.string().max(500).optional(),
  requestId: z.string().max(160).optional(),
  errorMessage: z.string().max(500).optional(),
});
export type SlideImage = z.infer<typeof slideImageSchema>;
export const productionSlideSchema = z.object({
  slide_id: z.string(), number: z.number(), type: z.enum(slideTypes),
  headline: z.string(), body: z.string(), supporting_text: z.string(),
  visual_direction: z.string(), image_ref: z.string(), image_prompt: z.string(), layout_hint: z.string(), cta: z.string(),
  evidence_ids: evidenceIds,
  fact_checks: z.array(factCheckSchema).optional(),
  /** v3: 이 슬라이드에만 있는 소재 고유 디테일, 독자가 얻는 정보·재미(제작자용, 게시 안 함). */
  specific_detail: z.string().optional(),
  reader_gets: z.string().optional(),
  /** v4: 이 슬라이드가 쓴 Detail Bank 항목, 다음 장으로 넘길 이유(제작자용). */
  detail_ids: z.array(z.string()).optional(),
  to_next: z.string().optional(),
  /** v4: 편집 리뷰로 고쳐 쓴 슬라이드면 그 이유. */
  revised: z.string().optional(),
  /** 서버가 붙이는 검토 메모(게시용 아님). */
  review: z.array(z.string()).optional(),
  /** 슬라이드 고유 이미지 상태. image_ref는 이전 프로젝트·플러그인 하위 호환용으로 함께 유지한다. */
  image: slideImageSchema.optional(),
});
export const productionSceneSchema = z.object({
  scene_id: z.string(), time_range: z.string(), description: z.string(), visual_direction: z.string(),
  on_screen_text: z.string(), voice_over: z.string(), transition: z.string(), asset_ref: z.string(), image_prompt: z.string(),
  evidence_ids: evidenceIds,
  fact_checks: z.array(factCheckSchema).optional(),
  specific_detail: z.string().optional(),
  reader_gets: z.string().optional(),
  detail_ids: z.array(z.string()).optional(),
  to_next: z.string().optional(),
  revised: z.string().optional(),
  review: z.array(z.string()).optional(),
});
/** 제작자 전용 메모(E5). 게시용 캡션·카피에 넣지 않는다. */
export const editorNotesSchema = z.object({ fact_checks: z.array(z.string()), research_gaps: z.array(z.string()), image_rights: z.array(z.string()), ai_disclosure: z.string() });
export type EditorNotes = z.infer<typeof editorNotesSchema>;
/** v3: 슬라이드보다 먼저 쓰는 스토리라인(방향의 전개). WHY 항목 순서를 따르지 않는다. */
export const storyBeatSchema = z.object({ beat: z.string(), reader_gets: z.string() });
/** v4: Detail Bank 항목. status는 서버가 출처 ID를 원장과 대조해 정한다(verified / needs_check). */
export const detailItemSchema = z.object({ id: z.string(), detail: z.string(), example: z.string(), use: z.string(), source_ids: z.array(z.string()), status: z.enum(["verified", "needs_check"]) });
export type DetailItem = z.infer<typeof detailItemSchema>;
export const productionPlanSchema = z.object({
  detail_bank: z.array(detailItemSchema).optional(),
  storyline: z.array(storyBeatSchema).optional(),
  title: z.string(),
  concept_notice: z.string(),
  summary: z.string(),
  claims: z.array(z.object({ text: z.string(), evidence_ids: evidenceIds, status: analysisStatusSchema })),
  slides: z.array(productionSlideSchema),
  scenes: z.array(productionSceneSchema),
  caption: z.string(),
  hashtags: z.array(z.string()),
  verify_before_publishing: z.array(z.string()),
  editor_notes: editorNotesSchema.optional(),
});
export type ProductionPlan = z.infer<typeof productionPlanSchema>;
export type ProductionSlide = z.infer<typeof productionSlideSchema>;
export type ProductionScene = z.infer<typeof productionSceneSchema>;
export type ProductionValidation = {
  removedEvidenceIds: string[]; removedImageRefs: number; slideCountAdjusted: boolean; downgradedClaims: number; timingFixed: number;
  /** v2: 근거 없는 사실 주장이 있는 슬라이드·장면 번호(검증 필요). */
  needsReview?: number[];
  /** v2: TREND REPORT가 아닌데 게시용 문구에 남은 보고서식 표현. */
  reportPhrases?: Array<{ unit: number | "caption"; phrase: string }>;
  /** v2: 게시용 문구에서 지운 내부 근거 ID 수. */
  strippedRefs?: number;
  conceptNoticeAdded?: boolean;
};

export const emptySlideImage = (prompt = ""): SlideImage => ({ ...(prompt ? { prompt } : {}), status: "idle", source: null });
export const slideImageAssetId = (slide: Pick<ProductionSlide, "image" | "image_ref">) => slide.image?.assetId ?? slide.image_ref ?? "";
export const imageSourceForAsset = (asset: Pick<ImageAssetRef, "status">): SlideImage["source"] => asset.status === "REAL REFERENCE" ? "reference" : "ai";

/**
 * 저장된 프로젝트에는 이전 image_ref와 새 image.assetId가 함께 있을 수 있다.
 * 둘 중 실제 assets 레지스트리에 존재하는 값만 연결로 인정한다. 새 필드가
 * 유실되었거나 오래된 자산을 가리키면 유효한 legacy 값을 복구에 사용한다.
 */
export function resolvedSlideImageAssetId(slide: Pick<ProductionSlide, "image" | "image_ref">, assets: readonly Pick<ImageAssetRef, "id">[]) {
  const available = new Set(assets.map((asset) => asset.id));
  const current = slide.image?.assetId ?? "";
  const legacy = slide.image_ref ?? "";
  if (current && available.has(current)) return current;
  if (legacy && available.has(legacy)) return legacy;
  return "";
}

/** 이전 image_ref 프로젝트를 새 구조로 읽고, 두 필드를 항상 같은 값으로 쓴다. */
export function withSlideImage(slide: ProductionSlide, image: SlideImage): ProductionSlide {
  return { ...slide, image: { ...image, assetId: image.assetId || undefined }, image_ref: image.assetId ?? "" };
}
export function normalizedSlideImage(slide: ProductionSlide, asset?: ImageAssetRef): SlideImage {
  const assetId = slideImageAssetId(slide) || undefined;
  const current = slide.image ?? emptySlideImage(slide.image_prompt);
  return {
    ...current,
    ...(assetId ? { assetId } : {}),
    prompt: current.prompt ?? slide.image_prompt,
    status: assetId ? "ready" : current.status === "generating" ? "idle" : current.status,
    source: asset ? imageSourceForAsset(asset) : current.source,
    storagePath: asset ? asset.storagePath : current.storagePath,
    // dataUrl은 project.assets에 한 번만 둔다. slide에 복제하면 localStorage/Supabase payload가 배로 커진다.
    previewUrl: asset ? (asset.url ?? (asset.storagePath ? undefined : current.previewUrl)) : current.previewUrl,
  };
}

/** 자산 업로드/복원 후 슬라이드의 저장 경로·출처 메타데이터를 자산 레지스트리와 맞춘다. */
export function syncProjectSlideImages(project: StudioProject, assets = project.assets): StudioProject {
  if (!project.plan) return { ...project, assets };
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    ...project,
    assets,
    plan: {
      ...project.plan,
      slides: project.plan.slides.map((slide) => {
        const assetId = resolvedSlideImageAssetId(slide, assets);
        const asset = assetId ? byId.get(assetId) : undefined;
        if (!asset) return withSlideImage(slide, emptySlideImage(slide.image?.prompt ?? slide.image_prompt));
        return withSlideImage(slide, {
          ...normalizedSlideImage({ ...slide, image_ref: assetId, image: { ...(slide.image ?? emptySlideImage(slide.image_prompt)), assetId } }, asset),
          assetId,
          status: "ready",
          source: imageSourceForAsset(asset),
          requestId: undefined,
          errorMessage: undefined,
        });
      }),
    },
  };
}

export function beginSlideImageRequest(project: StudioProject, slideId: string, requestId: string, prompt: string): StudioProject | null {
  if (!project.plan) return null;
  let found = false;
  const byId = new Map(project.assets.map((asset) => [asset.id, asset]));
  const slides = project.plan.slides.map((slide) => {
    if (slide.slide_id !== slideId) return slide;
    found = true;
    return withSlideImage(slide, { ...normalizedSlideImage(slide, byId.get(slideImageAssetId(slide))), prompt, status: "generating", requestId, errorMessage: undefined });
  });
  return found ? { ...project, plan: { ...project.plan, slides } } : null;
}

/** requestId가 현재 슬라이드 요청과 다르면 null: 오래된 응답은 프로젝트를 한 글자도 바꾸지 않는다. */
export function resolveSlideImageRequest(project: StudioProject, slideId: string, requestId: string, asset: ImageAssetRef): StudioProject | null {
  if (!project.plan) return null;
  const target = project.plan.slides.find((slide) => slide.slide_id === slideId);
  if (!target || target.image?.requestId !== requestId) return null;
  const image: SlideImage = { assetId: asset.id, prompt: asset.prompt ?? target.image.prompt ?? target.image_prompt, status: "ready", source: imageSourceForAsset(asset), ...(asset.url ? { previewUrl: asset.url } : {}), ...(asset.storagePath ? { storagePath: asset.storagePath } : {}), requestId };
  const slides = project.plan.slides.map((slide) => slide.slide_id === slideId ? withSlideImage(slide, image) : slide);
  return { ...project, assets: [asset, ...project.assets.filter((item) => item.id !== asset.id)], plan: { ...project.plan, slides }, edited: true };
}

export function failSlideImageRequest(project: StudioProject, slideId: string, requestId: string, message: string): StudioProject | null {
  if (!project.plan) return null;
  const target = project.plan.slides.find((slide) => slide.slide_id === slideId);
  if (!target || target.image?.requestId !== requestId) return null;
  const slides = project.plan.slides.map((slide) => slide.slide_id === slideId ? withSlideImage(slide, { ...normalizedSlideImage(slide), status: "error", requestId, errorMessage: message }) : slide);
  return { ...project, plan: { ...project.plan, slides } };
}

const freshSlideId = (slides: ProductionSlide[], base: string) => {
  const used = new Set(slides.map((slide) => slide.slide_id));
  let id = base.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 100) || "slide";
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`.slice(0, 120);
  return id;
};

/** 순서가 바뀌어도 slide_id와 image 객체는 그대로 이동한다. */
export function reorderProductionSlide(plan: ProductionPlan, slideId: string, toIndex: number): ProductionPlan {
  const from = plan.slides.findIndex((slide) => slide.slide_id === slideId);
  if (from < 0) return plan;
  const slides = [...plan.slides];
  const [moved] = slides.splice(from, 1);
  slides.splice(Math.max(0, Math.min(toIndex, slides.length)), 0, moved);
  return { ...plan, slides: slides.map((slide, index) => ({ ...slide, number: index + 1 })) };
}

/** 복제본은 카피만 복제하고 이미지는 비운다. 같은 assetId를 공유하지 않는 것이 의도된 정책이다. */
export function duplicateProductionSlide(plan: ProductionPlan, slideId: string): ProductionPlan {
  const index = plan.slides.findIndex((slide) => slide.slide_id === slideId);
  if (index < 0) return plan;
  const original = plan.slides[index];
  const copy = withSlideImage({ ...original, slide_id: freshSlideId(plan.slides, `${original.slide_id}-copy`) }, emptySlideImage(original.image?.prompt ?? original.image_prompt));
  const slides = [...plan.slides.slice(0, index + 1), copy, ...plan.slides.slice(index + 1)];
  return { ...plan, slides: slides.map((slide, position) => ({ ...slide, number: position + 1 })) };
}

export function deleteProductionSlide(plan: ProductionPlan, slideId: string): ProductionPlan {
  const slides = plan.slides.filter((slide) => slide.slide_id !== slideId).map((slide, index) => ({ ...slide, number: index + 1 }));
  return slides.length === plan.slides.length ? plan : { ...plan, slides };
}

/** 서버 검증: 없는 근거 ID 제거, 근거 없는 주장 하향, 없는 이미지 참조 제거, 슬라이드 수·장면 시간 정리. */
export function validateProduction(plan: ProductionPlan, settings: ProductionSettings, ledgerIds: string[], assetIds: string[], options: { concept?: boolean } = {}): { plan: ProductionPlan; validation: ProductionValidation } {
  const ledger = new Set(ledgerIds), assets = new Set(assetIds);
  const removed: string[] = [];
  let removedImageRefs = 0, downgradedClaims = 0, timingFixed = 0, strippedRefs = 0;
  const mode = settingsMode(settings);
  const needsReview: number[] = [];
  const reportPhrases: NonNullable<ProductionValidation["reportPhrases"]> = [];
  const clean = (ids: string[]) => ids.filter((id) => { const ok = ledger.has(id); if (!ok) removed.push(id); return ok; });
  /** 게시용 문구: 내부 근거 ID를 지우고, 보고서식 표현을 기록한다(문장은 지우지 않는다 — 리포트 모드가 아니면 Editor Notes에 경고). */
  const publish = (value: string, unit: number | "caption") => {
    const { text, changed } = stripInternalRefs(value);
    if (changed) strippedRefs += 1;
    if (mode !== "report") for (const phrase of findReportPhrases(text)) reportPhrases.push({ unit, phrase });
    return text;
  };
  /** 사실 주장 검증: 근거가 없는 주장이 있으면 그 슬라이드를 "검증 필요"로 표시한다. */
  const facts = (items: FactCheck[] | undefined, unit: number) => {
    const checked = (items ?? []).map((item) => { const ids = clean(item.evidence_ids); return !ids.length && (item.status === "Verified Signal" || item.status === "Supported Hypothesis") ? { ...item, evidence_ids: ids, status: "Insufficient Evidence" as const } : { ...item, evidence_ids: ids }; });
    const unsupported = checked.filter((item) => item.status === "Insufficient Evidence");
    if (unsupported.length) needsReview.push(unit);
    return { fact_checks: checked, review: unsupported.map((item) => `검증 필요: ${item.text}`) };
  };
  const ref = (value: string) => { if (!value) return ""; if (assets.has(value)) return value; removedImageRefs += 1; return ""; };
  const claims = plan.claims.map((claim) => {
    const ids = clean(claim.evidence_ids);
    if (!ids.length && (claim.status === "Verified Signal" || claim.status === "Supported Hypothesis")) { downgradedClaims += 1; return { ...claim, evidence_ids: ids, status: "Insufficient Evidence" as const }; }
    return { ...claim, evidence_ids: ids };
  });
  // v4 Detail Bank: 출처 ID를 원장과 대조해 검증 상태를 서버가 정한다(모델이 쓴 status는 믿지 않는다).
  const detail_bank = plan.detail_bank?.map((item, index) => { const source_ids = clean(item.source_ids); return { ...item, id: `D${index + 1}`, source_ids, status: source_ids.length ? "verified" as const : "needs_check" as const }; });
  const bankIds = new Map((plan.detail_bank ?? []).map((item, index) => [item.id, `D${index + 1}`]));
  const detailRefs = (ids: string[] | undefined) => ids ? [...new Set(ids.map((id) => bankIds.get(id)).filter((id): id is string => Boolean(id)))] : undefined;
  let slides: ProductionSlide[] = [], scenes: ProductionScene[] = [];
  let slideCountAdjusted = false;
  if (settings.format === "cardnews") {
    const kept = plan.slides.slice(0, settings.slideCount);
    slideCountAdjusted = kept.length !== plan.slides.length || kept.length < 4;
    const usedIds = new Set<string>();
    slides = kept.map((slide, index) => {
      const candidate = slide.slide_id?.trim() || `slide-${index + 1}`;
      let slide_id = candidate, suffix = 2;
      while (usedIds.has(slide_id)) slide_id = `${candidate}-${suffix++}`;
      usedIds.add(slide_id);
      const image_ref = ref(slideImageAssetId(slide));
      const currentImage = normalizedSlideImage(slide);
      const image: SlideImage = image_ref
        ? { ...currentImage, assetId: image_ref, status: "ready" }
        : { ...currentImage, assetId: undefined, status: currentImage.status === "error" ? "error" : "idle", source: null, storagePath: undefined, previewUrl: undefined, requestId: undefined };
      return { ...slide, number: index + 1, slide_id, evidence_ids: clean(slide.evidence_ids), image_ref, image,
        headline: publish(slide.headline, index + 1), body: publish(slide.body, index + 1), supporting_text: publish(slide.supporting_text, index + 1), cta: publish(slide.cta, index + 1), ...facts(slide.fact_checks, index + 1), detail_ids: detailRefs(slide.detail_ids) };
    });
  } else {
    let cursor = 0;
    scenes = plan.scenes.map((scene, index) => {
      const match = scene.time_range.match(/(\d+(?:\.\d+)?)\s*[-~–]\s*(\d+(?:\.\d+)?)/);
      let start = match ? Number(match[1]) : cursor, end = match ? Number(match[2]) : cursor + 3;
      if (start !== cursor || end <= start || end > settings.durationSec) { timingFixed += 1; start = cursor; end = Math.min(settings.durationSec, Math.max(start + 1, end)); }
      cursor = end;
      return { ...scene, scene_id: `scene-${index + 1}`, time_range: `${start}-${end}s`, evidence_ids: clean(scene.evidence_ids), asset_ref: ref(scene.asset_ref),
        on_screen_text: publish(scene.on_screen_text, index + 1), voice_over: publish(scene.voice_over, index + 1), ...facts(scene.fact_checks, index + 1), detail_ids: detailRefs(scene.detail_ids) };
    }).filter((scene) => Number(scene.time_range.split("-")[0]) < settings.durationSec);
  }
  const caption = publish(plan.caption, "caption");
  const hashtags = plan.hashtags.map((tag) => stripInternalRefs(tag).text).filter(Boolean);
  // 가상 콘셉트는 실제 출시처럼 보이지 않게 항상 표시한다.
  const conceptNoticeAdded = (mode === "concept" || Boolean(options.concept)) && !plan.concept_notice.trim();
  const concept_notice = conceptNoticeAdded ? CONCEPT_NOTICE_DEFAULT : plan.concept_notice;
  return { plan: { ...plan, ...(detail_bank ? { detail_bank } : {}), concept_notice, claims, slides, scenes, caption, hashtags }, validation: { removedEvidenceIds: [...new Set(removed)], removedImageRefs, slideCountAdjusted, downgradedClaims, timingFixed, needsReview, reportPhrases, strippedRefs, conceptNoticeAdded } };
}

/* ---------- 프로젝트(저장 단위) ---------- */

export type StudioProject = {
  id: string;
  mode: "single" | "creative";
  title: string;
  source: { trendKeys: string[]; trendNames: string[]; creativeRunId?: string; ideaId?: string };
  concept?: CreativeConcept;
  settings: ProductionSettings;
  plan?: ProductionPlan;
  validation?: ProductionValidation;
  /** E2: 제안받은 콘텐츠 방향과 사용자가 고른 방향(고칠 수 있음). v1 프로젝트에는 없다. */
  angles?: { items: ContentAngle[]; mode: ContentMode; validation: AngleValidation; model: string; generatedAt: string };
  angle?: ContentAngle;
  /** ENGINE V2: 사용자가 직접 입력한 주제(가장 우선). */
  customTopic?: string;
  /** T4: Overview에서 고른 세부 현상의 맥락(현상 ID·핵심 행동·관측 기간·근거 ID). */
  phenomenon?: PhenomenonContext;
  /** T6: 편집 맥락 잠금. 현상에서 들어온 프로젝트는 모든 방향·슬라이드가 이 현상에 고정된다. */
  contextLock?: EditorialContextLock;
  /** ENGINE V2: 마지막 생성 결과의 품질 게이트(규칙 검사, 사용자 평가 아님). */
  quality?: QualityReport;
  /** V2.1: 편집 리뷰(AI 참고 점수, 사용자 평가 아님)와 부분 수정 기록. */
  review?: EditorialReview;
  /** DESIGN ENGINE V2: 카드뉴스 디자인 설정(비우면 자동). */
  design?: Partial<DesignControls>;
  /** 이 프로젝트에서 쓰는 이미지: 실제 근거(REAL REFERENCE)·콘셉트 시안·제작용 이미지. */
  assets: ImageAssetRef[];
  /** 사용자가 생성 결과를 직접 고쳤는지(다시 생성 전 확인용). */
  edited: boolean;
  model?: string;
  promptVersion?: string;
  generatedAt?: string;
  createdAt: string;
  updatedAt: string;
};
export type SavedStudioProjectPayload = { kind: "studio-project"; project: StudioProject };
export const isStudioProjectPayload = (payload: unknown): payload is SavedStudioProjectPayload => {
  const p = payload as Partial<SavedStudioProjectPayload> | null | undefined;
  return Boolean(p && p.kind === "studio-project" && p.project && typeof p.project.id === "string" && p.project.settings && Array.isArray(p.project.assets));
};

/** Creative 아이디어 → Studio 초기 콘셉트(사용자가 고칠 수 있음). */
export function conceptFromIdea(run: CreativeRun, idea: CreativeIdea): CreativeConcept {
  const brief = idea.visual_brief;
  return {
    runId: run.id, ideaId: idea.id, title: idea.title, concept: idea.concrete_output ? `${idea.concept_line} ${idea.concrete_output}` : idea.concept_line,
    rationale: idea.cultural_connection ?? idea.why_it_works, level: idea.creativity_level, ideaType: idea.idea_type, evidenceMode: idea.evidence_mode,
    hooks: [idea.cardnews_hook, ...idea.cardnews_slides.filter((slide) => slide.role === "cover").map((slide) => slide.headline)].filter(Boolean).slice(0, 3),
    audience: idea.audience_appeal,
    visualBrief: `피사체 ${brief.core_subject} / 배경 ${brief.background} / 조명 ${brief.lighting} / 샷 ${brief.shot_type} / 컬러 ${brief.color_direction} / 스타일링 ${brief.styling_direction} / 활용 ${brief.platform_use_case}`,
    imagePrompt: idea.image_prompt, ipCaution: idea.ip_caution, trendKeys: [...run.trendKeys],
  };
}

/** Creative 실행의 콘셉트 이미지를 프로젝트 이미지 참조로 가져온다(재사용). */
export function conceptAssets(run: CreativeRun): ImageAssetRef[] {
  return run.visuals.map((visual) => ({
    id: `concept-${run.id}-${visual.ideaId}`, status: "AI CONCEPT VISUAL", dataUrl: visual.dataUrl, storagePath: visual.storagePath,
    title: run.result.ideas.find((idea) => idea.id === visual.ideaId)?.title ?? "콘셉트 시안", prompt: visual.prompt, model: visual.model,
    aspect: "1:1", purpose: "concept", width: visual.width, height: visual.height, createdAt: visual.createdAt, rights: rightsNote["AI CONCEPT VISUAL"], inspired: visual.inspired,
  }));
}

/** 프로젝트 ID: 같은 아이디어·같은 트렌드로 다시 들어오면 같은 프로젝트를 이어서 연다(새로고침 복원). */
export const projectIdFor = (mode: "single" | "creative", key: string) => `studio-${mode}-${key}`.replace(/[^A-Za-z0-9_\-가-힣]/g, "_").slice(0, 120);

export function canvasSize(aspect: ImageAspect | ProductionSettings["aspect"]) {
  return aspect === "1:1" ? { width: 1080, height: 1080 } : aspect === "4:5" ? { width: 1080, height: 1350 } : aspect === "9:16" ? { width: 1080, height: 1920 } : { width: IMAGE_SIZES["16:9"].width, height: IMAGE_SIZES["16:9"].height };
}
