"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { getDiscoveryReports, getSavedItems, getTrendWebSessions } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { buildTrendWebGraph, isTrendWebPayload, trendWebSessionId, type TrendWebGraph } from "@/lib/trend-web";
import { formatDateTime } from "./ui";

const MAX_NODES = 10;
/** 현상 노드는 이름이 문장이라 미리보기에서는 줄여 보여 준다(전체 이름은 마우스를 올리면). */
const short = (text: string) => text.length > 12 ? `${text.slice(0, 11)}…` : text;
const W = 520, H = 260;

/**
 * Overview의 TREND WEB 미리보기(Editorial Web). 전체 기능은 /trend-web에 있다.
 * TrendWeb 페이지와 같은 저장 데이터(Discovery 보고서 → 같은 그래프 함수, 저장된 세션의 선택)를 읽기만 한다. 분석·저장을 하지 않는다.
 * 노드는 근거 출처 수가 많은 순 최대 10개, 선은 그래프에 실제로 있는 관계만. 데이터가 없으면 안내만 보여 준다.
 */
export function TrendWebPreview() {
  const storedReports = useStored(getDiscoveryReports);
  const storedSessions = useStored(getTrendWebSessions);
  const storedSaved = useStored(getSavedItems);
  const latest = useMemo(() => {
    const sessions = [...(storedSessions ?? []), ...(storedSaved ?? []).flatMap((item) => isTrendWebPayload(item.payload) ? [item.payload.session] : [])];
    const byId = new Map<string, TrendWebGraph>();
    for (const report of storedReports ?? []) byId.set(report.id, buildTrendWebGraph(report));
    for (const session of sessions) if (!byId.has(session.graph.reportId)) byId.set(session.graph.reportId, session.graph);
    const graph = [...byId.values()].sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))[0] ?? null;
    return graph ? { graph, session: sessions.find((item) => item.graph.reportId === graph.reportId) ?? null, count: byId.size } : null;
  }, [storedReports, storedSessions, storedSaved]);

  if (storedReports === null) return <div className="twp" aria-busy="true"/>;
  if (!latest) return <div className="twp twp-empty" data-testid="trend-web-preview-empty">
    <p><b>아직 TREND WEB을 만들 분석이 없습니다.</b> 위의 WHAT&apos;S HAPPENING NOW?에서 키워드의 세부 현상을 찾으면, 함께 관측된 신호가 연결 그래프가 됩니다.</p>
    <div className="edo-ctas"><Link className="button primary" href="/trend-web" data-testid="edo-open-trend-web">EXPLORE TREND WEB <ArrowRight size={14}/></Link><Link className="button" href="/culture-map">CULTURE MAP</Link></div>
  </div>;

  const { graph, session } = latest;
  const selectedIds = new Set(session?.selectedNodeIds ?? []);
  const nodes = [...graph.nodes].sort((a, b) => Number(selectedIds.has(b.id)) - Number(selectedIds.has(a.id)) || b.sourceCount - a.sourceCount).slice(0, MAX_NODES);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  const main = nodes.find((node) => node.keyword === graph.mainKeyword);
  const ring = nodes.filter((node) => node !== main);
  const pos = new Map(nodes.map((node) => {
    if (node === main) return [node.id, { x: W / 2, y: H / 2 }] as const;
    const index = ring.indexOf(node);
    const angle = -Math.PI / 2 + (index / Math.max(ring.length, 1)) * Math.PI * 2;
    return [node.id, { x: W / 2 + Math.cos(angle) * 200, y: H / 2 + Math.sin(angle) * 100 }] as const;
  }));
  const maxSource = Math.max(1, ...nodes.map((node) => node.sourceCount));
  const href = `/trend-web?trendWeb=${encodeURIComponent(trendWebSessionId(graph.reportId))}`;
  return <div className="twp" data-testid="trend-web-preview">
    <div className="twp-head"><small>TREND WEB · {graph.mainKeyword} · {graph.window.from}~{graph.window.to}</small><span>노드 {graph.nodes.length}개 중 {nodes.length}개 · 관계 {edges.length}개{session ? ` · 마지막 탐색 ${formatDateTime(session.updatedAt)}` : ""}</span></div>
    <svg className="twp-net" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${graph.mainKeyword} 연결 신호 미리보기: ${nodes.map((node) => node.keyword).join(", ")}`}>
      {edges.map((edge) => { const a = pos.get(edge.source)!, b = pos.get(edge.target)!; return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`twp-edge ${edge.type === "SEMANTIC_ASSOCIATION" ? "suggested" : "observed"}`}/>; })}
      {nodes.map((node) => { const p = pos.get(node.id)!; const r = 7 + 9 * Math.sqrt(node.sourceCount / maxSource); return <g key={node.id} transform={`translate(${p.x} ${p.y})`} className={`twp-node ${selectedIds.has(node.id) ? "on" : ""} ${node === main ? "main" : ""}`} data-testid="trend-web-preview-node">
        <title>{node.keyword}</title><circle r={r}/><text y={r + 13} textAnchor="middle">{short(node.keyword)}</text>
      </g>; })}
    </svg>
    <ul className="twp-legend"><li><i className="ln"/>관찰된 연결</li><li><i className="ln dash"/>의미상 제안</li><li><i className="dot on"/>탐색 중 선택한 노드</li><li>크기 = 근거 출처 수</li></ul>
    <div className="edo-ctas"><Link className="button primary" href={href} data-testid="edo-open-trend-web">EXPLORE TREND WEB <ArrowRight size={14}/></Link><Link className="button" href="/culture-map">CULTURE MAP</Link><Link className="button" href="/collision?mode=creative">CREATIVE COLLISION</Link></div>
  </div>;
}
