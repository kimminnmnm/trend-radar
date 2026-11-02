"use client";

import { isPlanPayload } from "@/lib/saved-items-cloud";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { getCollisions, getLiveAnalyses, getSavedItems } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { isLiveTrendId, keywordFromLiveId, safeDecode, trendPath } from "@/lib/live-trend";
import { resolveTrend } from "@/lib/demo-data";

const HIDDEN = ["/auth", "/settings", "/instagram"];

/**
 * 모든 화면 상단의 분석 진행 막대: 지금 보고 있는 트렌드, Discover → WHY → DNA → Collision → Studio 진행 상태, 다음 단계 버튼.
 * DEMO 트렌드를 보고 있으면 실제 분석이 아님을 알리고 Discover로 안내한다.
 */
export function JourneyBar() {
  const pathname = usePathname();
  const live = useStored(getLiveAnalyses);
  const collisions = useStored(getCollisions) ?? [];
  const saved = useStored(getSavedItems) ?? [];
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
  const steps = [
    { key: "discover", label: "① 찾기", href: "/discover", done: true, active: pathname === "/discover" },
    { key: "why", label: "② 왜 뜨나", href: trendPath(id, "why"), done: Boolean(current?.whyReport), active: pathname.endsWith("/why") },
    { key: "dna", label: "③ DNA 분해", href: trendPath(id, "dna"), done: Boolean(current?.dna), active: pathname.endsWith("/dna") },
    { key: "collision", label: "④ 섞어 보기", href: "/collision", done: collisions.some((item) => item.trendKeys.includes(id)), active: pathname === "/collision" },
    { key: "studio", label: "⑤ 기획안", href: "/studio", done: saved.some((item) => isPlanPayload(item.payload) && item.payload.trendKeys.includes(id)), active: pathname === "/studio" },
  ];
  const next = steps.find((step) => !step.done);
  const nextLabel: Record<string, string> = { why: "WHY 분석 실행", dna: "DNA 분해하기", collision: "다른 트렌드와 섞어 보기", studio: "콘텐츠 기획안 만들기" };
  return <nav className="journey" aria-label="분석 진행 상황" data-testid="journey-bar">
    <div className="journey-now"><span className="pill live">분석 중</span><p><b data-testid="journey-trend">{name}</b>{current ? "" : " · 아직 WHY 분석 전"}</p></div>
    <ol>{steps.map((step) => <li key={step.key} className={`${step.done ? "done" : ""} ${step.active ? "active" : ""}`}><Link href={step.href} aria-current={step.active ? "step" : undefined}>{step.done && <Check size={12}/>}{step.label}</Link></li>)}</ol>
    {next ? <Link className="button primary" href={next.href} data-testid="journey-next">다음: {nextLabel[next.key]} <ArrowRight size={14}/></Link> : <span className="all-done">모든 단계를 완료했습니다</span>}
  </nav>;
}
