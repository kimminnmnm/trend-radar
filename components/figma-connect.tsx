"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle, PlugZap, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { signedInClient } from "@/lib/cloud-storage";
import { DataBadge, PageHeader } from "./ui";

type State = "checking" | "signed-out" | "ready" | "approving" | "done" | "error";

/** Figma 플러그인이 연 연결 페이지. 쓰기 키는 주소 #key=에 있다(서버로 전송되지 않는 부분). 로그인한 사용자가 허용해야 연결된다. */
export function FigmaConnect() {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const found = new URLSearchParams(window.location.hash.slice(1)).get("key");
    void (async () => {
      const session = await signedInClient();
      setKey(found);
      setEmail(session?.user.email ?? null);
      setState(!found ? "error" : session ? "ready" : "signed-out");
      if (!found) setMessage("연결 키가 없습니다. Figma 플러그인에서 “TREND RADAR 연결”을 다시 누르세요.");
    })();
  }, []);
  const approve = async () => {
    if (!key) return;
    setState("approving");
    try {
      const response = await apiFetch("/api/figma/pair/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ writeKey: key }) });
      const body = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) { setState("error"); setMessage(body.message ?? "연결하지 못했습니다."); return; }
      // 쓰기 키는 한 번만 쓰인다. 주소에서 지운다.
      window.history.replaceState(null, "", window.location.pathname);
      setState("done");
    } catch { setState("error"); setMessage("서버에 연결하지 못했습니다."); }
  };
  return <div className="page figma-connect">
    <PageHeader eyebrow="FIGMA · PLUGIN CONNECT" title="Figma 플러그인 연결" description="TREND RADAR Studio Import 플러그인이 내 계정의 “Figma로 보내기” 작업을 읽을 수 있게 허용합니다. 다른 데이터나 비용이 드는 API에는 접근하지 않습니다."/>
    <section className="panel connect-box" data-testid="figma-connect" data-state={state}>
      {state === "checking" && <p><LoaderCircle className="spin" size={16}/> 로그인 상태를 확인하는 중…</p>}
      {state === "signed-out" && <><DataBadge status="NOT AVAILABLE" detail="로그인 필요"/><p>연결하려면 먼저 로그인하세요. 로그인한 뒤 이 창으로 돌아와 새로고침하면 됩니다(연결 키는 10분 유효).</p><Link className="button primary" href="/auth" target="_blank">로그인 열기</Link></>}
      {(state === "ready" || state === "approving") && <>
        <p><ShieldCheck size={16}/> <b>{email}</b> 계정으로 연결합니다.</p>
        <ul><li>허용 범위: 내가 보낸 Figma 작업 목록·디자인 데이터 읽기, 가져옴 기록</li><li>연결 유효기간: 30일 · 키·토큰은 해시로만 저장</li><li>Figma 플러그인에서 “연결 해제”를 누르면 그 기기에서 지워집니다.</li></ul>
        <button type="button" className="button primary" onClick={() => void approve()} disabled={state === "approving"} data-testid="figma-connect-approve"><PlugZap size={14}/>{state === "approving" ? "연결 중…" : "이 Figma 플러그인 연결 허용"}</button>
      </>}
      {state === "done" && <p data-testid="figma-connect-done"><CheckCircle2 size={16}/> 연결했습니다. Figma로 돌아가면 플러그인이 자동으로 작업 목록을 불러옵니다. 이 창은 닫아도 됩니다.</p>}
      {state === "error" && <p className="error" data-testid="figma-connect-error">{message}</p>}
    </section>
    <style jsx>{`
      .connect-box{padding:18px;display:grid;gap:10px;max-width:640px}
      .connect-box p{margin:0;display:flex;gap:6px;align-items:center;flex-wrap:wrap;line-height:1.6}
      .connect-box ul{margin:0;padding-left:18px;font-size:13px;color:var(--muted);line-height:1.7}
      .connect-box .button{justify-self:start}
      .error{color:#c0392b}
    `}</style>
  </div>;
}
