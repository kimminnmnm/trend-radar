"use client";

import { useMemo, useState } from "react";
import { Eye, LoaderCircle, Palette, Play, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import type { PersistenceResult } from "@/lib/cloud-storage";
import { DEFAULT_DNA_LINKS, eligibleVisualMedia, visualDimensionNames, type VisualDnaRecord } from "@/lib/visual-dna";
import { saveVisualDnaEverywhere } from "@/lib/visual-dna-cloud";
import { snapshotMedia } from "@/lib/visual-media";
import type { DataStatus, LiveAnalysisSnapshot } from "@/lib/types";
import { CloudSaveStatus } from "./cloud-save-status";
import { MediaThumb } from "./media-thumb";
import { DataBadge, formatDateTime, SectionHeading, StatusPill } from "./ui";

const DIM_KO: Record<string, string> = { "Color Palette": "색", Typography: "글자", Texture: "질감", Composition: "구도", Objects: "사물", "Visual Mood": "무드", "Visual Motifs": "모티프" };

/**
 * V3 Visual DNA. 실제 썸네일에서 보이는 것(관찰)과 AI 해석을 나눠 보여 주고 TREND DNA 차원과 연결한다.
 * 실제 이미지가 없으면 만들지 않는다.
 */
export function VisualDnaPanel({ snapshot }: { snapshot: LiveAnalysisSnapshot }) {
  const eligible = useMemo(() => eligibleVisualMedia(snapshotMedia(snapshot)), [snapshot]);
  const record = snapshot.visualDna;
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<DataStatus | null>(null);
  const [save, setSave] = useState<PersistenceResult | null>(null);
  const alias = new Map((record?.media ?? eligible).map((item, index) => [item.mediaId, `M${index + 1}`]));
  const refs = (ids: string[]) => ids.map((id) => alias.get(id) ?? "?").join(" ");

  const run = async () => {
    if (!window.confirm(`실제 썸네일 ${eligible.length}장으로 Visual DNA를 분석할까요?\nOpenAI 이미지 분석 1회(저해상도)가 실행됩니다. 같은 이미지 조합은 캐시를 씁니다.`)) return;
    setState("loading"); setError(""); setSave(null);
    try {
      const response = await apiFetch("/api/visual-dna", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trend: snapshot.trendName, media: eligible, force: Boolean(record) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Visual DNA 분석에 실패했습니다.");
      const next: VisualDnaRecord = { result: body.result, media: body.media, model: body.model, analyzedAt: body.analyzedAt, promptVersion: body.promptVersion, validation: body.validation };
      setFresh(body.cached ? "CACHED" : "LIVE");
      setSave(await saveVisualDnaEverywhere(snapshot.trendId, next));
      setState("idle");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Visual DNA 분석에 실패했습니다."); setState("error"); }
  };

  return <section className="section visual-dna" id="visual-dna" data-testid="visual-dna">
    <SectionHeading index="V" title="Visual DNA" description="실제 영상 썸네일에서 보이는 시각 특징(관찰)과 그 의미에 대한 AI 해석을 나눠 보여 줍니다. 썸네일 표본은 트렌드 전체를 대표하지 않습니다."/>
    {!eligible.length && !record ? <div className="state-box panel" data-testid="visual-dna-unavailable"><DataBadge status="NOT AVAILABLE"/><h3>Visual DNA를 만들 실제 이미지가 없습니다.</h3><p>YouTube 수집을 켜고 WHY를 재분석하면 공개 영상 썸네일로 Visual DNA를 만들 수 있습니다. 이미지 없이 키워드만으로는 만들지 않습니다.</p></div> : <div className="panel body">
      <div className="head">
        <DataBadge status={state === "loading" ? "LOADING" : fresh ?? (record ? "SAVED" : "NOT ANALYZED")} detail={record ? `${record.model} · ${formatDateTime(record.analyzedAt)} · 이미지 ${record.media.length}장` : `분석 가능한 이미지 ${eligible.length}장`}/>
        <button type="button" className="button primary" onClick={run} disabled={state === "loading" || !eligible.length} data-testid="run-visual-dna">{state === "loading" ? <><LoaderCircle className="spin" size={14}/>이미지 분석 중…</> : record ? <><RotateCcw size={14}/>Visual DNA 재분석</> : <><Play size={14}/>Visual DNA 분석 (이미지 {eligible.length}장 · OpenAI 1회)</>}</button>
      </div>
      {state === "error" && <p className="error" role="alert">{error}</p>}
      {save && <CloudSaveStatus result={save}/>}
      <div className="images" data-testid="visual-dna-images">{(record?.media ?? eligible).map((item, index) => <a key={item.mediaId} href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`M${index + 1} 원본 열기: ${item.title}`}><MediaThumb media={{ ...item, mediaType: "video", thumbnailOrigin: "youtube-video-id", collectedAt: "", dataStatus: "SOURCE OBSERVED", analysisStatus: record ? "analyzed" : "not-analyzed", trendId: snapshot.trendId }} label={item.title}/><b>M{index + 1}</b></a>)}</div>
      {record && <>
        <p className="legend"><span className="obs">관찰</span>썸네일에서 직접 보이는 것(AI 비전 판독, 최대 Supported Hypothesis) <span className="inf">AI 해석</span>무드·의미에 대한 해석(Creative Hypothesis) · M1~M{record.media.length}는 위 이미지 번호</p>
        {record.result.palette.length > 0 && <div className="palette" data-testid="visual-dna-palette"><small><Palette size={13}/>COLOR PALETTE · 관찰</small><div>{record.result.palette.map((color) => <span key={color.hex} className="swatch"><i style={{ background: color.hex }} aria-hidden/><b>{color.name}</b><code>{color.hex}</code><em>{refs(color.mediaIds)}</em></span>)}</div></div>}
        <div className="dims">{visualDimensionNames.map((name) => {
          const dimension = record.result.dimensions.find((item) => item.dimension === name);
          if (!dimension) return null;
          const dnaDim = record.result.dnaLinks.find((link) => link.visualDimension === name)?.dnaDimension ?? DEFAULT_DNA_LINKS[name];
          const trendDna = snapshot.dna?.dimensions.find((item) => item.dimension === dnaDim);
          return <article key={name} className="dim" data-testid="visual-dna-dimension">
            <header><h3>{name} <em>{DIM_KO[name]}</em></h3><span className="link" title={trendDna?.summary}>TREND DNA · {dnaDim}</span></header>
            <p>{dimension.summary}</p>
            {dimension.features.map((feature) => <div key={feature.label} className="feature"><span className={feature.basis === "observed" ? "obs" : "inf"}>{feature.basis === "observed" ? "관찰" : "AI 해석"}</span><b>{feature.label}</b><em>{refs(feature.mediaIds) || "이미지 인용 없음"}</em><p>{feature.description}</p><StatusPill status={feature.status}/></div>)}
          </article>;
        })}</div>
        {record.result.commonFeatures.length > 0 && <div className="common" data-testid="visual-dna-common"><small><Eye size={13}/>COMMON FEATURES · 이미지 2장 이상에서 공통</small>{record.result.commonFeatures.map((item) => <article key={item.label}><b>{item.label}</b><em>{DIM_KO[item.dimension]} · {refs(item.mediaIds)}</em><p>{item.description}</p></article>)}</div>}
        {record.result.dnaLinks.length > 0 && <div className="links"><small>TREND DNA 연결</small><ul>{record.result.dnaLinks.map((link) => <li key={`${link.visualDimension}-${link.dnaDimension}`}><b>{DIM_KO[link.visualDimension]} → {link.dnaDimension}</b> {link.note}</li>)}</ul></div>}
        <div className="limits"><small>LIMITATIONS</small><ul>{record.result.limitations.map((item) => <li key={item}>{item}</li>)}</ul><p className="vlog">SERVER VALIDATION · 없는 이미지 ID 제거 {record.validation.removedMediaIds.length} · 관찰→해석 하향 {record.validation.downgraded} · 1장뿐인 공통 특징 제거 {record.validation.droppedCommon} · 인용 없는 색 제거 {record.validation.droppedPalette} · {record.promptVersion}</p></div>
      </>}
    </div>}
    <style jsx>{`
      .body{padding:16px;display:grid;gap:12px}
      .head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
      .error{margin:0;color:#a3122e;font-size:13px}
      .images{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
      .images a{position:relative;display:block}
      .images b{position:absolute;top:4px;left:4px;font-family:var(--font-display);font-size:11px;padding:1px 6px;border-radius:4px;background:#14161f;color:#fff}
      .legend{margin:0;font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center}
      .obs,.inf{font-size:11px;font-weight:800;padding:2px 8px;border:1.5px solid var(--ink);border-radius:999px;white-space:nowrap}
      .obs{background:#c9fbd9}.inf{background:#f3e8ff;color:#6b3fa0}
      small{display:flex;gap:6px;align-items:center;font-family:var(--font-display);font-size:11px;letter-spacing:.05em;color:var(--blue);margin-bottom:6px}
      .palette>div{display:flex;flex-wrap:wrap;gap:8px}
      .swatch{display:grid;grid-template-columns:28px auto;grid-template-rows:auto auto;column-gap:8px;align-items:center;padding:6px 10px 6px 6px;border:1.5px solid var(--ink);border-radius:8px;background:#fff}
      .swatch i{grid-row:span 2;width:28px;height:28px;border-radius:4px;border:1px solid rgba(20,22,31,.3)}
      .swatch b{font-size:12px}.swatch code{font-size:11px;color:var(--muted)}.swatch em{grid-column:2;font-style:normal;font-size:10px;color:var(--muted)}
      .dims{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .dim{border:1.5px solid var(--ink);border-radius:8px;padding:12px;background:#fff;display:grid;gap:6px;align-content:start;min-width:0}
      .dim header{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}
      .dim h3{margin:0;font-size:14px}.dim h3 em{font-style:normal;font-size:11px;color:var(--muted);font-weight:500}
      .dim>p{margin:0;font-size:12px;color:#2e3140;line-height:1.6}
      .link{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:#f6ff3a;border:1.5px solid var(--ink)}
      .feature{display:grid;grid-template-columns:auto 1fr auto;gap:4px 8px;align-items:center;padding-top:6px;border-top:1px dashed var(--line)}
      .feature b{font-size:12px}.feature em{font-style:normal;font-size:11px;color:var(--muted);font-family:ui-monospace,monospace}
      .feature p{grid-column:1/-1;margin:0;font-size:12px;color:var(--muted);line-height:1.55}
      .feature :global(.status){grid-column:1/-1;justify-self:start}
      .common article{padding:8px 0;border-top:1px dashed var(--line)}.common b{font-size:13px}.common em{font-style:normal;font-size:11px;color:var(--muted);margin-left:8px}.common p{margin:4px 0 0;font-size:12px;color:var(--muted)}
      .links ul,.limits ul{margin:0;padding-left:18px;font-size:12px;line-height:1.7;color:#2e3140}
      .vlog{font-size:11px;color:var(--muted);margin:8px 0 0}
      @media(max-width:900px){.images{grid-template-columns:repeat(3,minmax(0,1fr))}.dims{grid-template-columns:1fr}}
    `}</style>
  </section>;
}
