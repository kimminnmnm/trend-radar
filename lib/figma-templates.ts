import { z } from "zod";

/*
 * MY TEMPLATES PREVIEW & SYNC 공용 정의(웹·서버·테스트). 플러그인(figma-plugin/code.js)도 같은 이름·규칙을 쓴다.
 * 템플릿 디자인은 사용자의 Figma 파일에 있고, 웹은 플러그인이 동기화한 메타데이터·썸네일만 본다(원본을 수정하지 않는다).
 */
export const TEMPLATE_IDS = ["TEMPLATE_COVER_01", "TEMPLATE_COVER_02", "TEMPLATE_COVER_03", "TEMPLATE_BODY_01", "TEMPLATE_BODY_02", "TEMPLATE_BODY_03", "TEMPLATE_CTA_01", "TEMPLATE_CTA_02"] as const;
export const TEMPLATE_ID_PATTERN = /^TEMPLATE_(COVER|BODY|CTA)_\d{2}$/;
export type TemplateType = "COVER" | "BODY" | "CTA";
export const templateTypeOf = (templateId: string): TemplateType | null => (TEMPLATE_ID_PATTERN.exec(templateId)?.[1] as TemplateType | undefined) ?? null;
/** 썸네일·렌더링 PNG 상한(바이트). base64로 저장하므로 DB 열 상한(200만 자)보다 작게 둔다. */
export const TEMPLATE_PNG_MAX_BYTES = 1_400_000;
export const TEMPLATE_SYNC_MAX_CHARS = 2_200_000;

export type TemplatePlaceholders = { slots: string[]; imageSlots: number; background: string | null; summary: string; warnings: string[] };
export type SyncedTemplate = {
  templateId: string; type: TemplateType; name: string; width: number; height: number;
  fileKey: string | null; fileName: string; nodeId: string; placeholders: TemplatePlaceholders;
  version: number; status: "SYNCED" | "MISSING" | "FAILED"; error: string | null;
  syncedAt: string; checkedAt: string; changeDetectedAt: string | null; hasThumbnail: boolean;
};
export type RenderedPreview = { slideId: string; templateId: string; previewKey: string; templateVersion: number | null; width: number; height: number; renderedAt: string };

/**
 * 웹에 보이는 상태. UPDATE AVAILABLE은 플러그인이 템플릿을 점검하다가 저장된 디자인 지문과 다른 것을 실제로 찾았을 때만이다.
 * Figma 파일을 열지 않으면 원본 변경을 알 수 없으므로, 그 밖에는 SYNCED와 마지막 동기화 시각만 보여 준다.
 */
export type TemplateStatus = "SYNCED" | "UPDATE AVAILABLE" | "MISSING TEMPLATE" | "SYNC FAILED";
export function templateStatus(template: Pick<SyncedTemplate, "status" | "changeDetectedAt" | "syncedAt">): TemplateStatus {
  if (template.status === "MISSING") return "MISSING TEMPLATE";
  if (template.status === "FAILED") return "SYNC FAILED";
  if (template.changeDetectedAt && Date.parse(template.changeDetectedAt) >= Date.parse(template.syncedAt)) return "UPDATE AVAILABLE";
  return "SYNCED";
}
export const templateStatusNotes: Record<TemplateStatus, string> = {
  SYNCED: "마지막 동기화 이후 Figma에서 바뀐 내용은 플러그인을 열어야 확인됩니다.",
  "UPDATE AVAILABLE": "Figma 플러그인이 원본 템플릿 변경을 찾았습니다. 플러그인에서 SYNC MY TEMPLATES를 다시 누르세요.",
  "MISSING TEMPLATE": "마지막 동기화 때 Templates 페이지에서 이 템플릿을 찾지 못했습니다(이전 썸네일).",
  "SYNC FAILED": "마지막 동기화에서 이 템플릿을 렌더링하지 못했습니다(이전 썸네일).",
};

/** 문자열 FNV-1a 32비트 두 번(64비트 상당) — 미리보기 키. 플러그인은 웹이 계산한 값을 그대로 돌려준다. */
export function fnv64(text: string) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
/**
 * 렌더링 미리보기 키: 슬라이드에 넣을 내용(글·이미지 ID)과 고른 템플릿·템플릿 버전. 하나라도 바뀌면 이전 렌더링은 "이전 미리보기"가 된다.
 */
export function previewKeyFor(content: { fields: Record<string, string>; imageList: Array<{ assetId: string; role?: string }> }, templateId: string | null, templateVersion: number | null) {
  return fnv64(JSON.stringify({ f: content.fields, i: content.imageList.map((item) => [item.assetId, item.role ?? ""]), t: templateId ?? "AUTO", v: templateVersion ?? 0 }));
}

/** PNG 바이트 확인(서명·IHDR 크기). 아니면 null. */
export function pngInfo(base64: string): { bytes: Buffer; width: number; height: number } | null {
  if (typeof base64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 33 || bytes.length > TEMPLATE_PNG_MAX_BYTES) return null;
  if (bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 4000 || height > 4000) return null;
  return { bytes, width, height };
}

const placeholders = z.object({ slots: z.array(z.string().max(40)).max(40), imageSlots: z.number().int().min(0).max(10), background: z.string().max(120).nullable(), summary: z.string().max(400), warnings: z.array(z.string().max(400)).max(30) });
const templateBase = { templateId: z.string().regex(TEMPLATE_ID_PATTERN), name: z.string().min(1).max(120), width: z.number().int().min(1).max(10000), height: z.number().int().min(1).max(10000), fileKey: z.string().max(128).nullable(), fileName: z.string().max(300), nodeId: z.string().min(1).max(64) };
/** 플러그인 → 서버 요청(action별). */
export const templateSyncRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync"), template: z.object({ ...templateBase, placeholders, designHash: z.string().regex(/^[0-9a-f]{8,64}$/), thumbnail: z.string().max(TEMPLATE_SYNC_MAX_CHARS) }) }),
  z.object({ action: z.literal("failed"), template: z.object({ ...templateBase, error: z.string().max(500) }) }),
  z.object({ action: z.literal("finish"), present: z.array(z.string().regex(TEMPLATE_ID_PATTERN)).max(20) }),
  z.object({ action: z.literal("changes"), changed: z.array(z.string().regex(TEMPLATE_ID_PATTERN)).max(20) }),
  z.object({ action: z.literal("preview"), preview: z.object({ projectId: z.string().min(1).max(200), slideId: z.string().min(1).max(200), templateId: z.string().regex(TEMPLATE_ID_PATTERN), previewKey: z.string().min(1).max(128), templateVersion: z.number().int().min(1).nullable(), png: z.string().max(TEMPLATE_SYNC_MAX_CHARS) }) }),
]);
export type TemplateSyncRequest = z.infer<typeof templateSyncRequestSchema>;

export const TEMPLATE_ERRORS = {
  TEMPLATES_NOT_CONFIGURED: "템플릿 저장소가 준비되지 않았습니다. Supabase SQL Editor에서 202611040010_figma_templates.sql을 실행해야 합니다.",
  INVALID_PNG: "PNG 이미지가 아니거나 너무 큽니다(1.4MB, 4000px 이하).",
} as const;
