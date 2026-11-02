"use client";

import { useLayoutEffect, useRef } from "react";
import type { CardDesign, SceneElement, SceneFrame } from "@/lib/card-design";
import { useAssetSrc } from "@/lib/asset-storage";
import type { ImageAssetRef } from "@/lib/image-assets";

/*
 * 카드뉴스 디자인 미리보기. Figma 플러그인과 같은 장면(scene)을 HTML로 그린다.
 * 글꼴 측정은 브라우저 기준이라 Figma 결과와 줄바꿈이 조금 다를 수 있다(플러그인이 실제 글꼴로 한 번 더 맞춘다).
 */
const WEIGHT: Record<string, number> = { Thin: 100, Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900 };
const FONT_URL = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Noto+Serif+KR:wght@700;900&family=Black+Han+Sans&family=Jua&family=Do+Hyeon&family=Gowun+Dodum&display=swap";

/** 플러그인과 같은 규칙: 상자를 넘치면 최소 크기까지 2px씩 줄인다. */
function FitText({ element, scale }: { element: Extract<SceneElement, { kind: "text" }>; scale: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let size = element.size;
    node.style.fontSize = `${size * scale}px`;
    while (node.scrollHeight > element.h * scale + 1 && size > element.minSize) { size -= 2; node.style.fontSize = `${size * scale}px`; }
    node.dataset.fitSize = String(size);
    node.dataset.overflow = String(node.scrollHeight > element.h * scale + 1);
  }, [element, scale]);
  const justify = element.valign === "BOTTOM" ? "flex-end" : element.valign === "CENTER" ? "center" : "flex-start";
  return <div style={{ position: "absolute", left: element.x * scale, top: element.y * scale, width: element.w * scale, height: element.h * scale, display: "flex", flexDirection: "column", justifyContent: justify }} data-name={element.name}>
    <div ref={ref} data-testid="preview-text" data-role={element.role} style={{ fontFamily: `"${element.font.family}", "Noto Sans KR", sans-serif`, fontWeight: WEIGHT[element.font.style] ?? 400, fontSize: element.size * scale, lineHeight: element.lineHeight, letterSpacing: `${element.tracking / 100}em`, color: element.color, textAlign: element.align.toLowerCase() as "left" | "center" | "right", whiteSpace: "pre-wrap", wordBreak: "keep-all", overflowWrap: "anywhere" }}>{element.text}</div>
  </div>;
}

function PreviewImage({ element, asset, scale }: { element: Extract<SceneElement, { kind: "image" }>; asset: ImageAssetRef | undefined; scale: number }) {
  const { src } = useAssetSrc(asset);
  const style = { position: "absolute" as const, left: element.x * scale, top: element.y * scale, width: element.w * scale, height: element.h * scale, borderRadius: (element.radius ?? 0) * scale, overflow: "hidden" as const, background: element.fallback };
  // eslint-disable-next-line @next/next/no-img-element -- 생성 이미지(data URL·서명 URL)를 그대로 표시
  return <div style={style} data-name={element.name}>{src ? <img src={src} alt={element.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/> : null}</div>;
}

function Element({ element, scale, assets }: { element: SceneElement; scale: number; assets: Map<string, ImageAssetRef> }) {
  if (element.kind === "text") return <FitText element={element} scale={scale}/>;
  if (element.kind === "image") return <PreviewImage element={element} asset={assets.get(element.assetId)} scale={scale}/>;
  const box = { position: "absolute" as const, left: element.x * scale, top: element.y * scale, width: element.w * scale, height: element.h * scale };
  if (element.kind === "gradient") return <div style={{ ...box, background: `linear-gradient(to bottom, rgba(0,0,0,${element.from}), rgba(0,0,0,${element.to}))` }} data-name={element.name}/>;
  // Figma rotation은 왼쪽 위 기준 반시계 방향이다.
  return <div style={{ ...box, background: element.fill, opacity: element.opacity ?? 1, borderRadius: element.kind === "ellipse" ? "50%" : (element.radius ?? 0) * scale, transformOrigin: "0 0", transform: element.rotation ? `rotate(${-element.rotation}deg)` : undefined, boxSizing: "border-box", border: element.stroke ? `${(element.strokeWidth ?? 1) * scale}px solid ${element.stroke}` : undefined }} data-name={element.name}/>;
}

export function CardFrame({ frame, width, assets }: { frame: SceneFrame; width: number; assets: Map<string, ImageAssetRef> }) {
  const scale = width / frame.width;
  return <div className="card-frame" style={{ position: "relative", width, height: frame.height * scale, background: frame.background, overflow: "hidden", flex: "0 0 auto" }} data-testid="preview-frame" data-layout={frame.layout}>
    {frame.elements.map((element, index) => <Element key={index} element={element} scale={scale} assets={assets}/>)}
  </div>;
}

export function CardPreview({ design, assets, width = 216 }: { design: CardDesign; assets: ImageAssetRef[]; width?: number }) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return <div className="card-preview" data-testid="design-preview" data-style={design.style}>
    <link rel="stylesheet" href={FONT_URL}/>
    <div className="strip">{design.frames.map((frame) => <figure key={frame.id}><CardFrame frame={frame} width={width} assets={byId}/><figcaption>{frame.name}{frame.notes.length ? " · 메모 있음" : ""}</figcaption></figure>)}</div>
    <style jsx>{`
      .strip{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 10px}
      figure{margin:0;display:grid;gap:4px}
      figcaption{font-size:10px;color:var(--muted)}
    `}</style>
  </div>;
}
