"use client";

import { useEffect, useState } from "react";
import { findPhenomenon, getLiveAnalyses } from "./storage";
import { useStored } from "./use-stored";
import { phenomenonFromQuery, type PhenomenonContext } from "./discovery";
import type { EvidenceItem } from "./schemas";

/**
 * T5: WHY 화면이 분석할 "선택한 현상" 맥락.
 * 주소(?phenomenon=…)가 우선이고, 없으면 이 trendId로 저장된 현상 분석의 리포트에서 복원한다(새로고침·페이지 이동·Workspace·클라우드 복원).
 * 둘 다 없으면 null → 기존 키워드 분석 그대로.
 */
export function usePhenomenonContext(trendId: string): { context: PhenomenonContext | null; evidence: EvidenceItem[]; ready: boolean } {
  const [fromUrl, setFromUrl] = useState<{ value: PhenomenonContext | null } | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFromUrl({ value: phenomenonFromQuery(new URLSearchParams(window.location.search)) }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const snapshots = useStored(getLiveAnalyses);
  const saved = snapshots?.find((item) => item.trendId === trendId)?.whyReport?.phenomenon?.context ?? null;
  const context = fromUrl?.value ?? saved;
  // 발견 단계 근거(재사용용): 저장된 발견 결과나 Workspace에 저장한 현상에서만 가져온다. 없으면 빈 배열(지어내지 않음).
  const evidence = context ? findPhenomenon(context.phenomenonId)?.evidence ?? [] : [];
  return { context, evidence, ready: fromUrl !== null && snapshots !== null };
}
