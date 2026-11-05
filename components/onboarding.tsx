"use client";

import Link from "next/link";
import { ArrowRight, Atom, Compass, FlaskConical, Lightbulb, Orbit, Search, Sparkles, X } from "lucide-react";
import { getOnboardingDone, setOnboardingDone } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { WinButtons } from "./ui";

/** V4: 목적부터 고른다. 모든 단계를 거칠 필요가 없다는 것을 먼저 알린다. */
const purposes = [
  { id: "find", icon: Search, title: "트렌드를 찾고 이해하기", text: "키워드가 지금 뜨는지, 왜 뜨는지 근거로 확인합니다.", need: "키워드 하나면 됩니다", href: "/discover", cta: "키워드 분석하러 가기" },
  { id: "idea", icon: Lightbulb, title: "새 아이디어 얻기", text: "분석한 트렌드 2~4개를 섞어 기획 아이디어를 찾습니다.", need: "먼저 WHY 분석한 트렌드 2개 이상", href: "/collision", cta: "섞어 보기로 가기" },
  { id: "make", icon: FlaskConical, title: "콘텐츠 만들기", text: "분석 근거로 카드뉴스·숏폼 원고와 이미지를 만들고 Figma로 보냅니다.", need: "먼저 WHY 분석한 트렌드 1개", href: "/studio", cta: "Content Studio로 가기" },
];
const steps = [
  { icon: Compass, title: "① 찾기", sub: "Discover", text: "궁금한 키워드를 입력하거나, 아래 '지금 뜨는 해시태그'·'2030 순위'에서 고릅니다.", optional: false },
  { icon: Orbit, title: "② 왜 뜨나", sub: "Trend WHY", text: "검색 추이·인스타그램 게시물·뉴스 근거로 뜨는 이유를 분석합니다.", optional: false },
  { icon: FlaskConical, title: "③ 콘텐츠 만들기", sub: "Content Studio", text: "분석 근거가 연결된 카드뉴스·숏폼을 만들고 저장합니다.", optional: false },
  { icon: Atom, title: "+ DNA 분해", sub: "선택 · Trend DNA", text: "트렌드를 감성·감정·행동·사물·문화·사람 6가지 요소로 나눕니다.", optional: true },
  { icon: Sparkles, title: "+ 섞어 보기", sub: "선택 · Collision", text: "분석한 트렌드 2~4개를 섞어 새로운 기획 아이디어를 찾습니다.", optional: true },
];

/** 첫 방문자 안내. 화면을 가리지 않는 창이며, 닫으면 다시 보이지 않는다(사이드바 '사용 가이드'로 다시 열기). */
export function Onboarding() {
  const done = useStored(getOnboardingDone);
  if (done !== false) return null;
  return <section className="onboarding panel" aria-label="처음 사용 안내" data-testid="onboarding">
    <div className="titlebar"><span>WELCOME.EXE — 처음 오셨나요?</span><WinButtons/></div>
    <div className="ob-body">
      <header><div><h2>무엇을 하러 오셨나요?</h2><p>목적에 맞는 곳에서 시작하세요. <b>모든 단계를 거칠 필요는 없습니다</b> — 기본은 찾기 → 왜 뜨나 → 콘텐츠 만들기이고, DNA 분해·섞어 보기는 필요할 때만 씁니다. API 비용은 분석 버튼을 누를 때만 발생하고, 결과는 저장돼 다시 열 때 비용이 들지 않습니다.</p></div>
        <button className="icon-button" aria-label="안내 닫기" onClick={() => setOnboardingDone(true)}><X/></button></header>
      <div className="ob-purposes" data-testid="onboarding-purposes">{purposes.map(({ id, icon: Icon, title, text, need, href, cta }) => <Link key={id} href={href} className="ob-purpose" data-testid={`onboarding-purpose-${id}`} onClick={() => setOnboardingDone(true)}><Icon/><b>{title}</b><p>{text}</p><small>{need}</small><span>{cta} <ArrowRight size={13}/></span></Link>)}</div>
      <ol>{steps.map(({ icon: Icon, title, sub, text, optional }) => <li key={title} className={optional ? "optional" : undefined}><Icon/><b>{title}</b><small>{sub}</small><p>{text}</p></li>)}</ol>
      <div className="ob-legend"><span><i className="data-badge live">LIVE</i> 방금 실제 API로 받은 결과</span><span><i className="data-badge saved">SAVED</i> 저장해 둔 실제 결과</span><span><i className="data-badge demo">DEMO</i> 예시 데이터(실제 아님)</span><span><i className="tag-ai">AI 가설</i> 근거로 확인되지 않은 해석</span></div>
      <div className="ob-actions"><Link className="button primary" href="/discover" onClick={() => setOnboardingDone(true)}>키워드로 첫 분석 시작 <ArrowRight size={15}/></Link><button className="button" onClick={() => setOnboardingDone(true)}>둘러볼게요</button></div>
    </div>
  </section>;
}
