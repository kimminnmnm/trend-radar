"use client";

import Link from "next/link";
import { ArrowRight, Eye, GitBranch, Layers3, Radar } from "lucide-react";
import { trends } from "@/lib/demo-data";
import { getCollisions, getLiveAnalyses } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { buildCultureEdges } from "@/lib/culture-graph";
import { PageHeader, SectionHeading, TextLink } from "./ui";
import { TrendCard } from "./trend-card";
import { NowTrending } from "./now-trending";
import { IgPulse } from "./ig-pulse";

const flow = [
  { n:"01", label:"DISCOVER", text:"신호를 발견합니다", href:"/discover" },
  { n:"02", label:"WHY", text:"맥락과 원인을 읽습니다", href:"/trends/heisei-retro/why" },
  { n:"03", label:"DNA", text:"문화적 요소를 분해합니다", href:"/trends/heisei-retro/dna" },
  { n:"04", label:"COLLIDE", text:"낯선 연결을 탐색합니다", href:"/collision" },
  { n:"05", label:"CREATE", text:"기획으로 전환합니다", href:"/studio" },
];

export function Overview() {
  const live = useStored(getLiveAnalyses) ?? [];
  const collisions = useStored(getCollisions) ?? [];
  const evidenceCount = live.reduce((sum, item) => sum + (item.evidence?.length ?? 0), 0);
  const edgeCount = buildCultureEdges(live.filter((item) => item.whyReport), collisions).length;
  const ideaCount = collisions.reduce((sum, item) => sum + item.result.creativeOpportunities.length, 0);
  return <div className="page overview-page">
    <PageHeader eyebrow="CULTURAL INTELLIGENCE OBSERVATORY" title={<>Read the signal.<br/><em>Understand the culture.</em></>} description="트렌드가 떠오르는 순간보다 그 아래에서 움직이는 감정, 행동, 문화적 맥락을 관찰합니다." action={<Link className="button primary" href="/discover">Start exploring <ArrowRight size={15}/></Link>} />

    <IgPulse/>
    <NowTrending/>

    <div className="signal-strip panel"><div className="live"><i/> {live.length ? "LIVE OBSERVATORY" : "DEMO OBSERVATORY"}</div><div className="marquee"><span>HEISEI RETRO</span><b>×</b><span>ANALOG LOGGING</span><b>×</b><span>CHARACTER CUSTOMIZATION</span><b>×</b><span>COMPACT DIGITAL</span></div><small>{live.length ? `LIVE ${live.length} · NAVER + INSTAGRAM + OPENAI` : "NO LIVE ANALYSIS YET"}</small></div>

    <div className="grid four metric-row">
      <div className="metric-card panel"><small>LIVE TRENDS</small><strong>{String(live.length).padStart(2, "0")}</strong><p>DNA 완료 {live.filter((item) => item.dna).length} · DEMO {trends.length}개 별도</p><i className="orb"/></div>
      <div className="metric-card panel"><small>EVIDENCE ITEMS</small><strong>{String(evidenceCount).padStart(2, "0")}</strong><p>NAVER·Instagram API 응답 기반 원장</p><i className="orb"/></div>
      <div className="metric-card panel"><small>CULTURE LINKS</small><strong>{String(edgeCount).padStart(2, "0")}</strong><p>근거·유형이 있는 LIVE 엣지</p><i className="orb"/></div>
      <div className="metric-card panel"><small>CREATIVE ROUTES</small><strong>{String(ideaCount).padStart(2, "0")}</strong><p>Collision 가설, 예측 아님</p><i className="orb"/></div>
    </div>

    <section className="section"><SectionHeading index="01" title="Signals in focus" description="데모 데이터셋의 예시 신호입니다. LIVE 분석은 Discover에서 시작합니다."/><div className="grid three">{trends.slice(0,3).map(t=><TrendCard key={t.id} trend={t}/>)}</div><div className="section-action"><TextLink href="/discover">모든 트렌드 탐색</TextLink></div></section>

    <section className="section"><SectionHeading index="02" title="One connected inquiry" description="발견에서 기획까지, 분석 맥락이 끊기지 않는 워크플로"/><div className="flow-track">{flow.map((item,i)=><Link href={item.href} key={item.n} className="flow-step"><span>{item.n}</span><div><strong>{item.label}</strong><small>{item.text}</small></div>{i<flow.length-1&&<ArrowRight size={16}/>}</Link>)}</div></section>

    <section className="section editorial-grid"><div className="manifesto panel"><div><Radar size={24}/><small>OUR QUESTION</small></div><h2>What connects<br/>these cultures?</h2><p>유사한 키워드가 아니라 사람들이 반복해서 선택하는 감정과 행동을 봅니다.</p><TextLink href="/culture-map">Culture Map 열기</TextLink></div><div className="principles"><article><Eye/><div><h3>Explainability</h3><p>AI 해석과 관찰 사실을 분리하고, 각 주장에 검증 상태를 표시합니다.</p></div></article><article><GitBranch/><div><h3>Cultural Connection</h3><p>공통 속성, 의미 유사성, 관찰된 연결을 서로 다른 엣지로 다룹니다.</p></div></article><article><Layers3/><div><h3>Actionability</h3><p>인사이트를 브랜드 적합성 검토와 콘텐츠 기획으로 자연스럽게 이동시킵니다.</p></div></article></div></section>

    <style jsx>{`
      .signal-strip{height:48px;display:flex;align-items:center;padding:0 16px;gap:24px;overflow:hidden}.live{font-size:8px;color:var(--accent);letter-spacing:.12em;white-space:nowrap}.live i{display:inline-block;width:5px;height:5px;background:var(--accent);border-radius:50%;margin-right:6px}.marquee{display:flex;gap:20px;align-items:center;flex:1;justify-content:center;color:#565656;font-size:9px;letter-spacing:.12em;white-space:nowrap}.marquee b{color:#b2b2b2}.signal-strip>small{font-size:8px;color:#939393;white-space:nowrap}.metric-row{margin-top:16px}.section-action{display:flex;justify-content:flex-end;margin-top:18px}.flow-track{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid var(--border);border-radius:10px;overflow:hidden}.flow-step{min-height:112px;padding:20px;display:flex;align-items:center;gap:11px;border-right:1px solid var(--border);transition:.2s;background:#e6e6e6}.flow-step:last-child{border:0}.flow-step:hover{background:#e3e3e3}.flow-step>span{color:#979797;font-size:9px}.flow-step div{display:grid;gap:7px;flex:1}.flow-step strong{font-size:11px;letter-spacing:.09em}.flow-step small{color:#777777;font-size:9px}.flow-step svg{color:#ababab}.editorial-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:16px}.manifesto{padding:35px;min-height:355px;display:flex;flex-direction:column;background:radial-gradient(circle at 90% 0%,rgba(24,24,167,.13),transparent 35%),#e3e3e3}.manifesto>div{display:flex;align-items:center;gap:11px;color:var(--accent)}.manifesto small{font-size:9px;letter-spacing:.14em}.manifesto h2{font-size:42px;line-height:1.04;letter-spacing:-.05em;font-weight:500;margin:45px 0 15px}.manifesto p{font-size:12px;color:var(--muted);line-height:1.7;max-width:420px}.manifesto .text-link{margin-top:auto}.principles{display:grid;gap:10px}.principles article{display:flex;gap:18px;padding:23px;border:1px solid var(--border);border-radius:10px;background:#e6e6e6}.principles svg{color:var(--accent);width:20px;flex:0 0 auto}.principles h3{font-size:13px;margin:0 0 8px}.principles p{font-size:11px;color:var(--muted);line-height:1.7;margin:0}@media(max-width:1050px){.flow-track{grid-template-columns:1fr}.flow-step{min-height:75px;border-right:0;border-bottom:1px solid var(--border)}.editorial-grid{grid-template-columns:1fr}}@media(max-width:760px){.marquee span:nth-of-type(n+3),.marquee b:nth-of-type(n+2){display:none}.manifesto h2{font-size:34px}}
    `}</style>
  </div>;
}
