import { z } from "zod";
import { FIGMA_EXPORT_SCHEMA } from "./figma-export";

/*
 * FIGMA DIRECT EXPORT 공용 정의(웹·서버·테스트).
 * Figma REST API는 캔버스에 프레임·텍스트를 만들 수 없다(읽기·댓글·변수 등만). 편집 가능한 디자인은 Plugin API로만 만들 수 있고,
 * 플러그인은 사용자가 Figma에서 실행해야 한다. 그래서 웹은 "작업(Handoff)"을 Supabase에 저장하고, 플러그인이 그것을 가져온다.
 */
export const HANDOFF_TTL_HOURS = 24;
export const HANDOFF_MAX_CHARS = 5_000_000;
export const PAIRING_TTL_MINUTES = 10;

/** 플러그인이 받아도 되는 이미지 주소: 계정 저장소(Supabase Storage) 서명 링크 또는 이 브라우저의 축소본. */
export const SIGNED_STORAGE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/sign\//;
export const INLINE_IMAGE_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const allowedFigmaImageUrl = (url: string) => SIGNED_STORAGE_URL.test(url) || INLINE_IMAGE_URL.test(url);

const element = z.object({ id: z.string().max(200), type: z.enum(["TEXT", "IMAGE"]) }).passthrough();
const unit = z.object({ id: z.string().min(1).max(200), type: z.string().max(40), number: z.number().int().min(1).max(60), layoutTemplateId: z.string().max(60), elements: z.array(element).max(20) }).passthrough();
const asset = z.object({
  id: z.string().min(1).max(200), status: z.enum(["REAL REFERENCE", "AI CONCEPT VISUAL", "AI PRODUCTION ASSET"]), title: z.string().max(300),
  figmaImage: z.object({ url: z.string().max(3_000_000).refine(allowedFigmaImageUrl, "허용되지 않은 이미지 주소"), expiresAt: z.string().nullable(), kind: z.enum(["signed", "inline"]) }).optional(),
}).passthrough().refine((item) => item.status !== "REAL REFERENCE" || !item.figmaImage, "실제 근거 이미지는 Figma로 복제하지 않습니다.");

/** 서버가 저장하기 전에 확인하는 Figma 디자인 데이터(trend-radar.figma-export/v1). */
export const handoffExportSchema = z.object({
  schema: z.literal(FIGMA_EXPORT_SCHEMA),
  exportedAt: z.string().max(40),
  project: z.object({
    id: z.string().min(1).max(200), title: z.string().max(300), format: z.enum(["cardnews", "shortform"]),
    canvas: z.object({ width: z.number().int().min(100).max(4000), height: z.number().int().min(100).max(4000) }).passthrough(),
    visualTheme: z.object({ tokens: z.record(z.string(), z.unknown()) }).passthrough(),
  }).passthrough(),
  slides: z.array(unit).min(1, "슬라이드·장면이 없습니다.").max(30),
  assets: z.array(asset).max(40),
}).passthrough();
export type HandoffExport = z.infer<typeof handoffExportSchema>;

/**
 * 중복 생성 방지용 내용 해시. 같은 프로젝트의 같은 내용이면 아직 유효한 기존 작업을 다시 쓴다.
 * 서명 링크·내보낸 시각·handoff 블록은 매번 바뀌므로 뺀다(축소본은 내용으로 비교).
 */
export function handoffContentHash(exported: HandoffExport, hash: (value: string) => string) {
  const stable = { ...exported, exportedAt: undefined, handoff: undefined, assets: exported.assets.map((item) => ({ ...item, figmaImage: item.figmaImage ? { kind: item.figmaImage.kind, inline: item.figmaImage.kind === "inline" ? hash(item.figmaImage.url) : undefined } : undefined })) };
  return hash(JSON.stringify(stable));
}

/** 플러그인 화면과 웹 완료 표시가 같은 짧은 코드를 보여 준다(확인용, 접근 키가 아님). */
export const shortCode = (handoffId: string) => handoffId.slice(0, 6).toUpperCase();

export type HandoffSummary = { id: string; projectId: string; title: string; format: "cardnews" | "shortform"; unitCount: number; createdAt: string; expiresAt: string; importedAt: string | null; importCount: number; expired: boolean; code: string };
export type HandoffCreated = { handoffId: string; code: string; expiresAt: string; duplicate: boolean; images: { included: number; signed: number; inline: number } };

/** 웹·플러그인 공통 오류 코드 → 안내 문구. */
export const HANDOFF_ERRORS = {
  AUTH_REQUIRED: "로그인이 필요합니다.",
  PLUGIN_AUTH_REQUIRED: "Figma 플러그인 연결이 필요합니다. 플러그인에서 “TREND RADAR 연결”을 눌러 다시 연결하세요.",
  HANDOFF_EXPIRED: "작업이 만료됐습니다(24시간). Content Studio에서 다시 “Figma로 보내기”를 누르세요.",
  HANDOFF_NOT_FOUND: "작업을 찾을 수 없습니다. 같은 계정으로 연결했는지 확인하세요.",
  HANDOFF_NOT_CONFIGURED: "Figma 전송 저장소가 준비되지 않았습니다. Supabase SQL Editor에서 202611020009_figma_handoffs.sql을 실행해야 합니다.",
  PAIRING_EXPIRED: "연결 요청이 만료됐습니다(10분). 플러그인에서 다시 연결하세요.",
  RATE_LIMITED: "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
  UPSTREAM_ERROR: "서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.",
} as const;
export type HandoffErrorCode = keyof typeof HANDOFF_ERRORS;
