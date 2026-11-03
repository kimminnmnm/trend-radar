import { z } from "zod";
import { briefBlock, imageBriefSchema, type ImageBrief } from "./image-brief";

/*
 * C4 이미지 공통 정의(클라이언트·서버 공용).
 * - 이미지 상태를 셋으로 구분한다. 실제 근거 이미지와 생성 이미지를 섞지 않는다.
 *   REAL REFERENCE: 트렌드 근거로 수집한 실제 이미지(원본 URL만, 복제 저장 없음)
 *   AI CONCEPT VISUAL: Creative Collision 아이디어를 시각화한 AI 시안
 *   AI PRODUCTION ASSET: Content Studio 슬라이드·장면용으로 만든 AI 이미지
 * - 크기는 공식 문서(2026-10, image generation guide)의 조건만 쓴다:
 *   권장 1024x1024·1536x1024·1024x1536, 사용자 지정 WxH는 16의 배수·비율 1:3~3:1·픽셀 655,360~8,294,400.
 */
export const imageStatuses = ["REAL REFERENCE", "AI CONCEPT VISUAL", "AI PRODUCTION ASSET"] as const;
export type ImageStatus = (typeof imageStatuses)[number];

export const IMAGE_SIZES = {
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 1024, height: 1280 },
  "9:16": { width: 864, height: 1536 },
  "16:9": { width: 1536, height: 864 },
} as const;
export type ImageAspect = keyof typeof IMAGE_SIZES;
export const imageAspects = Object.keys(IMAGE_SIZES) as ImageAspect[];

/** 공식 크기 조건을 만족하는지(서버 허용 목록의 근거). */
export function validImageSize(width: number, height: number) {
  const ratio = width / height, pixels = width * height;
  return width % 16 === 0 && height % 16 === 0 && ratio >= 1 / 3 && ratio <= 3 && pixels >= 655_360 && pixels <= 8_294_400 && Math.max(width, height) <= 3840;
}

export const imagePurposes = ["concept", "cover", "body", "thumbnail", "background"] as const;
export type ImagePurpose = (typeof imagePurposes)[number];
export const imagePurposeLabels: Record<ImagePurpose, string> = { concept: "콘셉트 시안", cover: "카드뉴스 표지", body: "본문 시각 자료", thumbnail: "숏폼 썸네일", background: "배경 이미지" };
export const imageStyles = ["photo", "3d-render", "illustration", "flat-graphic", "collage"] as const;
export type ImageStyle = (typeof imageStyles)[number];
export const imageStyleLabels: Record<ImageStyle, string> = { photo: "사진", "3d-render": "3D 렌더", illustration: "일러스트", "flat-graphic": "플랫 그래픽", collage: "콜라주" };

export const imageRequestSchema = z.object({
  prompt: z.string().trim().min(20).max(2000),
  aspect: z.enum(imageAspects as [ImageAspect, ...ImageAspect[]]).default("1:1"),
  purpose: z.enum(imagePurposes).default("concept"),
  style: z.enum(imageStyles).optional(),
  subject: z.string().trim().max(300).optional(),
  background: z.string().trim().max(300).optional(),
  colors: z.string().trim().max(200).optional(),
  /** T7: 장면의 의미 구조(주체·행동·대상·문화 맥락·시각 방향·장면 목적·금지 해석). 없으면 기존 프롬프트 그대로. */
  brief: imageBriefSchema.optional(),
  force: z.boolean().default(false),
});
export type ImageRequest = z.infer<typeof imageRequestSchema>;

/** 사용자 설정을 덧붙인 최종 프롬프트. 글자·로고·실존 인물·저작권 캐릭터를 피하도록 고정 문구를 붙인다. */
export function composeImagePrompt(request: Pick<ImageRequest, "prompt" | "purpose" | "style" | "subject" | "background" | "colors" | "aspect" | "brief">) {
  // T7: 의미 블록이 먼저, 편집자가 쓴 장면 문장은 그 안의 아이디어로.
  const parts = request.brief ? [briefBlock(request.brief), `Editor's scene idea: ${request.prompt.trim()}`] : [request.prompt.trim()];
  if (request.subject) parts.push(`Main subject: ${request.subject}.`);
  if (request.background) parts.push(`Background: ${request.background}.`);
  if (request.colors) parts.push(`Color palette: ${request.colors}.`);
  if (request.style) parts.push(`Style: ${request.style.replace("-", " ")}.`);
  parts.push(request.purpose === "concept" ? "Concept visual for ideation only." : `Production asset for social content (${imagePurposeLabels[request.purpose]}, ${request.aspect}); leave clean space for headline text added later in design.`);
  parts.push("Do not render any text, letters or logos. No real people. No copyrighted characters or brand marks; if a character is implied, design an original inspired look.");
  return parts.join(" ");
}

/** 프로젝트·아이디어에서 쓰는 이미지 참조. 로컬에는 dataUrl, 계정에는 storagePath(가능하면)를 둔다. */
export type ImageAssetRef = {
  id: string;
  status: ImageStatus;
  /** 생성 이미지(축소본) — 이 브라우저에만 있을 수 있다. */
  dataUrl?: string;
  /** Supabase Storage 비공개 버킷 경로(user_id/...). 계정 복원 시 서명 URL로 연다. */
  storagePath?: string;
  /** REAL REFERENCE의 원본 이미지 URL(복제하지 않음). */
  url?: string;
  sourceUrl?: string;
  title: string;
  prompt?: string;
  model?: string;
  aspect?: ImageAspect;
  purpose?: ImagePurpose;
  width?: number;
  height?: number;
  createdAt: string;
  /** 사용 권한·출처 표시(피그마 내보내기에도 포함). */
  rights: string;
  inspired?: boolean;
  /** T7: 생성 때 보낸 의미 구조(슬라이드별). */
  brief?: ImageBrief;
};

export const rightsNote: Record<ImageStatus, string> = {
  "REAL REFERENCE": "실제 게시물·영상 이미지. 원본 링크로만 참고하고 카드뉴스에 그대로 쓰려면 권리자 허락이 필요합니다.",
  "AI CONCEPT VISUAL": "AI 생성 시안. 실제 제품·현장 사진이 아니며 공개 전 IP·브랜드 유사성을 확인하세요.",
  "AI PRODUCTION ASSET": "AI 생성 제작용 이미지. 공개 전 IP·브랜드 유사성과 플랫폼 AI 표기 정책을 확인하세요.",
};

/** 생성 이미지를 목표 비율로 가운데 자르고 긴 변을 maxEdge로 줄여 JPEG data URL로 만든다(브라우저 전용). */
export async function shrinkImage(base64: string, aspect: ImageAspect, maxEdge = 640): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = new Image();
  img.src = `data:image/jpeg;base64,${base64}`;
  await img.decode();
  const target = IMAGE_SIZES[aspect].width / IMAGE_SIZES[aspect].height;
  let sw = img.width, sh = img.height;
  if (sw / sh > target) sw = Math.round(sh * target); else sh = Math.round(sw / target);
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale)); canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext("2d")!.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.82), width: canvas.width, height: canvas.height };
}
