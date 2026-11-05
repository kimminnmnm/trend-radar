"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInterfaceStyle } from "@/lib/interface-preferences";
import { Overview } from "./overview";
import { EditorialOverview } from "./editorial-overview";

/**
 * 홈 화면: 선택한 디자인의 Overview를 하나만 그린다(두 화면을 동시에 그리지 않음 — 데이터 모듈이 중복 실행되지 않게).
 * 디자인 선택을 읽기 전 한 프레임은 빈 자리만 둔다.
 * Editorial Web에서는 TREND WEB 전체가 /trend-web으로 옮겨졌다. 예전 주소(/#trend-web, /?trendWeb=세션ID)는 새 페이지로 보낸다.
 * Classic Desktop의 Overview는 그대로(전체 TREND WEB 포함)라 예전 주소가 그대로 동작한다.
 */
export function HomeOverview() {
  const style = useInterfaceStyle();
  const router = useRouter();
  const legacyTrendWeb = style === "editorial" && typeof window !== "undefined" && (window.location.hash === "#trend-web" || new URLSearchParams(window.location.search).has("trendWeb"));
  useEffect(() => {
    if (!legacyTrendWeb) return;
    const session = new URLSearchParams(window.location.search).get("trendWeb");
    router.replace(session ? `/trend-web?trendWeb=${encodeURIComponent(session)}` : "/trend-web");
  }, [legacyTrendWeb, router]);
  if (style === null || legacyTrendWeb) return <div className="page" aria-busy="true"/>;
  return style === "editorial" ? <EditorialOverview/> : <Overview/>;
}
