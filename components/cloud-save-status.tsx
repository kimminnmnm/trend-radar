"use client";

import Link from "next/link";
import type { PersistenceResult } from "@/lib/cloud-storage";

/**
 * 저장 결과를 브라우저와 클라우드로 나눠 보여 준다.
 * 클라우드 "저장됨"은 Supabase가 행을 돌려준 경우만이다. 실패는 브라우저 저장 성공과 별도로 빨갛게 표시한다.
 */
export function CloudSaveStatus({ result }: { result: PersistenceResult }) {
  const cloud = {
    saved: { text: "클라우드 저장됨", cls: "ok" },
    failed: { text: `클라우드 저장 실패${result.error ? `: ${result.error}` : ""}`, cls: "fail" },
    "signed-out": { text: "클라우드 미저장 · 로그인 필요", cls: "warn" },
    "not-configured": { text: "클라우드 미설정", cls: "muted" },
  }[result.cloud];
  return <div className="save-status" role="status" data-testid="cloud-save-status" data-cloud={result.cloud}>
    <span className={result.local ? "ok" : "fail"}>{result.local ? "브라우저 저장됨" : "브라우저 저장 실패"}</span>
    <span className={cloud.cls}>{cloud.text}</span>
    {result.cloud === "signed-out" && <Link href="/auth">로그인</Link>}
    <style jsx>{`
      .save-status{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px;font-size:12px}
      .save-status span{padding:3px 9px;border:1.5px solid var(--ink);border-radius:999px;background:#fff;font-weight:700;line-height:1.4}
      .save-status .ok{background:#c9fbd9}
      .save-status .fail{background:#ffe1e1;color:#a3122e;border-color:#a3122e}
      .save-status .warn{background:#fffbd1}
      .save-status .muted{color:var(--muted)}
      .save-status :global(a){font-weight:700;color:var(--blue);text-decoration:underline}
    `}</style>
  </div>;
}
