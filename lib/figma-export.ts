import { canvasSize, resolvedSlideImageAssetId, settingsMode, type StudioProject } from "./content-production";
import { contentModeInfo } from "./editorial";
import type { CardDesign } from "./card-design";
import type { ImageAssetRef } from "./image-assets";

/*
 * C6 Figma readiness. figma-plugin/(V5 로컬 플러그인)이 이 JSON을 읽어
 * figma.createFrame()(슬라이드) · figma.createText()(텍스트 요소) · figma.createImage(bytes) + IMAGE fill(이미지 요소)로
 * 프레임을 만들 수 있게 필드를 나눠 둔다. 텍스트와 이미지는 서로 다른 요소이고, 슬라이드마다 따로 고칠 수 있다.
 * E6: 게시용(slides·copy.caption·hashtags)과 제작자 메모(editorNotes)를 나눈다. 스키마 이름(v1)은 유지하고 필드만 더했다 —
 * editorNotes·project.contentMode·project.angle이 없는 이전 JSON도 플러그인이 그대로 읽는다.
 */
export const FIGMA_EXPORT_SCHEMA = "trend-radar.figma-export/v1";

/** 템플릿 ID → 레이아웃 규칙(후속 플러그인이 같은 ID의 Figma 컴포넌트에 매핑). */
export const LAYOUT_TEMPLATES = {
  "cover-fullbleed": "이미지 전체 배경 + 하단 헤드라인",
  "text-top-image-bottom": "상단 헤드라인·본문 + 하단 이미지",
  "text-only": "중앙 정렬 텍스트",
  "quote-card": "큰 인용 문구 + 출처",
  "cta-end": "CTA 버튼형 마무리",
  "video-frame": "9:16 장면 프레임(자막 하단)",
} as const;
export type LayoutTemplateId = keyof typeof LAYOUT_TEMPLATES;

/** 현재 디자인 시스템(Y2K 픽셀 데스크톱)에서 가져온 기본 토큰. 브랜드가 정해지면 바꿔 끼운다. */
export const DEFAULT_TOKENS = {
  color: { background: "#FFFFFF", surface: "#EEF1FF", ink: "#14161F", accent: "#1F2FE0", highlight: "#F6FF3A", pink: "#FF4FA3", muted: "#5D6170" },
  typography: {
    headline: { family: "Galmuri11", fallback: "Pretendard", size: 64, weight: 700, lineHeight: 1.2 },
    body: { family: "Pretendard", fallback: "Noto Sans KR", size: 34, weight: 500, lineHeight: 1.5 },
    caption: { family: "Pretendard", fallback: "Noto Sans KR", size: 24, weight: 400, lineHeight: 1.4 },
    cta: { family: "Pretendard", fallback: "Noto Sans KR", size: 36, weight: 800, lineHeight: 1.2 },
  },
} as const;

const templateFor = (type: string, hasImage: boolean, format: StudioProject["settings"]["format"]): LayoutTemplateId =>
  format === "shortform" ? "video-frame" : type === "cover" ? (hasImage ? "cover-fullbleed" : "text-only") : type === "cta" || type === "closing" ? "cta-end" : type === "evidence" ? "quote-card" : hasImage ? "text-top-image-bottom" : "text-only";

/** 플러그인이 내려받아 IMAGE fill로 쓸 주소. AI 생성 이미지에만 붙는다(실제 근거 이미지는 복제하지 않고 링크로만 둔다). */
export type FigmaImageSource = { url: string; expiresAt: string | null; kind: "signed" | "inline" };
type ExportAsset = { id: string; status: ImageAssetRef["status"]; title: string; source: { kind: "storage"; path: string } | { kind: "url"; url: string } | { kind: "embedded"; note: string } | { kind: "missing" }; figmaImage?: FigmaImageSource; width?: number; height?: number; rights: string; attribution: string; prompt?: string; model?: string };

/** design: Studio가 기획한 카드뉴스 디자인(장면). 있으면 플러그인이 이 장면대로 그리고, 없으면(이전 JSON) 기존 방식으로 그린다. */
export function toFigmaExport(project: StudioProject, exportedAt = new Date().toISOString(), images: Record<string, FigmaImageSource> = {}, options: { design?: CardDesign } = {}) {
  const plan = project.plan;
  const canvas = canvasSize(project.settings.aspect);
  const assets: ExportAsset[] = project.assets.map((asset) => ({
    id: asset.id, status: asset.status, title: asset.title, width: asset.width, height: asset.height, rights: asset.rights, prompt: asset.prompt, model: asset.model,
    // 이미지 바이너리는 JSON에 넣지 않는다(크기·권리). 계정 저장소 경로·원본 URL로 참조한다.
    source: asset.storagePath ? { kind: "storage", path: asset.storagePath } : asset.url ? { kind: "url", url: asset.url } : asset.dataUrl ? { kind: "embedded", note: "이 브라우저에만 있는 축소본 — 계정에 저장하면 storage 경로가 생깁니다." } : { kind: "missing" },
    ...(asset.status !== "REAL REFERENCE" && images[asset.id] ? { figmaImage: images[asset.id] } : {}),
    attribution: asset.status === "REAL REFERENCE" ? `원본: ${asset.sourceUrl ?? asset.url ?? "출처 미상"} (게시자 권리)` : `AI 생성 이미지 (${asset.model ?? "모델 미상"}) — 실제 사진 아님`,
  }));
  const text = (id: string, role: keyof typeof DEFAULT_TOKENS.typography, content: string) => content ? [{ id, type: "TEXT" as const, role, content, typographyToken: `typography.${role}` }] : [];
  const units = project.settings.format === "cardnews"
    ? (plan?.slides ?? []).map((slide) => {
        // 깨진/오래된 참조는 Figma payload에 보내지 않는다. export의 IMAGE는
        // 반드시 같은 프로젝트 assets에 실제로 존재하는 자산만 가리킨다.
        const imageAssetId = resolvedSlideImageAssetId(slide, project.assets);
        return ({
        id: slide.slide_id, type: slide.type, number: slide.number, layoutTemplateId: templateFor(slide.type, Boolean(imageAssetId), "cardnews"),
        background: { colorToken: slide.type === "cover" ? "color.surface" : "color.background", imageAssetId: slide.type === "cover" && imageAssetId ? imageAssetId : null },
        elements: [
          ...text(`${slide.slide_id}-headline`, "headline", slide.headline),
          ...text(`${slide.slide_id}-body`, "body", slide.body),
          ...text(`${slide.slide_id}-support`, "caption", slide.supporting_text),
          ...text(`${slide.slide_id}-cta`, "cta", slide.cta),
          ...(imageAssetId ? [{ id: `${slide.slide_id}-image`, type: "IMAGE" as const, assetId: imageAssetId }] : []),
        ],
        designNotes: { visualDirection: slide.visual_direction, layoutHint: slide.layout_hint, imagePrompt: slide.image_prompt },
        sourceAttribution: slide.evidence_ids,
      })})
    : (plan?.scenes ?? []).map((scene, index) => ({
        id: scene.scene_id, type: "scene", number: index + 1, timeRange: scene.time_range, layoutTemplateId: "video-frame" as LayoutTemplateId,
        background: { colorToken: "color.ink", imageAssetId: scene.asset_ref || null },
        elements: [...text(`${scene.scene_id}-onscreen`, "headline", scene.on_screen_text), ...(scene.asset_ref ? [{ id: `${scene.scene_id}-image`, type: "IMAGE" as const, assetId: scene.asset_ref }] : [])],
        designNotes: { visualDirection: scene.visual_direction, description: scene.description, voiceOver: scene.voice_over, transition: scene.transition, imagePrompt: scene.image_prompt },
        sourceAttribution: scene.evidence_ids,
      }));
  return {
    schema: FIGMA_EXPORT_SCHEMA,
    exportedAt,
    project: {
      id: project.id, title: plan?.title ?? project.title, brand: project.settings.brand || null, format: project.settings.format,
      canvas: { ...canvas, aspect: project.settings.aspect }, mode: project.mode, source: project.source,
      conceptNotice: plan?.concept_notice ?? "",
      contentMode: settingsMode(project.settings), contentModeLabel: contentModeInfo[settingsMode(project.settings)].label,
      angle: project.angle ? { title: project.angle.title, hook: project.angle.hook, perspective: project.angle.editorial_perspective, audience: project.angle.target_audience } : null,
      visualTheme: { name: "trend-radar-y2k-pixel", tokens: DEFAULT_TOKENS }, layoutTemplates: LAYOUT_TEMPLATES,
    },
    slides: units,
    assets,
    copy: { caption: plan?.caption ?? "", hashtags: plan?.hashtags ?? [], verifyBeforePublishing: plan?.verify_before_publishing ?? [] },
    ...(options.design ? { design: options.design } : {}),
    /** 제작자 전용. Figma에서도 게시용 프레임과 다른 EDITOR NOTES 프레임에 둔다. */
    editorNotes: {
      summary: plan?.summary ?? "",
      /** T8: 편집 맥락 잠금(현상·핵심 행동·근거 상태·다루지 않을 주제). 이전 JSON에는 없다. */
      contextLock: project.contextLock?.enabled ? [`선택한 현상: ${project.contextLock.selectedPhenomenon} (상위 키워드 ${project.contextLock.parentKeyword} · ${project.contextLock.evidenceStatus})`, `핵심 행동: ${project.contextLock.coreBehavior || "—"}`, `편집 초점: ${project.contextLock.editorialFocus || "—"}`, `관측 근거: ${project.contextLock.observedEvidenceIds.join(", ") || "없음(근거 부족)"}`, ...(project.contextLock.creativeHypothesis ? [`창작 가설(사실 아님): ${project.contextLock.creativeHypothesis}`] : []), `다루지 않을 주제: ${project.contextLock.prohibitedTopicDrift.map((item) => item.label).join(" / ")}`] : [],
      claims: (plan?.claims ?? []).map((claim) => ({ text: claim.text, status: claim.status, evidenceIds: claim.evidence_ids })),
      needsReview: [...(plan?.slides ?? []).map((slide) => ({ unitId: slide.slide_id, label: `슬라이드 ${slide.number}`, items: slide.review ?? [] })), ...(plan?.scenes ?? []).map((scene) => ({ unitId: scene.scene_id, label: scene.time_range, items: scene.review ?? [] }))].filter((item) => item.items.length),
      factChecks: plan?.editor_notes?.fact_checks ?? [],
      researchGaps: plan?.editor_notes?.research_gaps ?? [],
      imageRights: plan?.editor_notes?.image_rights ?? [],
      aiDisclosure: plan?.editor_notes?.ai_disclosure ?? "",
      reportPhrases: project.validation?.reportPhrases ?? [],
      storyline: (plan?.storyline ?? []).map((beat) => `${beat.beat} → ${beat.reader_gets}`),
      qualityGate: project.quality ? project.quality.checks.map((check) => `${check.group === "editorial" ? "[편집 신호] " : "[필수] "}${check.pass ? "○" : "×"} ${check.label} — ${check.detail}`) : [],
      detailBank: (plan?.detail_bank ?? []).map((item) => `${item.id} ${item.detail} — ${item.status === "verified" ? `근거 ${item.source_ids.join(", ")}` : "검증 필요"}`),
      review: project.review ? `AI 참고 점수(사용자 평가 아님): 후킹 ${project.review.scores.hook} · 고유성 ${project.review.scores.specificity} · 전개 ${project.review.scores.story} · 저장·공유 ${project.review.scores.save_share} · 문체 ${project.review.scores.voice} / 고쳐 쓴 곳 ${project.review.patched.length}` : "",
    },
  };
}
export type FigmaExport = ReturnType<typeof toFigmaExport>;
