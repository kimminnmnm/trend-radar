"use client";

import { useState } from "react";
import Link from "next/link";
import { Cloud, CloudDownload, CloudUpload, Database, LoaderCircle } from "lucide-react";
import { countCultureCloudRows, CULTURE_CLOUD_TABLES, pullCultureCloud, pushCultureCloud, type CloudRowCounts } from "@/lib/culture-cloud-sync";
import { refreshPending, useAccountSync } from "@/lib/account-sync";

/**
 * Culture Map 클라우드 동기화 패널. 로그인 상태와 자동 불러오기는 앱 공용 계정 동기화(lib/account-sync)가 맡는다.
 * 저장 성공 여부는 "DB 행 확인"으로 실제 Supabase 행 수를 보고 판단한다.
 */
export function CultureCloudPanel() {
  const sync = useAccountSync();
  const auth = sync.phase === "checking" ? "checking" : sync.phase === "not-configured" ? "not-configured" : sync.userId ? "signed-in" : "signed-out";
  const email = sync.email ?? "";
  const [busy, setBusy] = useState<"pull" | "push" | "count" | null>(null);
  const [message, setMessage] = useState("");
  const [counts, setCounts] = useState<CloudRowCounts | null>(null);

  const pull = async () => {
    setBusy("pull");
    const report = await pullCultureCloud();
    setMessage(report.ok ? report.message : `불러오기 실패: ${report.message}`);
    setBusy(null);
    void refreshPending();
  };

  const push = async () => {
    setBusy("push");
    const report = await pushCultureCloud();
    setMessage(report.ok ? report.message : `저장 실패: ${report.message}`);
    setBusy(null);
    void refreshPending();
    if (report.ok) void count();
  };
  const count = async () => {
    setBusy("count");
    const result = await countCultureCloudRows();
    setCounts(result);
    if (!result.ok) setMessage(`행 확인 실패: ${result.message}`);
    setBusy(null);
  };

  if (auth === "checking") return null;
  return <section className="cloud panel" data-testid="culture-cloud">
    <div className="head"><Cloud size={18}/><div><small>SUPABASE CLOUD</small><strong data-testid="culture-cloud-auth">{auth === "signed-in" ? `로그인됨 · ${email}` : auth === "signed-out" ? "로그인하지 않음 · 이 브라우저에만 저장" : "Supabase 미설정"}</strong></div></div>
    {auth === "signed-in" ? <div className="actions">
      <button type="button" className="button" onClick={pull} disabled={busy !== null} data-testid="cloud-pull">{busy === "pull" ? <LoaderCircle className="spin" size={14}/> : <CloudDownload size={14}/>}클라우드에서 불러오기</button>
      <button type="button" className="button primary" onClick={push} disabled={busy !== null} data-testid="cloud-push">{busy === "push" ? <LoaderCircle className="spin" size={14}/> : <CloudUpload size={14}/>}클라우드에 저장</button>
      <button type="button" className="button" onClick={count} disabled={busy !== null} data-testid="cloud-count">{busy === "count" ? <LoaderCircle className="spin" size={14}/> : <Database size={14}/>}DB 행 확인</button>
    </div> : auth === "signed-out" ? <Link className="button" href="/auth">로그인하고 클라우드 사용</Link> : null}
    {(message || (auth === "signed-in" && sync.message)) && <p className="msg" role="status" data-testid="culture-cloud-message">{message || sync.message}</p>}
    {counts?.ok && <div className="counts" data-testid="cloud-counts">
      <small>내 계정의 Supabase 실제 행 수 (localStorage 아님)</small>
      <dl>{CULTURE_CLOUD_TABLES.map((table) => <div key={table}><dt>{table}</dt><dd data-testid={`cloud-count-${table}`}>{counts.counts[table] ?? 0}</dd></div>)}</dl>
      <p data-testid="cloud-duplicates" className={counts.duplicateAnalyses ? "warn" : ""}>{counts.duplicateAnalyses ? `중복 분석 행 ${counts.duplicateAnalyses}개 (같은 트렌드·분석 시각)` : "중복 분석 행 없음"}</p>
    </div>}
    <style jsx>{`
      .cloud{padding:14px 16px;margin-bottom:12px;display:grid;gap:10px}
      .head{display:flex;align-items:center;gap:10px}
      .head :global(svg){color:var(--blue);flex:0 0 auto}
      .head small{display:block;font-family:var(--font-display);font-size:11px;letter-spacing:.06em;color:var(--muted)}
      .head strong{font-size:13px;word-break:break-all}
      .actions{display:flex;flex-wrap:wrap;gap:8px}
      .msg{margin:0;font-size:12px;line-height:1.6;color:var(--text);background:var(--raised);border:1px solid var(--line);border-radius:6px;padding:8px 10px}
      .counts small{font-size:11px;color:var(--muted)}
      .counts dl{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px 12px;margin:6px 0}
      .counts dl div{display:flex;justify-content:space-between;gap:8px;font-size:12px;border-bottom:1px dashed var(--line);padding:3px 0}
      .counts dt{font-family:ui-monospace,monospace;color:var(--muted)}
      .counts dd{margin:0;font-weight:800;font-variant-numeric:tabular-nums}
      .counts p{margin:0;font-size:12px;color:var(--accent);font-weight:700}
      .counts p.warn{color:var(--pink)}
    `}</style>
  </section>;
}
