"use client";

import { useState } from "react";
import { ImageOff, Play } from "lucide-react";
import type { VisualMedia } from "@/lib/visual-media";

const PLATFORM_LABEL: Record<VisualMedia["platform"], string> = { youtube: "YouTube", instagram: "Instagram", web: "웹 출처" };

/**
 * 원본 플랫폼 이미지를 그대로 불러오는 썸네일(서버 복제 없음). 로딩 스켈레톤 → 이미지 / 실패·없음이면 대체 그래픽.
 * referrerPolicy no-referrer로 앱 주소를 외부에 넘기지 않는다.
 */
export function MediaThumb({ media, label, demo = false, ratio = "16 / 9" }: { media: VisualMedia | null; label: string; demo?: boolean; ratio?: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const src = media?.thumbnailUrl ?? null;
  const showImage = Boolean(src) && state !== "error";
  return <div className={`media-thumb ${state}${showImage ? "" : " empty"}${demo ? " demo" : ""}`} style={{ aspectRatio: ratio }} data-testid="media-thumb" data-state={showImage ? state : "placeholder"}>
    {showImage ? <>
      {/* eslint-disable-next-line @next/next/no-img-element -- 외부 원본 URL을 그대로 표시한다(next/image 최적화 서버를 거치지 않음) */}
      <img src={src!} alt={`${PLATFORM_LABEL[media!.platform]} 이미지: ${media!.title}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={() => setState("loaded")} onError={() => setState("error")}/>
      {media!.mediaType === "video" && <span className="play" aria-hidden><Play size={16}/></span>}
      <span className="credit">{PLATFORM_LABEL[media!.platform]}{media!.author ? ` · ${media!.author}` : ""}</span>
    </> : <div className="placeholder" role="img" aria-label={demo ? `${label} — DEMO, 실제 이미지 없음` : media && state === "error" ? `${label} — 이미지를 불러오지 못함` : `${label} — 출처가 확인된 이미지 없음`}>
      <ImageOff size={18} aria-hidden/>
      <span>{demo ? "DEMO · 실제 이미지 없음" : media && state === "error" ? "이미지를 불러오지 못했습니다" : "출처 확인된 이미지 없음"}</span>
    </div>}
    <style jsx>{`
      .media-thumb{position:relative;width:100%;overflow:hidden;border:1.5px solid var(--ink);border-radius:6px;background:#eef1ff}
      .media-thumb.loading:not(.empty){background:linear-gradient(90deg,#eef1ff 0%,#f7f8fc 50%,#eef1ff 100%);background-size:200% 100%;animation:shimmer 1.2s linear infinite}
      @keyframes shimmer{to{background-position:-200% 0}}
      img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}      .play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:36px;height:36px;border-radius:50%;background:rgba(20,22,31,.75);color:#fff;display:grid;place-items:center}
      .credit{position:absolute;left:6px;bottom:6px;max-width:calc(100% - 12px);font-size:11px;font-weight:700;line-height:1.3;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,.92);color:#14161f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#555a6b;font-size:12px;text-align:center;padding:8px;background:repeating-linear-gradient(0deg,rgba(47,69,255,.06) 0 1px,transparent 1px 8px),repeating-linear-gradient(90deg,rgba(47,69,255,.06) 0 1px,transparent 1px 8px),#f7f8fc}
      .demo .placeholder{background:repeating-linear-gradient(135deg,#fff 0 8px,#fff6ea 8px 16px);color:#6b4100}
      @media (prefers-reduced-motion:reduce){.media-thumb.loading{animation:none}}
    `}</style>
  </div>;
}
