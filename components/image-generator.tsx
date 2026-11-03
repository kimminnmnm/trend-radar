"use client";

import { useState } from "react";
import { ImagePlus, LoaderCircle, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { useAssetSrc } from "@/lib/asset-storage";
import {
  imageAspects, imagePurposeLabels, imageStyleLabels, imageStyles, IMAGE_SIZES, rightsNote, shrinkImage,
  type ImageAspect, type ImageAssetRef, type ImagePurpose, type ImageStyle,
} from "@/lib/image-assets";
import type { ImageBrief } from "@/lib/image-brief";

const STATUS_CLASS: Record<ImageAssetRef["status"], string> = { "REAL REFERENCE": "real", "AI CONCEPT VISUAL": "concept", "AI PRODUCTION ASSET": "production" };

/** 이미지 하나: 상태 배지(REAL REFERENCE / AI CONCEPT VISUAL / AI PRODUCTION ASSET)와 권리 안내를 항상 함께 보여 준다. */
export function AssetImage({ asset, compact = false }: { asset: ImageAssetRef; compact?: boolean }) {
  const { src, error } = useAssetSrc(asset);
  return <figure className={`asset ${STATUS_CLASS[asset.status]}${compact ? " compact" : ""}`} data-testid="asset-image" data-status={asset.status}>
    {/* eslint-disable-next-line @next/next/no-img-element -- data URL·서명 URL·원본 URL을 그대로 표시 */}
    {src ? <img src={src} alt={`${asset.status}: ${asset.title}`} referrerPolicy="no-referrer"/> : <div className="ph">{error ?? "이미지 불러오는 중…"}</div>}
    <figcaption><b>{asset.status}</b>{asset.status !== "REAL REFERENCE" && <span className="ai" data-testid="asset-ai-label">AI 생성 이미지 · 실제 사례 아님</span>}{asset.inspired ? " · INSPIRED CONCEPT" : ""}{!compact && <span>{asset.title}{asset.model ? ` · ${asset.model}` : ""}</span>}{!compact && <em>{asset.rights}</em>}</figcaption>
    <style jsx>{`
      .asset{margin:0;display:grid;gap:4px;min-width:0}
      img,.ph{width:100%;border:1.5px solid var(--ink);border-radius:6px;display:block;background:#f2f3f7}
      .ph{aspect-ratio:1;display:grid;place-items:center;font-size:11px;color:var(--muted);padding:8px;text-align:center}
      figcaption{display:grid;gap:2px;font-size:10px;color:var(--muted)}
      b{justify-self:start;font-size:10px;padding:1px 6px;border:1px solid var(--ink);border-radius:999px;color:#14161f}
      .real b{background:#c9fbd9}.concept b{background:#f3e8ff}.production b{background:#fff3c4}
      span{color:#2e3140}em{font-style:normal}.ai{font-weight:800;color:#7b3fb5}
      .compact figcaption{font-size:9px}
    `}</style>
  </figure>;
}

type Props = {
  initialPrompt: string;
  purposes: ImagePurpose[];
  aspects?: ImageAspect[];
  defaultAspect?: ImageAspect;
  title: string;
  inspired?: boolean;
  /** scopeId는 슬라이드/장면 ID. 요청 ID와 함께 부모가 오래된 응답을 거부할 수 있게 한다. */
  scopeId?: string;
  onStart?: (requestId: string, prompt: string) => void;
  onGenerated: (asset: ImageAssetRef, requestId: string) => void;
  onError?: (message: string, requestId: string) => void;
  testId?: string;
  /** T7: 이 슬라이드의 의미 구조. 프롬프트를 고쳐도 함께 보내 장면이 현상을 벗어나지 않게 한다. */
  brief?: ImageBrief;
};

/**
 * 사용자가 버튼을 눌렀을 때만 이미지 1장을 만든다. 프롬프트·비율·목적·스타일·피사체·배경·색을 고칠 수 있다.
 * 같은 설정은 서버에서 7일 캐시(추가 비용 없음). 실패 시 같은 설정으로 다시 시도할 수 있다.
 */
export function ImageGenerator({ initialPrompt, purposes, aspects = imageAspects, defaultAspect = "1:1", title, inspired = false, scopeId = "image", onStart, onGenerated, onError, testId = "image-generator", brief }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [aspect, setAspect] = useState<ImageAspect>(defaultAspect);
  const [purpose, setPurpose] = useState<ImagePurpose>(purposes[0]);
  const [style, setStyle] = useState<ImageStyle | "">("");
  const [subject, setSubject] = useState("");
  const [background, setBackground] = useState("");
  const [colors, setColors] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const status = purpose === "concept" ? "AI CONCEPT VISUAL" : "AI PRODUCTION ASSET";
  const size = IMAGE_SIZES[aspect];

  const run = async (force = false) => {
    if (state === "loading") return;
    if (!window.confirm(`${status} 1장을 생성할까요?\n${size.width}×${size.height} · 저화질(low) JPEG · OpenAI 이미지 생성 1회(비용 가중치 3, 일일 AI 한도에서 차감).\n같은 설정은 7일간 캐시되어 다시 과금되지 않습니다.`)) return;
    const requestId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${scopeId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setState("loading"); setError(""); onStart?.(requestId, prompt);
    try {
      const response = await apiFetch("/api/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, aspect, purpose, ...(style ? { style } : {}), ...(subject ? { subject } : {}), ...(background ? { background } : {}), ...(colors ? { colors } : {}), ...(brief ? { brief } : {}), force }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "이미지 생성에 실패했습니다.");
      const small = await shrinkImage(body.base64, aspect);
      onGenerated({ id: `img-${requestId}`, status, dataUrl: small.dataUrl, width: small.width, height: small.height, title, prompt: body.prompt ?? prompt, model: body.model, aspect, purpose, createdAt: body.createdAt, rights: rightsNote[status], inspired, ...(brief ? { brief } : {}) }, requestId);
      setState("idle");
    } catch (reason) { const message = reason instanceof Error ? reason.message : "이미지 생성에 실패했습니다."; setError(message); setState("error"); onError?.(message, requestId); }
  };

  return <div className="gen" data-testid={testId}>
    <label>프롬프트<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} maxLength={2000} data-testid={`${testId}-prompt`}/></label>
    <div className="row">
      <label>비율<select value={aspect} onChange={(event) => setAspect(event.target.value as ImageAspect)}>{aspects.map((item) => <option key={item} value={item}>{item} · {IMAGE_SIZES[item].width}×{IMAGE_SIZES[item].height}</option>)}</select></label>
      <label>목적<select value={purpose} onChange={(event) => setPurpose(event.target.value as ImagePurpose)}>{purposes.map((item) => <option key={item} value={item}>{imagePurposeLabels[item]}</option>)}</select></label>
      <label>스타일<select value={style} onChange={(event) => setStyle(event.target.value as ImageStyle | "")}><option value="">프롬프트대로</option>{imageStyles.map((item) => <option key={item} value={item}>{imageStyleLabels[item]}</option>)}</select></label>
    </div>
    <div className="row">
      <label>주요 피사체<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={300} placeholder="선택"/></label>
      <label>배경<input value={background} onChange={(event) => setBackground(event.target.value)} maxLength={300} placeholder="선택"/></label>
      <label>색상<input value={colors} onChange={(event) => setColors(event.target.value)} maxLength={200} placeholder="선택"/></label>
    </div>
    {brief && <details className="brief" data-testid={`${testId}-brief`}><summary>SEMANTIC BRIEF · 이 슬라이드 장면의 의미(프롬프트와 함께 전송)</summary><dl>
      {([["SUBJECT", brief.subject], ["ACTION", brief.action], ["OBJECT", brief.object], ["CULTURAL CONTEXT", brief.culturalContext], ["VISUAL DIRECTION", brief.visualDirection], ["SCENE PURPOSE", brief.scenePurpose]] as const).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      <div><dt>FORBIDDEN MISINTERPRETATIONS</dt><dd><ul>{brief.forbidden.map((item) => <li key={item}>{item}</li>)}</ul></dd></div>
    </dl></details>}
    <p className="cost">{status} · {size.width}×{size.height} · 생성 1회 = 비용 가중치 3 · 버튼을 누를 때만 생성 · 글자·로고·실존 인물·저작권 캐릭터는 넣지 않도록 요청합니다.</p>
    <div className="row actions">
      <button type="button" className="button" onClick={() => void run(false)} disabled={state === "loading" || prompt.trim().length < 20} data-testid={`${testId}-run`}>{state === "loading" ? <><LoaderCircle className="spin" size={14}/>생성 중…</> : <><ImagePlus size={14}/>이미지 생성</>}</button>
      {state === "error" && <button type="button" className="button" onClick={() => void run(true)} data-testid={`${testId}-retry`}><RotateCcw size={14}/>다시 시도</button>}
    </div>
    {state === "error" && <p className="err" role="alert">{error}</p>}
    <style jsx>{`
      .gen{display:grid;gap:6px;padding:8px;border:1px dashed var(--border);border-radius:6px;background:#fafbff;min-width:0}
      label{display:grid;gap:2px;font-size:10px;font-weight:700;color:var(--blue);min-width:0}
      textarea,input,select{font:inherit;font-size:12px;padding:5px 6px;border:1.5px solid var(--ink);border-radius:4px;background:#fff;min-width:0;width:100%;box-sizing:border-box}
      textarea{font-family:ui-monospace,monospace;font-size:11px}
      .row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.row.actions{display:flex;flex-wrap:wrap}
      .cost{margin:0;font-size:10px;color:var(--muted)}.brief{font-size:11px;border:1px solid #d7c6f0;background:#faf6ff;padding:5px 7px;border-radius:4px}.brief summary{cursor:pointer;font-weight:800;color:#7b3fb5;font-size:10.5px}.brief dl{margin:6px 0 0;display:grid;gap:3px}.brief dt{font-size:9.5px;font-weight:900;color:#7b3fb5;letter-spacing:.05em}.brief dd{margin:0;overflow-wrap:anywhere}.brief ul{margin:0;padding-left:16px}.err{margin:0;font-size:12px;color:#a3122e}
      @media(max-width:600px){.row{grid-template-columns:1fr}}
    `}</style>
  </div>;
}
