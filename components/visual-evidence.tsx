"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Globe, Image as ImageIcon, LoaderCircle, PlayCircle } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { updateLiveAnalysis } from "@/lib/storage";
import { mergeInstagramImages, snapshotMedia, youtubeIdFromUrl, type InstagramImage, type VisualMedia } from "@/lib/visual-media";
import type { EvidenceItem } from "@/lib/schemas";
import { formatDateTime } from "./ui";
import { MediaThumb } from "./media-thumb";

type Source = { trendId: string; trendName: string; keywords: string[]; evidence?: EvidenceItem[]; media?: VisualMedia[]; webImages?: Record<string, string>; instagram?: { hashtag?: string }; youtube?: { videos?: Array<{ id: string; title: string; channelTitle?: string; publishedAt?: string; viewCount?: number | null; url: string; thumbnailUrl?: string }> } };
type Filter = "all" | VisualMedia["platform"];
const LABEL: Record<VisualMedia["platform"], string> = { youtube: "YouTube", instagram: "Instagram", web: "웹 출처" };
const PAGE = 9;

/**
 * TREND WHY · VISUAL EVIDENCE. 근거 원장에 있는 실제 이미지·영상만 보여 준다.
 * 이미지가 있다는 사실(SOURCE OBSERVED)과 그 문화적 의미 해석(AI INTERPRETATION, 위 WHY 분석)을 구분한다.
 */
export function VisualEvidence({ source, canSave }: { source: Source; canSave: boolean }) {
  const [igMedia, setIgMedia] = useState<VisualMedia[] | null>(null);
  const media = useMemo(() => snapshotMedia(igMedia ? { ...source, media: igMedia } : source), [source, igMedia]);
  const [igState, setIgState] = useState<{ busy: boolean; message?: string; ok?: boolean }>({ busy: false });
  const hashtag = source.instagram?.hashtag?.replace(/^#/, "");
  const igCount = media.filter((item) => item.platform === "instagram").length;
  const igMissing = media.filter((item) => item.platform === "instagram" && !item.thumbnailUrl).length;
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [preview, setPreview] = useState<string | null>(null);
  const [webState, setWebState] = useState<{ busy: boolean; message?: string; ok?: boolean }>({ busy: false });
  const counts = { all: media.length, youtube: media.filter((m) => m.platform === "youtube").length, instagram: media.filter((m) => m.platform === "instagram").length, web: media.filter((m) => m.platform === "web").length };
  // 사진이 있는 자료를 먼저 보여 준다(같은 그룹 안에서는 기존 순위 유지).
  const shown = media.filter((item) => filter === "all" || item.platform === filter).sort((a, b) => Number(Boolean(b.thumbnailUrl)) - Number(Boolean(a.thumbnailUrl)));
  const uncheckedWeb = media.filter((item) => item.platform === "web" && !item.thumbnailUrl && !(source.webImages && item.sourceUrl in source.webImages)).slice(0, 6);

  const checkWebImages = async () => {
    setWebState({ busy: true });
    try {
      const response = await apiFetch("/api/media/web-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: uncheckedWeb.map((item) => item.sourceUrl) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "웹 출처를 확인하지 못했습니다.");
      const results = body.results as Array<{ url: string; image: string | null; status: string }>;
      // 이미지가 없던 페이지도 빈 값으로 기록해 같은 페이지를 다시 요청하지 않는다(빈 문자열은 표시하지 않음).
      const webImages = { ...source.webImages, ...Object.fromEntries(results.map((item) => [item.url, item.image ?? ""])) };
      if (canSave) updateLiveAnalysis(source.trendId, { webImages });
      const found = results.filter((item) => item.image).length;
      setWebState({ busy: false, ok: true, message: `페이지 ${results.length}개 확인 · 대표 이미지 ${found}개 발견${results.length - found ? ` · ${results.length - found}개는 이미지 없음/확인 불가` : ""}` });
    } catch (error) {
      setWebState({ busy: false, ok: false, message: error instanceof Error ? error.message : "웹 출처를 확인하지 못했습니다." });
    }
  };

  const loadInstagramImages = async () => {
    if (!hashtag) return;
    setIgState({ busy: true });
    try {
      const response = await apiFetch("/api/media/instagram-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hashtag }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Instagram 사진을 받지 못했습니다.");
      const images = body.images as InstagramImage[];
      const next = mergeInstagramImages(igMedia ? { ...source, media: igMedia } : source, images, hashtag, body.collectedAt);
      setIgMedia(next);
      if (canSave) updateLiveAnalysis(source.trendId, { media: next });
      const matched = next.filter((item) => item.platform === "instagram" && item.evidenceIds.length && item.thumbnailUrl).length;
      setIgState({ busy: false, ok: true, message: `#${hashtag} 사진 ${images.length}장 수신${body.cached ? "(캐시)" : ""} · 분석 근거 게시물 ${matched}개에 사진 연결 · 나머지는 "분석 이후 재수집"으로 표시` });
    } catch (error) {
      setIgState({ busy: false, ok: false, message: error instanceof Error ? error.message : "Instagram 사진을 받지 못했습니다." });
    }
  };

  return <section className="visual-evidence" data-testid="visual-evidence" aria-label="Visual evidence">
    <header>
      <div><small>VISUAL EVIDENCE · 실제 수집한 이미지·영상</small><h3>{source.trendName}의 시각 자료 {media.length}개</h3></div>
      <div className="legend"><span className="lbl observed">SOURCE OBSERVED</span><span>실제 수집된 자료</span><span className="lbl ai">AI INTERPRETATION</span><span>의미 해석은 아래 WHY 분석</span><span className="lbl unavailable">UNAVAILABLE</span><span>이미지 없음·만료</span></div>
    </header>
    <p className="note">이미지는 원본 플랫폼에서 직접 불러오며 TREND RADAR에 복제·저장하지 않습니다. 이미지가 있다는 것은 관찰된 사실이고, 그것이 트렌드의 원인이라는 뜻은 아닙니다.</p>
    {media.length ? <>
      <div className="filters" role="group" aria-label="미디어 출처 필터">{(["all", "youtube", "instagram", "web"] as const).map((key) => <button key={key} type="button" aria-pressed={filter === key} disabled={key !== "all" && !counts[key]} onClick={() => { setFilter(key); setLimit(PAGE); }}>{key === "all" ? "전체" : LABEL[key]} <b>{counts[key]}</b></button>)}</div>
      <div className="grid">{shown.slice(0, limit).map((item) => {
        const youtubeId = item.platform === "youtube" ? youtubeIdFromUrl(item.sourceUrl) : null;
        return <article key={item.mediaId} className="card" data-testid="visual-card" data-platform={item.platform}>
          {preview === item.mediaId && youtubeId
            ? <div className="embed"><iframe src={`https://www.youtube-nocookie.com/embed/${youtubeId}`} title={`YouTube 미리보기: ${item.title}`} loading="lazy" allow="encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/></div>
            : <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="thumb-link" aria-label={`${LABEL[item.platform]} 원본 열기: ${item.title}`}><MediaThumb media={item} label={item.title}/></a>}
          <div className="meta">
            <div className="row"><span className="platform">{LABEL[item.platform]}</span><span className={`lbl ${item.thumbnailUrl ? "observed" : "unavailable"}`} data-testid="visual-status">{item.thumbnailUrl ? "SOURCE OBSERVED" : "UNAVAILABLE"}</span>{!item.evidenceIds.length && <span className="lbl later" title="WHY 분석 이후 같은 해시태그를 다시 조회해 받은 게시물입니다. WHY 분석의 근거는 아닙니다.">분석 이후 재수집</span>}</div>
            <h4 title={item.title}>{item.title}</h4>
            <p className="facts">{item.publishedAt ? `게시 ${formatDateTime(item.publishedAt)}` : "게시일 정보 없음"}{item.author ? ` · ${item.author}` : ""}{item.metrics?.views !== undefined ? ` · 조회수 ${item.metrics.views.toLocaleString("ko-KR")}회(수집 시점)` : ""}</p>
            <div className="row actions">
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="open" data-testid="visual-open">원본 보기 <ExternalLink size={12}/></a>
              {youtubeId && <button type="button" className="preview" onClick={() => setPreview(preview === item.mediaId ? null : item.mediaId)} aria-pressed={preview === item.mediaId}><PlayCircle size={13}/>{preview === item.mediaId ? "미리보기 닫기" : "미리보기"}</button>}
              <span className="ids">{item.evidenceIds.join(", ")}</span>
            </div>
          </div>
        </article>;
      })}</div>
      {shown.length > limit && <button type="button" className="button more" onClick={() => setLimit(limit + PAGE)}>더 보기 ({shown.length - limit}개 남음)</button>}
    </> : <div className="empty" data-testid="visual-empty"><span className="lbl unavailable">UNAVAILABLE</span><p>이 분석에는 이미지·영상 근거가 없습니다. YouTube 또는 Instagram 수집을 켜고 재분석하면 실제 자료가 추가됩니다.</p></div>}
    {uncheckedWeb.length > 0 && <div className="web-check"><button type="button" className="button" onClick={checkWebImages} disabled={webState.busy} data-testid="check-web-images">{webState.busy ? <LoaderCircle className="spin" size={14}/> : <Globe size={14}/>}웹 출처 대표 이미지 확인 (페이지 {uncheckedWeb.length}개)</button><small>각 페이지의 og:image 메타데이터만 읽습니다. 유료 API는 호출하지 않습니다.</small></div>}
    {webState.message && <p className={`web-msg ${webState.ok ? "ok" : "fail"}`} role="status">{webState.message}</p>}
    {hashtag && igCount > 0 && <div className="web-check"><button type="button" className="button" onClick={loadInstagramImages} disabled={igState.busy} data-testid="load-instagram-images">{igState.busy ? <LoaderCircle className="spin" size={14}/> : <ImageIcon size={14}/>}{igMissing ? `Instagram 사진 불러오기 (사진 없는 게시물 ${igMissing}개)` : "Instagram 사진 다시 받기"}</button><small>이미 조회한 #{hashtag}를 공식 API로 다시 조회합니다(새 해시태그 한도 사용 없음). 사진 URL만 받고 계정 아이디·캡션은 표시하지 않습니다. 사진 URL은 며칠 뒤 만료될 수 있습니다.</small></div>}
    {igState.message && <p className={`web-msg ${igState.ok ? "ok" : "fail"}`} role="status" data-testid="instagram-images-msg">{igState.message}</p>}
    <style jsx>{`
      .visual-evidence{margin:12px 0;padding:16px;border:1.5px solid var(--ink);border-radius:8px;background:#fff}
      header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
      header small{font-family:var(--font-display);font-size:11px;letter-spacing:.06em;color:var(--blue)}
      header h3{margin:4px 0 0;font-size:16px}
      .legend{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;font-size:11px;color:var(--muted)}
      .lbl{font-size:10px;font-weight:800;letter-spacing:.04em;padding:2px 7px;border:1.5px solid var(--ink);border-radius:999px;white-space:nowrap}
      .lbl.observed{background:#c9fbd9;color:#14161f}.lbl.ai{background:#f3e8ff;color:#6b3fa0}.lbl.unavailable{background:#f2f3f7;color:#555a6b}.lbl.later{background:#fff6ea;color:#6b4100}
      .note{margin:10px 0;font-size:12px;color:var(--muted);line-height:1.6}
      .filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
      .filters button{border:1.5px solid var(--ink);background:#fff;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;min-height:34px}
      .filters button[aria-pressed=true]{background:#14161f;color:#fff}
      .filters button:disabled{opacity:.4;cursor:not-allowed}
      .filters b{margin-left:4px;font-weight:600}
      .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .card{display:grid;gap:8px;align-content:start;min-width:0}
      .thumb-link{display:block;border-radius:6px}
      .thumb-link:focus-visible{outline:3px solid #ff4fa3;outline-offset:2px}
      .embed{position:relative;aspect-ratio:16/9;border:1.5px solid var(--ink);border-radius:6px;overflow:hidden;background:#000}
      .embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
      .meta{display:grid;gap:4px;min-width:0}
      .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      .platform{font-size:11px;font-weight:800;color:var(--blue)}
      h4{margin:0;font-size:13px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
      .facts{margin:0;font-size:11px;color:var(--muted);line-height:1.5}
      .actions .open,.actions .preview{display:inline-flex;gap:4px;align-items:center;font-size:12px;font-weight:700;color:var(--blue);min-height:32px;padding:0 4px}
      .actions .preview{border:0;background:transparent;cursor:pointer}
      .ids{margin-left:auto;font-size:11px;color:var(--muted);font-family:ui-monospace,monospace}
      .more{margin-top:12px}
      .empty{display:flex;gap:10px;align-items:center;padding:12px;border:1px dashed var(--border);border-radius:6px}
      .empty p{margin:0;font-size:12px;color:var(--muted)}
      .web-check{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}
      .web-check small{font-size:11px;color:var(--muted)}
      .web-msg{margin:8px 0 0;font-size:12px}.web-msg.fail{color:#a3122e}
      @media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:560px){.grid{grid-template-columns:1fr}.legend{width:100%}}
    `}</style>
  </section>;
}
