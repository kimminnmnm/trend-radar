"use client";

import { isPlanPayload } from "@/lib/saved-items-cloud";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { isStudioProjectPayload } from "@/lib/content-production";
import { getCollisions, getLiveAnalyses, getSavedItems, getStudioProjects } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { isLiveTrendId, keywordFromLiveId, safeDecode, trendPath } from "@/lib/live-trend";
import { resolveTrend } from "@/lib/demo-data";

const HIDDEN = ["/auth", "/settings", "/instagram"];
/** 여러 트렌드를 섞는 경로의 화면. 여기서는 "다음"이 섞어 보기 → 제작 순서를 따른다. */
const CREATIVE_PATHS = ["/collision", "/lab"];

/**
 * 모든 화면 상단의 분석 진행 막대: 지금 보고 있는 트렌드, 진행 상태, 다음 단계 버튼.
 * V4: 기본 경로는 찾기 → WHY → 콘텐츠 만들기. DNA·섞어 보기는 선택 단계라 "다음"이 강요하지 않는다
 * (섞기 화면에 있을 때만 섞어 보기 → 제작 순서). 제작 완료는 이전 기획안과 Studio 제작 프로젝트를 모두 센다.
 * DEMO 트렌드를 보고 있으면 실제 분석이 아님을 알리고 Discover로 안내한다.
 */
export function JourneyBar() {
  const pathname = usePathname();
  const live = useStored(getLiveAnalyses);
  const collisions = useStored(getCollisions) ?? [];
  const saved = useStored(getSavedItems) ?? [];
  const projects = useStored(getStudioProjects) ?? [];
  if (HIDDEN.includes(pathname) || live === null) return null;

  const match = pathname.match(/^\/trends\/([^/]+)\/(why|dna)$/);
  const routeId = match ? safeDecode(match[1]) : null;
  if (routeId && !isLiveTrendId(routeId)) {
    const demo = resolveTrend(routeId);
    return <nav className="journey demo" aria-label="분석 진행 상황" data-testid="journey-bar">
      <div className="journey-now"><span className="pill demo">DEMO</span><p><b>{demo?.name ?? routeId}</b>은(는) 예시 데이터입니다. 실제 검색·인스타그램 데이터로 분석한 결과가 아닙니다.</p></div>
      <Link className="button primary" href="/discover">내 키워드로 실제 분석하기 <ArrowRight size={14}/></Link>
    </nav>;
  }

  const current = routeId ? live.find((item) => item.trendId === routeId) ?? null : live[0] ?? null;
  const id = current?.trendId ?? routeId;
  if (!id) return <nav className="journey empty" aria-label="분석 진행 상황" data-testid="journey-bar">
    <div className="journey-now"><span className="pill">시작 전</span><p>아직 분석한 트렌드가 없습니다. 궁금한 키워드를 입력하면 <b>검색 추이 · 인스타그램 · 뉴스</b> 근거로 왜 뜨는지 분석합니다.</p></div>
    <Link className="button primary" href="/discover">첫 키워드 분석하기 <ArrowRight size={14}/></Link>
  </nav>;

  const name = current?.trendName ?? keywordFromLiveId(id);
  const produced = saved.some((item) => (isPlanPayload(item.payload) && item.payload.trendKeys.includes(id)) || (isStudioProjectPayload(item.payload) && item.payload.project.source.trendKeys.includes(id)))
    || projects.some((project) => project.source.trendKeys.includes(id));
  const collided = collisions.some((item) => item.trendKeys.includes(id));
  const creativePath = CREATIVE_PATHS.includes(pathname);
  const steps = [
    { key: "discover", label: "① 찾기", href: "/discover", done: true, active: pathname === "/discover", optional: false },
    { key: "why", label: "② 왜 뜨나", href: trendPath(id, "why"), done: Boolean(current?.whyReport), active: pathname.endsWith("/why"), optional: false },
    // 번호는 기능의 논리적 순서다(필수 완료 조건 아님). DNA·섞어 보기는 선택 단계 — 건너뛰고 ⑤로 바로 갈 수 있다.
    { key: "dna", label: "③ DNA 분해", href: trendPath(id, "dna"), done: Boolean(current?.dna), active: pathname.endsWith("/dna"), optional: true },
    { key: "collision", label: "④ 섞어 보기", href: "/collision", done: collided, active: pathname === "/collision", optional: true },
    { key: "studio", label: "⑤ 콘텐츠 만들기", href: `/studio?trend=${encodeURIComponent(id)}`, done: produced, active: pathname === "/studio", optional: false },
  ];
  const order = creativePath ? ["why", "collision", "studio"] : ["why", "studio"];
  const next = order.map((key) => steps.find((step) => step.key === key)!).find((step) => !step.done);
  const nextLabel: Record<string, string> = { why: "WHY 분석 실행", collision: "다른 트렌드와 섞어 보기", studio: "이 트렌드로 콘텐츠 만들기" };
  return <nav className="journey" aria-label="분석 진행 상황" data-testid="journey-bar">
    <div className="journey-now"><span className="pill live">분석 중</span><p><b data-testid="journey-trend">{name}</b>{current ? "" : " · 아직 WHY 분석 전"}</p></div>
    <ol>{steps.map((step) => <li key={step.key} className={`${step.done ? "done" : ""} ${step.active ? "active" : ""} ${step.optional ? "optional" : ""}`} title={step.optional ? "선택 단계 — 건너뛰어도 콘텐츠를 만들 수 있습니다" : undefined}><Link href={step.href} aria-current={step.active ? "step" : undefined}>{step.done && <Check size={12}/>}{step.label}{step.optional && <small className="opt"> · 선택</small>}</Link></li>)}</ol>
    {next ? <div className="journey-next-wrap"><Link className="button primary" href={next.href} data-testid="journey-next">다음: {nextLabel[next.key]} <ArrowRight size={14}/></Link>{next.key === "studio" && !creativePath && !collided && <Link className="journey-alt" href="/collision" data-testid="journey-alt">또는 다른 트렌드와 섞어 보기(선택)</Link>}</div>
      : <span className="all-done" data-testid="journey-done">{creativePath ? "섞어 보기와 콘텐츠 제작을 마쳤습니다" : "이 트렌드로 콘텐츠를 만들었습니다"}</span>}
  </nav>;
}
