import "server-only";
import { createHash } from "node:crypto";
import { HandoffError, rest, rpc } from "./figma-handoff-server";
import { pngInfo, templateTypeOf, type RenderedPreview, type SyncedTemplate, type TemplateSyncRequest } from "./figma-templates";

/*
 * MY TEMPLATES 저장(P11). figma-handoff-server와 같은 방식:
 * - 플러그인 쓰기: 플러그인 토큰 해시 → SECURITY DEFINER 함수(0010)가 소유자를 확인한다.
 * - 웹 읽기·삭제: 사용자의 Supabase 액세스 토큰으로 PostgREST → RLS가 본인 행만 허용한다.
 * 서버에는 service role 키가 없고, 썸네일은 공개 링크 없이 이 API를 거쳐서만 내려간다.
 */
export class TemplateError extends Error {
  constructor(public readonly code: "INVALID_PNG" | "TEMPLATES_NOT_CONFIGURED", public readonly status: number, message: string) { super(message); }
}
function checkedPng(base64: string) {
  const info = pngInfo(base64);
  if (!info) throw new TemplateError("INVALID_PNG", 400, "PNG 이미지가 아니거나 너무 큽니다(1.4MB, 4000px 이하).");
  return { ...info, sha: createHash("sha256").update(info.bytes).digest("hex") };
}
/** 0010을 실행하지 않은 DB는 0009 안내 대신 0010 안내를 한다. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    if (error instanceof HandoffError && error.code === "HANDOFF_NOT_CONFIGURED") throw new TemplateError("TEMPLATES_NOT_CONFIGURED", 503, "템플릿 저장소가 준비되지 않았습니다. Supabase SQL Editor에서 202611040010_figma_templates.sql을 실행해야 합니다.");
    throw error;
  }
}

/* ---------- 플러그인 ---------- */
export async function pluginTemplateAction(tokenHash: string, request: TemplateSyncRequest) {
  return guarded(async () => {
    if (request.action === "sync") {
      const { template } = request;
      const png = checkedPng(template.thumbnail);
      const rows = await rpc<Array<{ template_id: string; version: number; status: string }>>("figma_sync_template", { p_token_hash: tokenHash, p_template: {
        template_id: template.templateId, template_type: templateTypeOf(template.templateId), name: template.name, width: template.width, height: template.height,
        file_key: template.fileKey, file_name: template.fileName, node_id: template.nodeId, placeholders: template.placeholders,
        thumbnail_png: template.thumbnail, thumbnail_sha: png.sha, design_hash: template.designHash, status: "SYNCED",
      } });
      if (!rows?.[0]) throw new HandoffError("UPSTREAM_ERROR", 502, "Supabase에 템플릿이 저장되지 않았습니다.");
      return { templateId: rows[0].template_id, version: rows[0].version, status: rows[0].status, thumbnail: { width: png.width, height: png.height, bytes: png.bytes.length } };
    }
    if (request.action === "failed") {
      const { template } = request;
      const rows = await rpc<Array<{ template_id: string; version: number; status: string }>>("figma_sync_template", { p_token_hash: tokenHash, p_template: { template_id: template.templateId, template_type: templateTypeOf(template.templateId), name: template.name, width: template.width, height: template.height, file_key: template.fileKey, file_name: template.fileName, node_id: template.nodeId, status: "FAILED", error: template.error } });
      return { templateId: template.templateId, version: rows?.[0]?.version ?? null, status: "FAILED" };
    }
    if (request.action === "finish") return { missing: await rpc<number>("figma_finish_template_sync", { p_token_hash: tokenHash, p_present: request.present }) };
    if (request.action === "changes") return { flagged: await rpc<number>("figma_flag_template_changes", { p_token_hash: tokenHash, p_changed: request.changed }) };
    const { preview } = request;
    const png = checkedPng(preview.png);
    const renderedAt = await rpc<string>("figma_save_preview", { p_token_hash: tokenHash, p_preview: { project_id: preview.projectId, slide_id: preview.slideId, template_id: preview.templateId, preview_key: preview.previewKey, template_version: preview.templateVersion, png: preview.png, png_sha: png.sha, width: png.width, height: png.height } });
    return { slideId: preview.slideId, renderedAt };
  });
}
export async function pluginTemplateHashes(tokenHash: string) {
  return guarded(async () => (await rpc<Array<{ template_id: string; design_hash: string | null; version: number; status: string; synced_at: string }>>("figma_list_template_hashes", { p_token_hash: tokenHash }))
    .map((row) => ({ templateId: row.template_id, designHash: row.design_hash, version: row.version, status: row.status, syncedAt: row.synced_at })));
}

/* ---------- 웹(로그인 사용자, RLS) ---------- */
type TemplateRow = { template_id: string; template_type: SyncedTemplate["type"]; name: string; width: number; height: number; file_key: string | null; file_name: string; node_id: string; placeholders: SyncedTemplate["placeholders"]; version: number; status: SyncedTemplate["status"]; error: string | null; synced_at: string; checked_at: string; change_detected_at: string | null; thumbnail_sha: string | null };
export async function listTemplates(jwt: string): Promise<SyncedTemplate[]> {
  return guarded(async () => {
    const rows = await rest<TemplateRow[]>("figma_templates?select=template_id,template_type,name,width,height,file_key,file_name,node_id,placeholders,version,status,error,synced_at,checked_at,change_detected_at,thumbnail_sha&order=template_id.asc", { jwt });
    return rows.map((row) => ({ templateId: row.template_id, type: row.template_type, name: row.name, width: row.width, height: row.height, fileKey: row.file_key, fileName: row.file_name, nodeId: row.node_id, placeholders: row.placeholders, version: row.version, status: row.status, error: row.error, syncedAt: row.synced_at, checkedAt: row.checked_at, changeDetectedAt: row.change_detected_at, hasThumbnail: Boolean(row.thumbnail_sha) }));
  });
}
export async function listPreviews(jwt: string, projectId: string): Promise<RenderedPreview[]> {
  return guarded(async () => {
    const params = new URLSearchParams({ select: "slide_id,template_id,preview_key,template_version,width,height,rendered_at", project_id: `eq.${projectId}` });
    const rows = await rest<Array<{ slide_id: string; template_id: string; preview_key: string; template_version: number | null; width: number; height: number; rendered_at: string }>>(`figma_rendered_previews?${params}`, { jwt });
    return rows.map((row) => ({ slideId: row.slide_id, templateId: row.template_id, previewKey: row.preview_key, templateVersion: row.template_version, width: row.width, height: row.height, renderedAt: row.rendered_at }));
  });
}
/** 썸네일 또는 렌더링 PNG 바이트. 다른 사용자 것은 RLS 때문에 없는 것과 같다. */
export async function templateImage(jwt: string, query: { templateId: string } | { projectId: string; slideId: string }) {
  return guarded(async () => {
    if ("templateId" in query) {
      const rows = await rest<Array<{ thumbnail_png: string | null; thumbnail_sha: string | null }>>(`figma_templates?${new URLSearchParams({ select: "thumbnail_png,thumbnail_sha", template_id: `eq.${query.templateId}` })}`, { jwt });
      return rows[0]?.thumbnail_png ? { bytes: Buffer.from(rows[0].thumbnail_png, "base64"), etag: rows[0].thumbnail_sha ?? "" } : null;
    }
    const rows = await rest<Array<{ png: string; png_sha: string }>>(`figma_rendered_previews?${new URLSearchParams({ select: "png,png_sha", project_id: `eq.${query.projectId}`, slide_id: `eq.${query.slideId}` })}`, { jwt });
    return rows[0]?.png ? { bytes: Buffer.from(rows[0].png, "base64"), etag: rows[0].png_sha } : null;
  });
}
/** 등록 해제(재동기화하면 다시 생긴다). templateId가 없으면 내 템플릿 전부. */
export async function deleteTemplates(jwt: string, templateId?: string) {
  return guarded(async () => {
    const filter = templateId ? `template_id=eq.${encodeURIComponent(templateId)}` : "template_id=like.TEMPLATE_*";
    const rows = await rest<Array<{ template_id: string }>>(`figma_templates?${filter}&select=template_id`, { method: "DELETE", jwt, prefer: "return=representation" });
    return rows.length;
  });
}
