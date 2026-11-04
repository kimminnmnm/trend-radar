"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import type { ProductionSlide, StudioProject } from "@/lib/content-production";
import { slideTemplateContent, templateKindOf } from "@/lib/figma-export";
import { templateStatus, templateStatusNotes, type RenderedPreview, type SyncedTemplate } from "@/lib/figma-templates";

/*
 * MY TEMPLATES 갤러리(P12)·미리보기(P13)·슬라이드별 선택(P14)·상태(P15).
 * 템플릿 디자인은 Figma에 있다. 웹은 플러그인이 동기화한 썸네일·메타데이터와, 플러그인이 실제로 렌더링한 PNG만 보여 준다.
 * HTML로 템플릿을 흉내 내 "실제 Figma와 같다"고 하지 않는다.
 */
export type TemplateLibrary = {
  state: "idle" | "loading" | "ready" | "error";
  message?: string;
  needLogin?: boolean;
  templates: SyncedTemplate[];
  previews: RenderedPreview[];
  versions: Record<string, number>;
  loadedAt?: string;
  reload: () => void;
};

export function useTemplateLibrary(projectId: string, enabled: boolean): TemplateLibrary {
  const [data, setData] = useState<Omit<TemplateLibrary, "reload" | "versions">>({ state: "idle", templates: [], previews: [] });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const fail = (message: string, needLogin = false) => { if (alive) setData({ state: "error", templates: [], previews: [], needLogin, message }); };
    apiFetch(`/api/figma/templates?project=${encodeURIComponent(projectId)}`).then(async (response) => {
      const body = await response.json().catch(() => ({})) as { templates?: SyncedTemplate[]; previews?: RenderedPreview[]; message?: string };
      if (!response.ok) { fail(body.message ?? `템플릿을 불러오지 못했습니다(HTTP ${response.status}).`, response.status === 401); return; }
      if (alive) setData({ state: "ready", templates: body.templates ?? [], previews: body.previews ?? [], loadedAt: new Date().toISOString() });
    }).catch(() => fail("서버에 연결하지 못했습니다."));
    return () => { alive = false; };
  }, [enabled, projectId, nonce]);
  // Figma에서 동기화·렌더링하고 브라우저로 돌아오면 다시 읽는다(Figma 작업은 이 화면이 알 수 없다).
  useEffect(() => {
    if (!enabled) return;
    const again = () => { if (document.visibilityState === "visible") setNonce((value) => value + 1); };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => { window.removeEventListener("focus", again); document.removeEventListener("visibilitychange", again); };
  }, [enabled]);
  const versions = Object.fromEntries(data.templates.map((item) => [item.templateId, item.version]));
  // 처음 불러오는 동안은 idle을 loading으로 보여 준다(효과 안에서 상태를 바로 바꾸지 않는다).
  const state = enabled && data.state === "idle" ? "loading" : data.state;
  return { ...data, state, versions, reload: () => { setData((current) => ({ ...current, state: "loading" })); setNonce((value) => value + 1); } };
}

/** 로그인 토큰으로 받아야 하는 PNG(공개 링크 없음) → 이 화면에서만 쓰는 blob 주소. key가 바뀌면 다시 받는다. */
function useAuthImage(url: string | null, key: string) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!url) return;
    let alive = true, objectUrl: string | null = null;
    apiFetch(url).then(async (response) => {
      if (!response.ok) throw new Error(String(response.status));
      objectUrl = URL.createObjectURL(await response.blob());
      if (alive) { setSrc(objectUrl); setFailed(false); } else URL.revokeObjectURL(objectUrl);
    }).catch(() => { if (alive) { setSrc(null); setFailed(true); } });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, key]);
  return url ? { src, failed } : { src: null, failed: false };
}

const formatTime = (iso?: string | null) => iso ? new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const typeLabel = { COVER: "COVER · 표지", BODY: "BODY · 본문", CTA: "CTA · 마무리" } as const;

function Thumb({ template, alt }: { template: SyncedTemplate; alt?: string }) {
  const { src, failed } = useAuthImage(template.hasThumbnail ? `/api/figma/templates/image?template=${template.templateId}` : null, `${template.version}-${template.syncedAt}`);
  return <div className="tpl-thumb" style={{ aspectRatio: `${template.width} / ${template.height}` }}>
    {/* eslint-disable-next-line @next/next/no-img-element -- 로그인 토큰으로 받은 PNG(blob 주소)를 그대로 표시 */}
    {src ? <img src={src} alt={alt ?? `${template.name} 템플릿 썸네일(Figma에서 렌더링)`} data-testid="template-thumb"/> : <span>{failed ? "썸네일을 불러오지 못함" : template.hasThumbnail ? "불러오는 중…" : "썸네일 없음"}</span>}
  </div>;
}

/** 왼쪽 설정: 등록된 템플릿 갤러리. */
export function TemplateGallery({ library }: { library: TemplateLibrary }) {
  const { state, templates } = library;
  return <div className="tpl-gallery" data-testid="template-gallery" data-state={state}>
    <style>{templateGalleryStyles}</style>
    <div className="tpl-head"><small>MY TEMPLATES · Figma에서 동기화한 템플릿 {templates.length}개</small><button type="button" className="mini" onClick={library.reload} disabled={state === "loading"} data-testid="template-refresh"><RefreshCw size={11}/>새로고침</button></div>
    {state === "loading" && <p className="note">불러오는 중…</p>}
    {state === "error" && <p className="warn" role="alert" data-testid="template-error">{library.needLogin ? "MY TEMPLATES는 로그인한 계정의 템플릿만 보여 줍니다. Account에서 로그인하세요." : library.message}</p>}
    {state === "ready" && !templates.length && <p className="note" data-testid="template-empty">등록된 템플릿이 없습니다. Figma에서 TREND RADAR 플러그인 → MY TEMPLATES → <b>SYNC MY TEMPLATES</b>를 누르면 여기에 썸네일이 생깁니다(템플릿 8종은 Templates 페이지의 TEMPLATE_COVER_01 … TEMPLATE_CTA_02).</p>}
    <ul className="tpl-cards">{templates.map((template) => { const status = templateStatus(template); return <li key={template.templateId} className={`tpl-card ${status.replace(/ /g, "-").toLowerCase()}`} data-testid="template-card" data-template-id={template.templateId} data-status={status}>
      <Thumb template={template}/>
      <b>{template.name}</b>
      <span>{typeLabel[template.type]}</span>
      <span>이미지 슬롯 {template.placeholders.imageSlots}{template.placeholders.background ? " + 배경" : ""}</span>
      <span>동기화 {formatTime(template.syncedAt)}</span>
      <i className="status" title={templateStatusNotes[status]} data-testid="template-status">{status}</i>
    </li>; })}</ul>
    {templates.length > 0 && <p className="note">썸네일은 Figma에서 마지막으로 동기화한 모습입니다. 마지막 확인 {formatTime(library.loadedAt)}. Figma에서 템플릿을 고친 뒤에는 플러그인에서 SYNC MY TEMPLATES를 다시 누르세요(웹에서는 Figma 원본 변경을 직접 알 수 없습니다).</p>}
  </div>;
}

function RenderedImage({ projectId, preview }: { projectId: string; preview: RenderedPreview }) {
  const { src, failed } = useAuthImage(`/api/figma/templates/image?project=${encodeURIComponent(projectId)}&slide=${encodeURIComponent(preview.slideId)}`, preview.renderedAt);
  // eslint-disable-next-line @next/next/no-img-element -- Figma가 렌더링한 PNG(blob 주소)를 그대로 표시
  return <div className="tpl-thumb" style={{ aspectRatio: `${preview.width} / ${preview.height}` }}>{src ? <img src={src} alt="Figma에서 렌더링한 콘텐츠 미리보기" data-testid="rendered-image"/> : <span>{failed ? "불러오지 못함" : "불러오는 중…"}</span>}</div>;
}

/** 오른쪽 결과: 슬라이드별 템플릿 선택 + TEMPLATE PREVIEW(원본 썸네일)와 RENDERED CONTENT PREVIEW(Figma 렌더링)를 나눠 보여 준다. */
export function TemplateSlidePreviews({ project, slides, library, onAssign }: { project: StudioProject; slides: ProductionSlide[]; library: TemplateLibrary; onAssign: (slideId: string, templateId: string | null) => void }) {
  const byId = new Map(library.templates.map((item) => [item.templateId, item]));
  const previews = new Map(library.previews.map((item) => [item.slideId, item]));
  return <div className="tpl-slides" data-testid="template-slides">
    <style>{templateGalleryStyles}</style>
    <div className="tpl-head"><small>마지막 확인 {formatTime(library.loadedAt)} · Figma에서 렌더링한 뒤 이 창으로 돌아오면 자동으로 다시 불러옵니다.</small><button type="button" className="mini" onClick={library.reload} disabled={library.state === "loading"} data-testid="template-preview-refresh"><RefreshCw size={11}/>미리보기 새로고침</button></div>
    <p className="note">TEMPLATE PREVIEW는 Figma 원본 템플릿 썸네일, RENDERED CONTENT PREVIEW는 Figma 플러그인이 이 내용을 임시 복제본에 넣어 렌더링한 결과입니다. 웹은 템플릿을 그리지 않습니다 — 최신 렌더링은 “Figma로 보내기” 후 플러그인에서 <b>미리보기 렌더링 → 웹</b>을 누르세요.</p>
    <ol>{slides.map((slide, index) => {
      const kind = templateKindOf(slide.type);
      const chosen = project.templateAssignments?.[slide.slide_id] ?? null;
      const template = chosen ? byId.get(chosen) : undefined;
      const content = slideTemplateContent(project, slide, index, slides.length, library.versions);
      const rendered = previews.get(slide.slide_id);
      const fresh = rendered && rendered.previewKey === content.previewKey;
      const options = [...library.templates.filter((item) => item.type === kind), ...library.templates.filter((item) => item.type !== kind)];
      return <li key={slide.slide_id} className="tpl-slide" data-testid="template-slide" data-slide-id={slide.slide_id}>
        <div className="tpl-slide-head"><b>{String(index + 1).padStart(2, "0")}</b><span>{kind}</span><em>{slide.headline}</em>
          <select value={chosen ?? "AUTO"} onChange={(event) => onAssign(slide.slide_id, event.target.value === "AUTO" ? null : event.target.value)} aria-label={`${index + 1}번 슬라이드 템플릿`} data-testid="template-select">
            <option value="AUTO">AUTO · Figma에서 자동 배정</option>
            {options.map((item) => <option key={item.templateId} value={item.templateId}>{item.name}{item.type !== kind ? ` (다른 유형 ${item.type})` : ""}{templateStatus(item) !== "SYNCED" ? ` · ${templateStatus(item)}` : ""}</option>)}
            {chosen && !byId.has(chosen) && <option value={chosen}>{chosen} (등록되지 않음)</option>}
          </select>
        </div>
        <div className="tpl-pair">
          <figure data-testid="template-preview"><figcaption>TEMPLATE PREVIEW</figcaption>{template ? <Thumb template={template} alt={`${template.name} 원본 템플릿(콘텐츠 미적용)`}/> : <div className="tpl-thumb empty"><span>{chosen ? `${chosen} 썸네일 없음(동기화 필요)` : "AUTO — Figma 플러그인이 슬라이드 유형·이미지 수로 고릅니다"}</span></div>}{template && templateStatus(template) !== "SYNCED" && <small className="warn">{templateStatus(template)} · {templateStatusNotes[templateStatus(template)]}</small>}</figure>
          <figure data-testid="rendered-preview" data-fresh={rendered ? String(Boolean(fresh)) : "none"}><figcaption>RENDERED CONTENT PREVIEW</figcaption>
            {rendered ? <><RenderedImage projectId={project.id} preview={rendered}/><small className={fresh ? "ok" : "warn"}>{fresh ? `Figma 렌더링 ${formatTime(rendered.renderedAt)} · ${rendered.templateId}` : `이전 렌더링(${formatTime(rendered.renderedAt)} · ${rendered.templateId}) — 이후 내용·템플릿이 바뀌었습니다. 최신 렌더링이 필요합니다.`}</small></>
              : <div className="tpl-thumb empty"><span>아직 Figma 렌더링이 없습니다. Figma로 보내기 → 플러그인에서 “미리보기 렌더링 → 웹”.</span></div>}
          </figure>
        </div>
      </li>;
    })}</ol>
  </div>;
}

export const templateGalleryStyles = `
  .tpl-gallery{display:grid;gap:6px;margin-top:6px}.tpl-head{display:flex;justify-content:space-between;align-items:center;gap:6px}.tpl-head small{min-width:0}.tpl-head button{flex:none;white-space:nowrap;display:inline-flex;align-items:center;gap:3px}
  .tpl-cards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
  .tpl-card{display:grid;gap:2px;border:1px solid var(--border);background:#fff;padding:4px;font-size:10px;min-width:0}.tpl-card b{font-size:11px;overflow-wrap:anywhere}
  .tpl-card .status{font-style:normal;font-weight:700;font-size:9px;padding:1px 3px;border:1px solid currentColor;justify-self:start}
  .tpl-card.update-available .status,.tpl-card.missing-template .status,.tpl-card.sync-failed .status{color:#9a3b00}
  .tpl-thumb{width:100%;background:#eceef5;border:1px solid var(--border);display:grid;place-items:center;overflow:hidden}.tpl-thumb img{width:100%;height:100%;object-fit:contain;display:block}
  .tpl-thumb span{font-size:10px;padding:6px;text-align:center;color:#5d6170}.tpl-thumb.empty{aspect-ratio:4/5}
  .tpl-slides ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}.tpl-slide{border:1px solid var(--border);background:#fff;padding:6px}
  .tpl-slide-head{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:11px}.tpl-slide-head em{flex:1;min-width:120px;font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tpl-slide-head select{font:inherit;font-size:11px;max-width:100%}
  .tpl-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:6px}.tpl-pair figure{margin:0;display:grid;gap:3px;min-width:0}
  .tpl-pair figcaption{font-size:9px;font-weight:700;letter-spacing:.04em}.tpl-pair small{font-size:10px}.tpl-pair small.ok{color:#1d6b35}.tpl-pair small.warn{color:#9a3b00}
`;
