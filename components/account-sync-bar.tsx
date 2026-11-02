"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudUpload, LoaderCircle, RefreshCw, X } from "lucide-react";
import { startAccountSync, syncAccount, uploadLocalToAccount, useAccountSync } from "@/lib/account-sync";

/**
 * 앱 공용 계정 동기화 막대. 로그인 계정의 클라우드 데이터를 불러오고(진행·오류 표시),
 * 이 브라우저에만 있는 항목은 사용자가 승인했을 때만 계정에 올린다.
 */
export function AccountSyncBar() {
  const sync = useAccountSync();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  useEffect(() => { startAccountSync(); }, []);

  if (sync.phase === "checking" || sync.phase === "not-configured" || sync.phase === "signed-out") return null;
  const pending = sync.pendingAnalyses + sync.pendingSaved;
  const pendingKey = `${sync.userId}:${sync.pendingAnalyses}:${sync.pendingSaved}`;
  const showPending = sync.phase === "ready" && pending > 0 && dismissedFor !== pendingKey;
  if (sync.phase === "ready" && !showPending && !sync.uploading && !sync.message.startsWith("업로드")) return null;

  const upload = async () => {
    const ok = window.confirm(`이 브라우저에만 있는 분석 ${sync.pendingAnalyses}개와 인사이트·기획안 ${sync.pendingSaved}개를 ${sync.email ?? "현재"} 계정에 올릴까요?\n\n· 클라우드 데이터는 지우지 않습니다.\n· 같은 항목은 중복으로 만들지 않고, 클라우드가 더 최신이면 덮어쓰지 않습니다.`);
    if (ok) await uploadLocalToAccount();
  };

  return <div className={`account-sync ${sync.phase}`} data-testid="account-sync" role="status">
    {sync.phase === "syncing" || sync.uploading ? <LoaderCircle className="spin" size={16}/> : <Cloud size={16}/>}
    <div className="text">
      <strong>{sync.phase === "syncing" ? "계정 데이터 불러오는 중" : sync.phase === "error" ? "클라우드 동기화 오류" : showPending ? "계정에 없는 데이터가 있습니다" : "클라우드"}</strong>
      <span data-testid="account-sync-message">{showPending ? `이 브라우저에만 있는 분석 ${sync.pendingAnalyses}개 · 인사이트·기획안 ${sync.pendingSaved}개` : sync.message}{sync.error ? ` — ${sync.error}` : ""}</span>
    </div>
    <div className="actions">
      {showPending && <button type="button" className="button primary" onClick={upload} disabled={sync.uploading} data-testid="account-sync-upload"><CloudUpload size={14}/>계정에 업로드</button>}
      {sync.phase === "error" && <button type="button" className="button" onClick={() => void syncAccount(true)}><RefreshCw size={14}/>다시 시도</button>}
      {(showPending || sync.phase === "ready") && <button type="button" className="icon-button" aria-label="닫기" onClick={() => setDismissedFor(pendingKey)}><X size={14}/></button>}
    </div>
    <style jsx>{`
      .account-sync{display:flex;align-items:center;gap:12px;max-width:1320px;margin:0 auto 14px;padding:10px 14px;background:#fff;border:1.5px solid var(--ink);border-radius:8px;box-shadow:var(--drop)}
      .account-sync.error{background:#fff1f1}
      .account-sync :global(svg){flex:0 0 auto;color:var(--blue)}
      .text{display:grid;gap:1px;min-width:0;flex:1}
      .text strong{font-size:13px}
      .text span{font-size:12px;color:var(--muted);word-break:break-all}
      .actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      @media(max-width:760px){.account-sync{flex-wrap:wrap}.actions{width:100%}}
    `}</style>
  </div>;
}
