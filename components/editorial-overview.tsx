"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, ArrowUpRight, Atom, Compass, FlaskConical, Network, Orbit } from "lucide-react";
import { getCollisions, getCreativeRuns, getDiscoveryReports, getLiveAnalyses, getStudioProjects } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { trendPath } from "@/lib/live-trend";
import { buildCultureEdges } from "@/lib/culture-graph";
import { productionFormatLabels, resolvedSlideImageAssetId, type StudioProject } from "@/lib/content-production";
import { formatDateTime } from "./ui";
import { Onboarding } from "./onboarding";
import { IgPulse } from "./ig-pulse";
import { NowTrending } from "./now-trending";
import { HappeningNow } from "./happening-now";
import { AssetImage } from "./image-generator";
import { SignalVisualizer } from "./signal-visualizer";
import { TrendWebPreview } from "./trend-web-preview";
import { CountUp, Reveal, useActiveIndex } from "./motion";


/** 편집형 섹션 머리: 인덱스 · 제목 · 한두 줄 설명 */
function EdSection({ id, index, title, kicker, description, children, testId, motion = "rise" }: { id?: string; index: string; title: string; kicker: string; description: string; children: React.ReactNode; testId?: string; motion?: "rise" | "stagger" | "cards" | "mask" }) {
  return <section className="edo-section" id={id} data-testid={testId} aria-labelledby={`${testId ?? index}-title`}>
    <Reveal variant={motion} data-motion={motion}>
      <header className="edo-head"><span className="edo-index">{index}</span><div><small>{kicker}</small><h2 id={`${testId ?? index}-title`}>{title}</h2></div><p>{description}</p></header>
      {children}
    </Reveal>
  </section>;
}

type Step = { n: string; key: string; label: string; text: string; href: string; icon: typeof Compass; optional?: boolean };
/**
 * HOW IT WORKS: 스크롤에 맞춰 지금 지나가는 단계를 강조한다(화면 가운데 띠를 지나는 단계). 넓은 화면은 왼쪽 그래픽이 붙어 있고,
 * 모바일은 붙지 않는다. 스크롤을 막거나 섹션을 늘리지 않는다 — 단계 목록은 원래 높이 그대로.
 */
function HowItWorks({ steps }: { steps: Step[] }) {
  const { active, setActive, bind } = useActiveIndex(steps.length);
  const current = steps[active];
  const Icon = current.icon;
  return <div className="edo-how" data-active={active} data-testid="edo-how-flow">
    <aside className="edo-how-visual" aria-hidden="true">
      <span className="edo-how-n" key={current.n}>{current.n}</span>
      <Icon size={36}/>
      <b>{current.key}</b>
      <ol className="edo-how-track">{steps.map((step, index) => <li key={step.n} className={`${index === active ? "on" : index < active ? "past" : ""} ${step.optional ? "opt" : ""}`}><i/>{step.key}</li>)}</ol>
    </aside>
    <ol className="edo-steps edo-steps--v">{steps.map(({ n, key, label, text, href, icon: StepIcon, optional }, index) => <li key={n} ref={bind(index)} className={index === active ? "on" : ""} data-testid="edo-step" aria-current={index === active ? "step" : undefined}>
      <Link href={href} onFocus={() => setActive(index)}><span className="edo-step-n">{n}</span><StepIcon size={20} aria-hidden/><b>{key}{optional ? " · 선택" : ""}</b><strong>{label}</strong><p>{text}</p><ArrowUpRight className="edo-go" size={18} aria-hidden/></Link>
    </li>)}</ol>
  </div>;
}

const coverOf = (project: StudioProject) => {
  const slides = project.plan?.slides ?? [];
  for (const slide of slides) {
    const id = resolvedSlideImageAssetId(slide, project.assets);
    const asset = id ? project.assets.find((item) => item.id === id) : undefined;
    if (asset && (asset.dataUrl || asset.storagePath)) return asset;
  }
  return undefined;
};

/**
 * TREND RADAR 3.0 Editorial Web의 Overview. 기존 Overview의 데이터 모듈(Instagram Pulse·2030 HIGH SCORE·WHAT'S HAPPENING NOW?·TREND WEB)을
 * 그대로 다시 쓰고(수집·계산 로직 변경 없음), 스크롤 순서와 위계만 새로 짠다. 유료 API는 화면을 여는 것만으로 호출하지 않는다.
 */
export function EditorialOverview() {
  const stored = useStored(getLiveAnalyses);
  const live = useMemo(() => stored ?? [], [stored]);
  const storedCollisions = useStored(getCollisions);
  const collisions = useMemo(() => storedCollisions ?? [], [storedCollisions]);
  const projects = useStored(getStudioProjects) ?? [];
  const runs = useStored(getCreativeRuns) ?? [];
  const storedDiscoveries = useStored(getDiscoveryReports);
  const discoveries = useMemo(() => storedDiscoveries ?? [], [storedDiscoveries]);
  const evidenceCount = live.reduce((sum, item) => sum + (item.evidence?.length ?? 0), 0);
  const edgeCount = useMemo(() => buildCultureEdges(live.filter((item) => item.whyReport), collisions).length, [live, collisions]);
  const latest = live[0];
  const steps = [
    { n: "01", key: "DISCOVER", label: "트렌드 발견", text: "키워드를 입력하거나 지금 뜨는 신호에서 고릅니다.", href: "/discover", icon: Compass },
    { n: "02", key: "UNDERSTAND", label: "문화적 맥락 분석", text: "검색 추이·게시물·웹 출처 근거로 왜 뜨는지 읽습니다.", href: latest ? trendPath(latest.trendId, "why") : "/discover", icon: Orbit },
    { n: "03", key: "DECODE", label: "Trend DNA 분석", text: "감성·감정·행동·사물·문화·사람 6요소로 나눕니다. 선택 단계입니다.", href: latest ? trendPath(latest.trendId, "dna") : "/discover", icon: Atom, optional: true },
    { n: "04", key: "CONNECT", label: "연결과 아이디어", text: "두 트렌드를 섞어 SAFE·BOLD·WILD 아이디어를 찾습니다. 선택 단계입니다.", href: "/collision?mode=creative", icon: Network, optional: true },
    { n: "05", key: "CREATE", label: "콘텐츠 제작", text: "근거가 연결된 카드뉴스·숏폼을 만들고 Figma로 보냅니다.", href: latest ? `/studio?trend=${encodeURIComponent(latest.trendId)}` : "/studio", icon: FlaskConical },
  ];
  return <div className="page edo" data-testid="editorial-overview">
    {/* 01 HERO */}
    <section className="edo-hero" aria-labelledby="edo-hero-title">
      <div className="edo-hero-copy">
        <small className="edo-kicker">TREND RADAR · CULTURAL INTELLIGENCE</small>
        <h1 id="edo-hero-title" className="edo-display"><span className="l1"><span className="m">READ THE</span></span> <span className="l2"><span className="m">SIGNAL.</span></span> <span className="l3"><span className="m">UNDERSTAND</span></span> <span className="l4"><span className="m">THE CULTURE.</span></span></h1>
        <p>지금 움직이는 트렌드를 발견하고, 문화적 맥락을 분석해 새로운 콘텐츠로 완성하세요.</p>
        <div className="edo-ctas"><Link className="button primary" href="/discover" data-testid="edo-start">START DISCOVERY <ArrowRight size={16}/></Link><Link className="button" href="/workspace">OPEN WORKSPACE</Link></div>
        {live.length > 0 && <dl className="edo-numbers" data-testid="edo-numbers"><div><dt>분석한 트렌드</dt><dd><CountUp value={live.length}/></dd></div><div><dt>근거 항목</dt><dd><CountUp value={evidenceCount}/></dd></div><div><dt>근거 있는 연결</dt><dd><CountUp value={edgeCount}/></dd></div><div><dt>아이디어</dt><dd><CountUp value={collisions.reduce((sum, item) => sum + item.result.creativeOpportunities.length, 0) + runs.reduce((sum, run) => sum + run.result.ideas.length, 0)}/></dd></div></dl>}
      </div>
      <aside className="edo-board" aria-label="내 분석 신호" data-testid="edo-signal-board">
        <SignalVisualizer live={live} collisions={collisions} discoveries={discoveries}/>
      </aside>
    </section>

    <Onboarding/>

    <EdSection index="02" kicker="LIVE SIGNALS" title="지금 움직이는 신호" description="Instagram 해시태그 게시 속도와 NAVER 검색 관심도로 지금 주목받는 키워드를 봅니다. 측정·재측정은 버튼을 누를 때만 실행됩니다." testId="edo-live-signals" motion="stagger">
      <div className="edo-stack"><IgPulse/><NowTrending/></div>
    </EdSection>

    <EdSection index="03" kicker="WHAT'S HAPPENING NOW?" title="최근 관측된 문화 현상" description="키워드 안에서 최근 관측된 구체적 현상을 찾습니다. OBSERVED(관측) · EMERGING(초기 신호) · SUGGESTED(근거 부족) 상태를 구분하고, 근거 없는 내용을 유행처럼 표시하지 않습니다." testId="edo-happening" motion="cards">
      <HappeningNow/>
    </EdSection>

    <EdSection id="trend-web" index="04" kicker="EXPLORE CONNECTIONS" title="연결 탐색" description="한 검색 안에서 함께 관측된 키워드·현상·행동의 관계를 미리 봅니다. 노드 선택·관계 분석·저장은 TREND WEB 페이지에서 합니다." testId="edo-connections">
      <TrendWebPreview/>
    </EdSection>

    <EdSection index="05" kicker="HOW IT WORKS" title="TREND RADAR 작업 흐름" description="필요한 단계만 쓰면 됩니다. 단일 트렌드는 01 → 02 → 05, 두 트렌드 결합은 01 → 02 → 03 → 04 → 05로 이어집니다." testId="edo-how">
      <HowItWorks steps={steps}/>
      <p className="edo-paths"><span><b>SINGLE TREND</b> DISCOVER → UNDERSTAND → CREATE</span><span><b>CREATIVE PATH</b> DISCOVER → UNDERSTAND → DECODE → CONNECT → CREATE</span></p>
    </EdSection>

    <EdSection index="06" kicker="FEATURED OUTPUTS" title="최근 만든 콘텐츠" description="Content Studio에서 만든 실제 프로젝트입니다. 예시 결과물은 섞지 않습니다." testId="edo-outputs" motion="mask">
      {projects.length ? <ul className="edo-outputs">{projects.slice(0, 6).map((project) => { const cover = coverOf(project); return <li key={project.id}><Link href={`/studio?project=${encodeURIComponent(project.id)}`} data-testid="edo-output">
        <div className="edo-cover">{cover ? <AssetImage asset={cover} compact/> : <span>{project.plan?.title ?? project.title}</span>}</div>
        <small>{productionFormatLabels[project.settings.format]} · {project.settings.format === "cardnews" ? `${project.plan?.slides.length ?? 0}장` : `${project.settings.durationSec}초`} · {project.mode === "creative" ? "CREATIVE" : "SINGLE"}</small>
        <b>{project.plan?.title ?? project.title}</b><em>수정 {formatDateTime(project.updatedAt)}</em><span className="edo-open">프로젝트 열기 <ArrowRight size={14}/></span>
      </Link></li>; })}</ul>
      : <div className="edo-empty" data-testid="edo-outputs-empty"><b>아직 만든 콘텐츠가 없습니다.</b><p>분석한 트렌드로 Content Studio에서 카드뉴스나 숏폼을 만들면 여기에 모입니다.</p><Link className="button" href={latest ? `/studio?trend=${encodeURIComponent(latest.trendId)}` : "/studio"}>CONTENT STUDIO 열기</Link></div>}
    </EdSection>

    <EdSection id="continue" index="07" kicker="CONTINUE WORKING" title="이어서 작업하기" description="최근 분석·프로젝트·Creative Collision을 한곳에서 다시 엽니다." testId="edo-continue" motion="cards">
      <div className="edo-continue">
        <div><h3>최근 분석</h3>{live.length ? <ul>{live.slice(0, 4).map((item) => <li key={item.id}><Link href={trendPath(item.trendId, "why")}>{item.trendName}</Link><em>{formatDateTime(item.analyzedAt)}</em></li>)}</ul> : <p>아직 없습니다. <Link href="/discover">키워드 분석하기</Link></p>}</div>
        <div><h3>저장된 프로젝트</h3>{projects.length ? <ul>{projects.slice(0, 4).map((project) => <li key={project.id}><Link href={`/studio?project=${encodeURIComponent(project.id)}`}>{project.plan?.title ?? project.title}</Link><em>{formatDateTime(project.updatedAt)}</em></li>)}</ul> : <p>아직 없습니다. <Link href="/studio">Content Studio</Link></p>}</div>
        <div><h3>최근 Creative Collision</h3>{runs.length ? <ul>{runs.slice(0, 4).map((run) => <li key={run.id}><Link href={`/collision?mode=creative&trend=${encodeURIComponent(run.trendKeys[0])}&trend=${encodeURIComponent(run.trendKeys[1])}`}>{run.trendNames.join(" × ")}</Link><em>{formatDateTime(run.updatedAt)}</em></li>)}</ul> : <p>아직 없습니다. <Link href="/collision?mode=creative">두 트렌드 섞어 보기</Link></p>}</div>
        <div className="edo-ws"><h3>Workspace</h3><p>저장한 분석·Collision·기획안·프로젝트를 모두 봅니다. 로그인하면 다른 브라우저에서도 이어집니다.</p><Link className="button" href="/workspace">OPEN WORKSPACE <ArrowRight size={14}/></Link></div>
      </div>
    </EdSection>
  </div>;
}
