"use client";

import { MediaThumb } from "./media-thumb";
import { cardImage } from "@/lib/visual-media";
import Link from "next/link";
import { ArrowRight, Atom, Compass, Eye, GitBranch, Layers3, Orbit, Radar } from "lucide-react";
import { getCollisions, getLiveAnalyses, getWatchlist } from "@/lib/storage";
import { useAccountSync } from "@/lib/account-sync";
import { useStored } from "@/lib/use-stored";
import { useInstagramAutofill } from "@/lib/instagram-autofill";
import { buildCultureEdges } from "@/lib/culture-graph";
import { trendPath } from "@/lib/live-trend";
import { PageHeader, SectionHeading, StatusPill, TextLink } from "./ui";
import { selectWhyOverview, usedWhyEvidenceIds } from "@/lib/why-summary";
import { NowTrending } from "./now-trending";
import { HappeningNow } from "./happening-now";
import { IgPulse } from "./ig-pulse";
import { Onboarding } from "./onboarding";

const formatKoreanDate = (value: string) => new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "short",
  day: "numeric",
}).format(new Date(value));

export function Overview() {
  const stored = useStored(getLiveAnalyses);
  const live = stored ?? [];
  const igFill = useInstagramAutofill(stored);
  const watchlist = useStored(getWatchlist) ?? [];
  const sync = useAccountSync();
  // 브라우저 저장소를 읽기 전이나 계정 데이터를 불러오는 중에는 "분석 없음"을 확정해서 보여 주지 않는다.
  const cloudLoading = sync.phase === "checking" || sync.phase === "syncing";
  const analyzedKeys = new Set(live.flatMap((item) => [item.trendName, ...item.keywords].map((value) => value.trim().toLocaleLowerCase("ko-KR"))));
  const searchedOnly = watchlist.filter((item) => !analyzedKeys.has(item.keyword.trim().toLocaleLowerCase("ko-KR"))).slice(0, 12);
  const collisions = useStored(getCollisions) ?? [];
  const evidenceCount = live.reduce((sum, item) => sum + (item.evidence?.length ?? 0), 0);
  const edgeCount = buildCultureEdges(live.filter((item) => item.whyReport), collisions).length;
  const ideaCount = collisions.reduce((sum, item) => sum + item.result.creativeOpportunities.length, 0);
  const latest = live[0];
  // 분석 흐름은 데모가 아니라 가장 최근 LIVE 트렌드로 연결하고, 없으면 Discover로 보낸다.
  const flow = [
    { n: "01", label: "찾기", sub: "DISCOVER", text: "키워드를 입력하거나 오늘 뜨는 신호에서 고릅니다", href: "/discover" },
    { n: "02", label: "왜 뜨나", sub: "WHY", text: "검색 추이·게시물·뉴스 근거로 원인을 읽습니다", href: latest ? trendPath(latest.trendId, "why") : "/discover" },
    { n: "03", label: "DNA 분해", sub: "DNA", text: "6가지 문화 요소로 나눕니다", href: latest ? trendPath(latest.trendId, "dna") : "/discover" },
    { n: "04", label: "섞어 보기", sub: "COLLISION", text: "트렌드를 섞어 새 아이디어를 찾습니다", href: "/collision" },
    { n: "05", label: "기획안", sub: "STUDIO", text: "근거가 연결된 콘텐츠로 바꿉니다", href: "/studio" },
  ];
  return <div className="page overview-page">
    <PageHeader eyebrow="CULTURAL INTELLIGENCE OBSERVATORY" title={<>Read the signal.<br/><em>Understand the culture.</em></>} description="지금 뜨는 트렌드를 실제 데이터로 찾고, 왜 뜨는지와 어떤 기획이 가능한지까지 이어서 분석합니다." action={<Link className="button primary" href="/discover">키워드 분석 시작 <ArrowRight size={15}/></Link>} />

    <Onboarding/>
    <IgPulse/>
    <NowTrending/>
    <HappeningNow/>

    <div className="signal-strip panel"><div className="live"><i/> {live.length ? "LIVE OBSERVATORY" : "OBSERVATORY READY"}</div><div className="marquee">{live.length ? live.slice(0, 4).map((item, index) => <span key={item.id}>{index > 0 && <b>×</b>}{item.trendName}</span>) : <span>NAVER 스캔 결과와 데모 예시는 섞어서 표시하지 않습니다.</span>}</div><small>{live.length ? `LIVE ${live.length} · NAVER + INSTAGRAM + WEB + OPENAI` : "NO LIVE ANALYSIS YET"}</small></div>

    <div className="grid four metric-row">
      <div className="metric-card panel"><small>분석한 트렌드</small><strong>{String(live.length).padStart(2, "0")}</strong><p>DNA 완료 {live.filter((item) => item.dna).length}개</p><i className="orb"/></div>
      <div className="metric-card panel"><small>근거 항목</small><strong>{String(evidenceCount).padStart(2, "0")}</strong><p>NAVER·Instagram·웹 출처 원장</p><i className="orb"/></div>
      <div className="metric-card panel"><small>트렌드 연결</small><strong>{String(edgeCount).padStart(2, "0")}</strong><p>근거가 있는 Culture Map 연결</p><i className="orb"/></div>
      <div className="metric-card panel"><small>기획 아이디어</small><strong>{String(ideaCount).padStart(2, "0")}</strong><p>Collision 가설 (예측 아님)</p><i className="orb"/></div>
    </div>

    <section className="section"><SectionHeading index="01" title="내 LIVE 분석" description="직접 수집하고 분석한 신호만 표시합니다. 다시 열 때는 API 비용이 들지 않습니다."/>
      {sync.phase === "error" && <div className="state-box panel error-box" data-testid="overview-cloud-error"><h3>계정 데이터를 불러오지 못했습니다.</h3><p>{sync.error ?? sync.message} 이 브라우저에 있는 분석은 그대로 표시합니다.</p></div>}
      {igFill.phase !== "idle" && <p className={`ig-fill ${igFill.phase}`} role="status" data-testid="ig-autofill">{igFill.phase === "loading" ? "사진 없는 카드를 Instagram 사진으로 채우는 중…" : igFill.message}</p>}
      {live.length ? <><div className="grid three">{live.slice(0, 3).map((item) => { const insight = selectWhyOverview(item); const used = usedWhyEvidenceIds(item.whyReport, item.evidence); return <article className="live-card panel" key={item.id}>
        <MediaThumb media={cardImage(item)} label={item.trendName}/>
        <small>LIVE · {formatKoreanDate(item.analyzedAt)}</small><h3>{item.trendName}</h3><p>{insight.summary}</p><div className="card-evidence"><StatusPill status={insight.status}/><span>사용 근거 {used.length}/{item.evidence?.length ?? 0}{insight.needsReanalysis ? " · 재분석 권장" : ""}</span></div>
        <div className="live-links"><Link className="button" href={trendPath(item.trendId, "why")}><Orbit size={14}/>WHY 보기</Link><Link className={`button${item.dna ? "" : " primary"}`} href={trendPath(item.trendId, "dna")}><Atom size={14}/>{item.dna ? "DNA 보기" : "DNA 분해하기"}</Link></div>
      </article>; })}</div>
      {live.length > 3 && <div className="more-live panel" data-testid="overview-all-live"><small>이전에 분석한 키워드 · 전체 {live.length}개</small><div>{live.slice(3).map((item) => <Link key={item.id} href={trendPath(item.trendId, "why")}>{item.trendName}<em>{formatKoreanDate(item.analyzedAt)}</em></Link>)}</div></div>}</>
      : stored === null || cloudLoading ? <div className="state-box panel" data-testid="overview-loading"><Compass/><h3>{stored === null ? "저장된 분석을 확인하는 중입니다." : "계정의 클라우드 분석을 불러오는 중입니다."}</h3><p>잠시만 기다려 주세요.</p></div>
      : <div className="state-box panel" data-testid="overview-empty"><Compass/><h3>아직 직접 분석한 트렌드가 없습니다.</h3><p>{sync.phase === "signed-out" ? "다른 브라우저에서 분석했다면 로그인하면 계정에 저장된 분석을 불러옵니다. " : ""}위 해시태그 보드나 2030 순위의 ▶ 버튼을 누르거나, Discover에서 궁금한 키워드를 입력해 첫 분석을 시작하세요.</p><Link className="button primary" href="/discover">키워드 분석 시작 <ArrowRight size={14}/></Link></div>}
      {searchedOnly.length > 0 && <div className="searched panel" data-testid="overview-searched"><small>찾아본 키워드 · 분석 아님 (Discover 후보 · 이 브라우저)</small><div>{searchedOnly.map((item) => <Link key={item.keyword} href="/discover">{item.keyword}</Link>)}</div><p>아직 WHY 분석을 하지 않은 키워드입니다. 분석 결과가 아니므로 위 LIVE 분석과 따로 표시합니다.</p></div>}
      {live.length > 0 && <div className="section-action"><TextLink href="/discover">새 키워드 분석</TextLink></div>}
    </section>

    <section className="section"><SectionHeading index="02" title="분석 흐름" description="찾기에서 기획까지 맥락이 끊기지 않고 이어집니다. 각 단계를 누르면 해당 화면으로 이동합니다."/><div className="flow-track">{flow.map((item, i) => <Link href={item.href} key={item.n} className="flow-step"><span>{item.n}</span><div><strong>{item.label}</strong><em>{item.sub}</em><small>{item.text}</small></div>{i < flow.length - 1 && <ArrowRight size={16}/>}</Link>)}</div></section>

    <section className="section editorial-grid"><div className="manifesto panel"><div><Radar size={24}/><small>OUR QUESTION</small></div><h2>What connects<br/>these cultures?</h2><p>유사한 키워드가 아니라 사람들이 반복해서 선택하는 감정과 행동을 봅니다.</p><TextLink href="/culture-map">Culture Map 열기</TextLink></div><div className="principles"><article><Eye/><div><h3>근거와 해석 분리</h3><p>데이터로 관찰한 사실, 출처가 보도한 사실, AI 가설을 구분해 표시합니다.</p></div></article><article><GitBranch/><div><h3>문화적 연결</h3><p>공통 속성, 의미 유사성, 관찰된 연결을 서로 다른 선으로 다룹니다.</p></div></article><article><Layers3/><div><h3>실행 가능성</h3><p>인사이트를 브랜드 적합성 검토와 콘텐츠 기획으로 이어 줍니다.</p></div></article></div></section>

    <style jsx>{`
      .signal-strip{min-height:48px;display:flex;align-items:center;padding:0 18px;gap:24px;overflow:hidden;margin-top:4px}.live{font-size:12px;font-weight:700;color:var(--accent);letter-spacing:.1em;white-space:nowrap}.live i{display:inline-block;width:7px;height:7px;background:var(--accent);border-radius:50%;margin-right:6px}.marquee{display:flex;gap:20px;align-items:center;flex:1;justify-content:center;color:#2e3140;font-size:13px;white-space:nowrap}.marquee span{display:inline-flex;gap:20px}.marquee b{color:#9aa0b4}.signal-strip>small{font-size:12px;color:var(--muted);white-space:nowrap}
      .metric-row{margin-top:16px}.section-action{display:flex;justify-content:flex-end;margin-top:18px}
      .more-live,.searched{margin-top:12px;padding:12px 14px;display:grid;gap:8px}.more-live small,.searched small{font-size:12px;font-weight:700;color:var(--muted)}.more-live>div,.searched>div{display:flex;flex-wrap:wrap;gap:6px}.more-live :global(a),.searched :global(a){display:inline-flex;gap:6px;align-items:center;font-size:13px;font-weight:700;padding:4px 10px;border:1.5px solid var(--ink);border-radius:999px;background:#fff}.more-live :global(em){font-style:normal;font-size:11px;color:var(--muted);font-weight:400}.searched :global(a){border-style:dashed;font-weight:500}.searched p{margin:0;font-size:11px;color:var(--muted)}.live-card{padding:20px;display:flex;flex-direction:column;gap:6px}.live-card small{font-size:12px;font-weight:700;color:var(--accent)}.live-card h3{margin:6px 0 2px;font-size:18px;color:#14161f}.live-card p{margin:0;font-size:13px;color:var(--muted);line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.live-links{display:flex;gap:6px;margin-top:auto;padding-top:8px;flex-wrap:wrap}
      .flow-track{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-radius:8px;overflow:hidden;background:#fff;border:1.5px solid var(--ink);box-shadow:var(--drop)}/* 단계 카드는 Next.js Link(커스텀 컴포넌트)라 styled-jsx 스코프 클래스가 붙지 않는다. :global로 지정해야 적용된다. */.flow-track :global(.flow-step){min-height:118px;padding:18px;display:flex;align-items:center;gap:11px;border-right:1.5px solid var(--ink);transition:background .15s;min-width:0}.flow-track :global(.flow-step:last-child){border-right:0}.flow-track :global(.flow-step:hover){background:#f6ff3a}.flow-track :global(.flow-step)>span{color:#1f2fe0;font-family:var(--font-display);font-size:13px;font-weight:700;flex:0 0 auto}.flow-track :global(.flow-step) div{display:grid;gap:4px;flex:1;min-width:0}.flow-track :global(.flow-step) strong{font-size:16px;color:#14161f}.flow-track :global(.flow-step) em{font-style:normal;font-size:11px;font-weight:700;color:#6e7386;letter-spacing:.08em}.flow-track :global(.flow-step) small{color:var(--muted);font-size:12px;line-height:1.5}.flow-track :global(.flow-step svg){color:#1f2fe0;flex:0 0 auto}
      .editorial-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:16px}.manifesto{padding:35px;min-height:320px;display:flex;flex-direction:column}.manifesto>div{display:flex;align-items:center;gap:11px;color:var(--accent)}.manifesto small{font-size:12px;letter-spacing:.14em}.manifesto h2{font-size:40px;line-height:1.08;letter-spacing:-.03em;font-weight:700;margin:36px 0 14px;color:#14161f}.manifesto p{font-size:14px;color:var(--muted);line-height:1.7;max-width:420px}.manifesto :global(.text-link){margin-top:auto}.principles{display:grid;gap:10px}.principles article{display:flex;gap:18px;padding:22px;border-radius:14px;background:rgba(255,255,255,.88);box-shadow:var(--drop),0 0 0 1px var(--border)}.principles :global(svg){color:var(--accent);width:20px;flex:0 0 auto}.principles h3{font-size:15px;margin:0 0 6px}.principles p{font-size:13px;color:var(--muted);line-height:1.7;margin:0}
      @media(max-width:1050px){.flow-track{grid-template-columns:1fr}.flow-track :global(.flow-step){min-height:76px;border-right:0;border-bottom:1.5px solid var(--ink)}.flow-track :global(.flow-step:last-child){border-bottom:0}.editorial-grid{grid-template-columns:1fr}}@media(max-width:760px){.marquee span:nth-of-type(n+3),.marquee b:nth-of-type(n+2){display:none}.manifesto h2{font-size:32px}}
    `}</style>
    <style jsx>{`.card-evidence{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px}.card-evidence span{font-size:11px;color:var(--muted)}`}</style>
  </div>;
}
