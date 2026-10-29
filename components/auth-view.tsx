"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, KeyRound, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { clearLocalAnalysisData } from "@/lib/storage";
import { PageHeader } from "./ui";

export function AuthView() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    if (!supabase) { const frame = requestAnimationFrame(() => setLoading(false)); return () => cancelAnimationFrame(frame); }
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true); setMessage("");
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth` } });
    setLoading(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === "signup" && !result.data.session) setMessage("확인 이메일을 보냈습니다. 이메일 인증 후 로그인하세요.");
    else setMessage(mode === "signin" ? "로그인했습니다." : "계정을 만들고 로그인했습니다.");
  };

  const signOut = async () => { if (!supabase) return; await supabase.auth.signOut(); setSignedOut(true); setMessage("로그아웃했습니다. 클라우드 분석은 계정에 남아 있고, 이 브라우저에 저장된 분석도 그대로 남아 있습니다."); };
  const clearLocal = () => { if (!window.confirm("이 브라우저에 저장된 분석·Collision·기획안을 모두 지울까요? 클라우드에 저장된 분석은 지워지지 않습니다.")) return; setMessage(clearLocalAnalysisData() ? "이 브라우저의 저장 데이터를 지웠습니다." : "브라우저 저장소를 지우지 못했습니다."); setSignedOut(false); };

  return <div className="page"><PageHeader eyebrow="ACCOUNT / SUPABASE AUTH" title="Your analysis, across devices." description="로그인하면 LIVE WHY 분석을 사용자별 RLS가 적용된 Supabase Workspace에 저장합니다."/>
    {!supabase?<div className="auth-card panel"><KeyRound/><h2>Supabase is not configured</h2><p>NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정하세요.</p></div>:loading?<div className="auth-card panel"><LoaderCircle className="spin"/><p>인증 상태를 확인하고 있습니다.</p></div>:user?<div className="auth-card panel signed-in"><CheckCircle2/><small>AUTHENTICATED USER</small><h2>{user.email}</h2><p>이제 LIVE WHY에서 연결한 분석은 이 계정의 Cloud Workspace에도 저장됩니다.</p><div><Link className="button primary" href="/workspace">Open Workspace</Link><button className="button" onClick={signOut}><LogOut/>Sign out</button></div></div>:<div className="auth-layout"><form className="auth-form panel" onSubmit={submit}><div className="auth-tabs"><button type="button" className={mode==="signin"?"active":""} onClick={()=>setMode("signin")}>SIGN IN</button><button type="button" className={mode==="signup"?"active":""} onClick={()=>setMode("signup")}>CREATE ACCOUNT</button></div><label>EMAIL<input type="email" required autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)}/></label><label>PASSWORD<input type="password" required minLength={6} autoComplete={mode==="signin"?"current-password":"new-password"} value={password} onChange={event=>setPassword(event.target.value)}/></label>{message&&<p className="message">{message}</p>}{signedOut&&<button type="button" className="button" onClick={clearLocal} data-testid="clear-local">공용 PC라면: 이 브라우저 데이터도 지우기</button>}<button className="button primary" disabled={loading}>{mode==="signin"?"Sign in":"Create account"}</button></form><aside className="panel"><ShieldCheck/><h2>Private by database policy</h2><p>브라우저에는 공개 anon 키만 포함됩니다. 저장된 분석은 로그인 사용자의 ID와 RLS 정책으로 분리됩니다.</p><ul><li>비로그인: localStorage</li><li>로그인: localStorage + Supabase</li><li>Service role key: 브라우저 미사용</li></ul></aside></div>}
    <style jsx>{`.auth-layout{display:grid;grid-template-columns:1fr 320px;gap:14px;max-width:850px}.auth-form,.auth-layout aside,.auth-card{padding:30px}.auth-card{max-width:720px;min-height:230px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center}.auth-card>svg,.auth-layout aside>svg{color:var(--mint);width:30px}.auth-card h2,.auth-layout aside h2{font-size:20px}.auth-card p,.auth-layout aside p{font-size:12px;color:var(--muted);line-height:1.8}.signed-in small{font-size:11px;color:var(--mint);margin-top:20px}.signed-in>div{display:flex;gap:8px}.signed-in .button :global(svg){width:13px}.auth-tabs{display:flex;border-bottom:1px solid var(--border);margin-bottom:25px}.auth-tabs button{background:transparent;border:0;border-bottom:2px solid transparent;color:#7c7c7c;padding:11px;font-size:11px;cursor:pointer}.auth-tabs button.active{color:var(--accent);border-color:var(--accent)}.auth-form label{display:block;font-size:11px;color:#787878;letter-spacing:.1em;margin:16px 0}.auth-form input{display:block;width:100%;box-sizing:border-box;margin-top:7px;background:#f4f5f9;border:1px solid var(--border);color:var(--text);padding:12px}.auth-form>.button{width:100%;margin-top:12px}.message{font-size:11px;color:#9c7528;line-height:1.6}.auth-layout aside ul{padding-left:16px;color:#646464;font-size:11px;line-height:2}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:700px){.auth-layout{grid-template-columns:1fr}.signed-in>div{flex-direction:column}}`}</style>
  </div>;
}
