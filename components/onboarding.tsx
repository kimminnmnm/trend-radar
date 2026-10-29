"use client";

import Link from "next/link";
import { ArrowRight, Atom, Compass, FlaskConical, Orbit, Sparkles, X } from "lucide-react";
import { getOnboardingDone, setOnboardingDone } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { WinButtons } from "./ui";

const steps = [
  { icon: Compass, title: "① 찾기", sub: "Discover", text: "궁금한 키워드를 입력하거나, 아래 '지금 뜨는 해시태그'·'2030 순위'에서 고릅니다." },
  { icon: Orbit, title: "② 왜 뜨나", sub: "Trend WHY", text: "검색 추이·인스타그램 게시물·뉴스 근거로 뜨는 이유를 분석합니다." },
  { icon: Atom, title: "③ DNA 분해", sub: "Trend DNA", text: "트렌드를 감성·감정·행동·사물·문화·사람 6가지 요소로 나눕니다." },
  { icon: Sparkles, title: "④ 섞어 보기", sub: "Collision", text: "분석한 트렌드 2~4개를 섞어 새로운 기획 아이디어를 찾습니다." },
  { icon: FlaskConical, title: "⑤ 기획안", sub: "Content Studio", text: "분석 근거가 연결된 콘텐츠 기획안을 만들고 저장합니다." },
];

/** 첫 방문자 안내. 화면을 가리지 않는 창이며, 닫으면 다시 보이지 않는다(사이드바 '사용 가이드'로 다시 열기). */
export function Onboarding() {
  const done = useStored(getOnboardingDone);
  if (done !== false) return null;
  return <section className="onboarding panel" aria-label="처음 사용 안내" data-testid="onboarding">
    <div className="titlebar"><span>WELCOME.EXE — 처음 오셨나요?</span><WinButtons/></div>
    <div className="ob-body">
      <header><div><h2>TREND RADAR는 이렇게 씁니다</h2><p>키워드 하나로 시작해 <b>왜 뜨는지 → 무엇으로 이루어졌는지 → 어떤 기획이 가능한지</b>까지 이어집니다. API 비용은 분석 버튼을 누를 때만 발생하고, 결과는 저장돼 다시 열 때 비용이 들지 않습니다.</p></div>
        <button className="icon-button" aria-label="안내 닫기" onClick={() => setOnboardingDone(true)}><X/></button></header>
      <ol>{steps.map(({ icon: Icon, title, sub, text }) => <li key={title}><Icon/><b>{title}</b><small>{sub}</small><p>{text}</p></li>)}</ol>
      <div className="ob-legend"><span><i className="data-badge live">LIVE</i> 방금 실제 API로 받은 결과</span><span><i className="data-badge saved">SAVED</i> 저장해 둔 실제 결과</span><span><i className="data-badge demo">DEMO</i> 예시 데이터(실제 아님)</span><span><i className="tag-ai">AI 가설</i> 근거로 확인되지 않은 해석</span></div>
      <div className="ob-actions"><Link className="button primary" href="/discover" onClick={() => setOnboardingDone(true)}>키워드로 첫 분석 시작 <ArrowRight size={15}/></Link><button className="button" onClick={() => setOnboardingDone(true)}>둘러볼게요</button></div>
    </div>
  </section>;
}
