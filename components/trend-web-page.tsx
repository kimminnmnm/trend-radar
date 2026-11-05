"use client";

import { TrendWeb } from "./trend-web";
import { PageHeader } from "./ui";

/**
 * TREND WEB 독립 페이지(/trend-web). 기존 TrendWeb 컴포넌트를 그대로 쓴다 — 그래프 생성·노드 선택·관계 분석·Collision·Studio·Workspace 저장 로직은 같고,
 * 저장 상태(Discovery 보고서, Trend Web 세션, 연결 분석)를 Overview와 공유한다. ?trendWeb=세션ID로 특정 분석을 연다.
 */
export function TrendWebPage() {
  return <div className="page trend-web-page" data-testid="trend-web-page">
    <PageHeader eyebrow="CONNECT / TREND WEB" title="Explore connected signals." description="한 검색(WHAT'S HAPPENING NOW?) 안에서 함께 관측된 키워드·현상·행동·엔티티의 관계를 그래프로 탐색합니다. 관찰된 연결과 의미상 제안을 구분합니다."
      guide={{ what: "Discovery 분석 하나를 골라 연결 신호를 탐색하고, 두 노드의 관계를 분석합니다.", first: "위쪽에서 분석을 고르고 SELECT TWO MODE로 노드 두 개를 선택한 뒤 ANALYZE CONNECTION을 누르세요(누를 때만 API 비용).", next: "관계를 골라 Content Studio로 만들거나 Creative Collision으로 넘기고, SAVE로 Workspace에 저장합니다." }}/>
    <TrendWeb/>
  </div>;
}
