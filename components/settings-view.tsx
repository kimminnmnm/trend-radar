"use client";

import { CheckCircle2, KeyRound, LockKeyhole, PlugZap } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "./ui";
import { InterfaceStyleSetting } from "./interface-style-setting";

type State = "checking" | "configured" | "valid" | "missing" | "not-implemented" | "approval-required";
type IntegrationStatus = {
  openai: { configured: boolean };
  naver: { configured: boolean };
  youtube: { configured: boolean; usage: { searchUsed: number; detailUsed: number; searchLimit: number } };
  googleTrends: { configured: false; implemented: false; status: "alpha_approval_required" };
  supabase: { configured: boolean; implemented: boolean; tablesReady: boolean | null };
};

const connections = [
  { key: "openai", name: "OpenAI", env: "OPENAI_API_KEY", desc: "WHY·DNA·Collision·Lab·Studio 구조화 분석, DNA 임베딩" },
  { key: "supabase", name: "Supabase", env: "NEXT_PUBLIC_SUPABASE_URL", desc: "사용자별 영구 저장 및 RLS" },
  { key: "naver", name: "NAVER DataLab", env: "NAVER_CLIENT_ID", desc: "실제 검색 관심도" },
  { key: "meta", name: "Meta / Instagram", env: "META_ACCESS_TOKEN", desc: "허용 범위 내 해시태그 메타데이터" },
  { key: "youtube", name: "YouTube Data API v3", env: "YOUTUBE_API_KEY", desc: "최근 관련 영상·게시 시각·공개 조회수 표본" },
  { key: "googleTrends", name: "Google Trends API", env: "ALPHA ACCESS", desc: "Alpha 승인 전 · 실제 연결하지 않음" },
] as const;

function stateLabel(state: State) {
  if (state === "checking") return "CHECKING";
  if (state === "valid") return "TOKEN VALID";
  if (state === "configured") return "CONFIGURED";
  if (state === "not-implemented") return "CONFIGURED · TABLES MISSING";
  if (state === "approval-required") return "ALPHA APPROVAL REQUIRED";
  return "NOT CONFIGURED";
}

export function SettingsView() {
  const [states, setStates] = useState<Record<(typeof connections)[number]["key"], State>>({
    openai: "checking", supabase: "checking", naver: "checking", meta: "checking", youtube: "checking", googleTrends: "checking",
  });

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/integrations/status", { signal: controller.signal, cache: "no-store" }).then((response) => response.json() as Promise<IntegrationStatus>),
      fetch("/api/meta/status", { signal: controller.signal, cache: "no-store" }).then((response) => response.json() as Promise<{ tokenValid?: boolean }>),
    ]).then(([integrations, meta]) => {
      setStates({
        openai: integrations.openai.configured ? "configured" : "missing",
        naver: integrations.naver.configured ? "configured" : "missing",
        supabase: integrations.supabase.configured
          ? integrations.supabase.tablesReady ? "configured" : "not-implemented"
          : "missing",
        meta: meta.tokenValid ? "valid" : "missing",
        youtube: integrations.youtube.configured ? "configured" : "missing",
        googleTrends: "approval-required",
      });
    }).catch((error: Error) => {
      if (error.name !== "AbortError") {
        setStates({ openai: "missing", supabase: "missing", naver: "missing", meta: "missing", youtube: "missing", googleTrends: "approval-required" });
      }
    });
    return () => controller.abort();
  }, []);

  return <div className="page"><PageHeader eyebrow="SYSTEM / SETTINGS" title="Connections & data integrity." description="실데이터 연결 상태와 데모 모드를 명확히 분리합니다. 키는 브라우저가 아닌 서버 환경변수로 관리합니다."/>
    <InterfaceStyleSetting/>
    <div className="settings-grid"><section className="panel"><header><PlugZap/><div><h2>Data connections</h2><p>CONFIGURED는 키 설정 여부이며 실제 API 성공은 기능 실행 시 별도로 검증합니다.</p></div></header>{connections.map((connection) => { const state = states[connection.key]; return <article key={connection.name}><div className="connection-icon"><KeyRound/></div><div><h3>{connection.name}</h3><p>{connection.desc}</p><code>{connection.env}</code></div><span className={state === "valid" || state === "configured" ? "connected" : ""}>{stateLabel(state)}</span></article>; })}</section><aside className="panel"><LockKeyhole/><h2>Hybrid mode</h2><p>OpenAI 호출은 서버에서 동일 입력 캐시·중복 요청 병합·분당/일일 상한(OPENAI_RATE_PER_MINUTE, OPENAI_DAILY_LIMIT)으로 보호됩니다.</p><ul><li><CheckCircle2/>WHY·DNA·Collision·Lab·Studio: LIVE ON REQUEST</li><li><CheckCircle2/>Instagram 해시태그 게시물: WHY 근거로 수집</li><li><CheckCircle2/>저장 결과 우선 표시, 재분석은 명시적 실행</li><li><CheckCircle2/>기존 샘플: DEMO 배지로 분리</li></ul></aside></div>
    <style jsx>{`.settings-grid{display:grid;grid-template-columns:1fr 320px;gap:14px}.settings-grid section{padding:28px}.settings-grid section>header{display:flex;gap:14px;align-items:center;border-bottom:1px solid var(--border);padding-bottom:22px}.settings-grid header>svg{color:var(--accent)}.settings-grid h2{font-size:17px;margin:0 0 7px}.settings-grid p{font-size:12px;color:var(--muted);margin:0}.settings-grid article{display:grid;grid-template-columns:42px 1fr auto;gap:14px;align-items:center;padding:20px 0;border-bottom:1px solid var(--border)}.connection-icon{width:38px;height:38px;border:1px solid var(--border);display:grid;place-items:center;border-radius:6px}.connection-icon svg{width:15px;color:#787878}.settings-grid h3{font-size:13px;margin:0 0 5px}.settings-grid article code{font-size:11px;color:#8b8b8b}.settings-grid article>span{font-size:11px;color:#a27826;border:1px solid #f4f5f9;padding:6px}.settings-grid article>span.connected{color:var(--mint);border-color:#d5d9ea}.settings-grid aside{padding:28px;align-self:start;background:#f4f5f9}.settings-grid aside>svg{color:var(--accent);margin-bottom:25px}.settings-grid aside p{line-height:1.8;margin:15px 0}.settings-grid ul{list-style:none;padding:15px 0;border-top:1px solid var(--border)}.settings-grid li{display:flex;gap:8px;align-items:center;font-size:11px;color:#676767;margin:10px 0}.settings-grid li svg{width:13px;color:var(--accent)}@media(max-width:800px){.settings-grid{grid-template-columns:1fr}.settings-grid article{grid-template-columns:42px 1fr}.settings-grid article>span{grid-column:2;justify-self:start}}`}</style>
  </div>;
}
