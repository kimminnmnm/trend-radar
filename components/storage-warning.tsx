"use client";

import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { STORAGE_FAILED_EVENT, storageUsage } from "@/lib/storage";

/** 저장 항목 키 → 사용자에게 보여 줄 이름. */
const LABELS: Record<string, string> = {
  "trend-radar-studio-projects": "Content Studio 프로젝트(이미지 축소본 포함)",
  "trend-radar-workspace": "Workspace 저장 항목",
  "trend-radar-live-analyses": "LIVE 분석(WHY·DNA)",
  "trend-radar-creative-collisions": "Creative Collision 결과",
  "trend-radar-collisions": "Culture Collision 결과",
  "trend-radar-discoveries": "WHAT'S HAPPENING NOW? 결과",
};
const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)}MB`;

/**
 * V4 P0: 브라우저 저장(localStorage)이 실패하면 모든 화면 위에 알린다. 이전에는 저장 실패가 조용히 무시돼
 * 새로고침 뒤 편집·분석·Collision이 사라지거나 예전 사본이 열렸다(2026-11-04 실사용 재현).
 * 아무것도 자동으로 지우지 않는다 — 어디가 큰지 보여 주고 사용자가 정리하게 한다.
 */
export function StorageWarning() {
  const [failed, setFailed] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const onFail = (event: Event) => { setFailed((event as CustomEvent<{ key: string }>).detail?.key ?? "unknown"); setDismissed(false); };
    window.addEventListener(STORAGE_FAILED_EVENT, onFail);
    return () => window.removeEventListener(STORAGE_FAILED_EVENT, onFail);
  }, []);
  if (!failed || dismissed) return null;
  const top = storageUsage().slice(0, 3);
  return <div className="storage-warning" role="alert" data-testid="storage-warning">
    <AlertTriangle size={16}/>
    <div>
      <b>브라우저 저장 공간이 가득 차 방금 작업이 이 브라우저에 저장되지 않았습니다.</b>
      <p>새로고침하면 이전 상태로 돌아갈 수 있습니다. 로그인했다면 Workspace의 클라우드 저장을 이용하고, 쓰지 않는 항목을 지워 공간을 확보하세요.{top.length ? ` 가장 큰 항목: ${top.map((row) => `${LABELS[row.key] ?? row.key} ${mb(row.bytes)}`).join(" · ")}` : ""}</p>
      <Link href="/workspace" className="button" data-testid="storage-warning-workspace">Workspace에서 정리하기</Link>
    </div>
    <button type="button" className="close" onClick={() => setDismissed(true)} aria-label="경고 닫기"><X size={14}/></button>
    <style jsx>{`
      .storage-warning{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start;margin:0 0 12px;padding:10px 12px;border:2px solid #b3261e;background:#fff3f0;color:#5a1712;border-radius:6px;font-size:13px}
      .storage-warning p{margin:4px 0 8px;font-size:12px;line-height:1.5}.storage-warning .close{border:0;background:transparent;cursor:pointer;color:inherit;padding:2px}
    `}</style>
  </div>;
}
